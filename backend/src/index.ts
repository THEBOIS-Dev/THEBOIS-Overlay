import { Hono } from 'hono';
import { cors } from 'hono/cors';

interface Env {
  ALERTS_KV: KVNamespace;
  ADMIN_PASSWORD: string;
  DISCORD_CLIENT_ID: string;
  DISCORD_CLIENT_SECRET: string;
  DISCORD_WEBHOOK_URL: string;
  TELEMETRY_ADMIN_KEY: string;
}

const ACTIVE_ALERT_KEY = 'state:active_alert';
const ACTIVE_CHANGELOG_KEY = 'state:active_changelog';
const ALERT_PREFIX = 'alert:';
const CHANGELOG_PREFIX = 'changelog:';
const SESSION_PREFIX = 'session:';
const RATELIMIT_PREFIX = 'ratelimit:';
const SESSION_TTL_S = 60 * 60 * 24;
const RATELIMIT_WINDOW = 60 * 15;
const RATELIMIT_MAX = 5;
interface Alert {
  id: string;
  type: 'info' | 'warning' | 'update' | 'maintenance';
  title: string;
  content: string;
  createdAt: number;
  active: boolean;
}

interface Changelog {
  id: string;
  version: string;
  date: string;
  title: string;
  content: string;
  createdAt: number;
  active: boolean;
}

interface RateLimitRecord {
  count: number;
  windowStart: number;
}

async function timingSafeEquals(a: string, b: string): Promise<boolean> {
  const enc = new TextEncoder();
  const [ha, hb] = await Promise.all([
    crypto.subtle.digest('SHA-256', enc.encode(a)),
    crypto.subtle.digest('SHA-256', enc.encode(b)),
  ]);
  const ba = new Uint8Array(ha);
  const bb = new Uint8Array(hb);
  let diff = 0;
  for (let i = 0; i < ba.length; i++) diff |= (ba[i] ?? 0) ^ (bb[i] ?? 0);
  return diff === 0;
}
function generateToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}
function generateId(): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return `${Date.now()}-${Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')}`;
}
function parseSessionCookie(header: string | null): string | null {
  if (!header) return null;
  const match2 = header.match(/(?:^|;\s*)session=([a-f0-9]{64})/);
  return match2?.[1] ?? null;
}
async function validateSession(kv: KVNamespace, token: string): Promise<boolean> {
  if (!/^[a-f0-9]{64}$/.test(token)) return false;
  const val = await kv.get(`${SESSION_PREFIX}${token}`);
  return val === '1';
}
async function createSession(kv: KVNamespace): Promise<string> {
  const token = generateToken();
  await kv.put(`${SESSION_PREFIX}${token}`, '1', { expirationTtl: SESSION_TTL_S });
  return token;
}
async function destroySession(kv: KVNamespace, token: string): Promise<void> {
  await kv.delete(`${SESSION_PREFIX}${token}`);
}
function sessionCookieHeader(token: string, maxAge: number): string {
  return `session=${token}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${maxAge}`;
}
async function requireSession(
  kv: KVNamespace,
  cookieHeader: string | null,
): Promise<boolean> {
  const token = parseSessionCookie(cookieHeader);
  if (!token) return false;
  return validateSession(kv, token);
}
async function checkRateLimit(kv: KVNamespace, ip: string): Promise<boolean> {
  const key = `${RATELIMIT_PREFIX}${ip}`;
  const raw2 = await kv.get(key);
  const now = Math.floor(Date.now() / 1e3);
  if (!raw2) return true;
  const rl = JSON.parse(raw2) as RateLimitRecord;
  if (now - rl.windowStart >= RATELIMIT_WINDOW) return true;
  return rl.count < RATELIMIT_MAX;
}
async function recordFailedAttempt(kv: KVNamespace, ip: string): Promise<void> {
  const key = `${RATELIMIT_PREFIX}${ip}`;
  const raw2 = await kv.get(key);
  const now = Math.floor(Date.now() / 1e3);
  let rl: RateLimitRecord;
  if (!raw2) {
    rl = { count: 1, windowStart: now };
  } else {
    rl = JSON.parse(raw2) as RateLimitRecord;
    if (now - rl.windowStart >= RATELIMIT_WINDOW) {
      rl = { count: 1, windowStart: now };
    } else {
      rl.count += 1;
    }
  }
  await kv.put(key, JSON.stringify(rl), { expirationTtl: RATELIMIT_WINDOW + 60 });
}
async function clearRateLimit(kv: KVNamespace, ip: string): Promise<void> {
  await kv.delete(`${RATELIMIT_PREFIX}${ip}`);
}
async function getActiveAlert(kv: KVNamespace): Promise<Alert | null> {
  const id = await kv.get(ACTIVE_ALERT_KEY);
  if (!id) return null;
  const raw2 = await kv.get(`${ALERT_PREFIX}${id}`);
  if (!raw2) return null;
  const a = JSON.parse(raw2) as Alert;
  return a.active ? a : null;
}
async function getActiveChangelog(kv: KVNamespace): Promise<Changelog | null> {
  const id = await kv.get(ACTIVE_CHANGELOG_KEY);
  if (!id) return null;
  const raw2 = await kv.get(`${CHANGELOG_PREFIX}${id}`);
  if (!raw2) return null;
  const c = JSON.parse(raw2) as Changelog;
  return c.active ? c : null;
}
async function listAlerts(kv: KVNamespace): Promise<Alert[]> {
  const list = await kv.list({ prefix: ALERT_PREFIX });
  const items: Alert[] = [];
  for (const key of list.keys) {
    const raw2 = await kv.get(key.name);
    if (raw2) items.push(JSON.parse(raw2) as Alert);
  }
  return items.sort((a, b) => b.createdAt - a.createdAt);
}
async function listChangelogs(kv: KVNamespace): Promise<Changelog[]> {
  const list = await kv.list({ prefix: CHANGELOG_PREFIX });
  const items: Changelog[] = [];
  for (const key of list.keys) {
    const raw2 = await kv.get(key.name);
    if (raw2) items.push(JSON.parse(raw2) as Changelog);
  }
  return items.sort((a, b) => b.createdAt - a.createdAt);
}
function getDashboardHtml() {
  return `<!DOCTYPE html>
  <html lang="en" data-theme="dark">
  <head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Overlay Dashboard</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&family=Syne:wght@600;700;800&family=Geist:wght@300;400;500;600&display=swap" rel="stylesheet">
  <script src="https://cdn.jsdelivr.net/npm/marked@14.1.4/marked.min.js"><\/script>
  <style>
  *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}

  :root{
    --bg:#000000;
    --bg2:#080810;
    --surf:rgba(255,255,255,0.035);
    --surf-h:rgba(255,255,255,0.06);
    --surf-act:rgba(124,58,237,0.09);
    --border:rgba(255,255,255,0.07);
    --border-h:rgba(255,255,255,0.13);
    --border-acc:rgba(124,58,237,0.45);
    --acc:#7c3aed;
    --acc-l:#a78bfa;
    --acc-xl:#c4b5fd;
    --acc-dim:rgba(124,58,237,0.14);
    --acc-glow:rgba(124,58,237,0.32);
    --acc-glow2:rgba(124,58,237,0.18);
    --ink1:rgba(255,255,255,0.92);
    --ink2:rgba(255,255,255,0.5);
    --ink3:rgba(255,255,255,0.2);
    --ink4:rgba(255,255,255,0.09);
    --good:#34d399;
    --good-d:rgba(52,211,153,0.14);
    --warn:#fbbf24;
    --bad:#f87171;
    --info:#60a5fa;
    --topbar:rgba(0,0,0,0.55);
    --card-sh:0 0 0 1px rgba(255,255,255,0.04) inset,0 24px 64px rgba(0,0,0,0.5),0 0 0 1px rgba(124,58,237,0.06);
    --card-sh-h:0 0 0 1px rgba(255,255,255,0.07) inset,0 28px 80px rgba(0,0,0,0.55),0 0 40px rgba(124,58,237,0.08);
    --ma:rgba(124,58,237,0.18);
    --mb:rgba(59,130,246,0.1);
    --mc:rgba(236,72,153,0.08);
    --font-head:'Syne',sans-serif;
    --font-body:'Geist',sans-serif;
    --font-mono:'DM Mono',monospace;
  }

  [data-theme="light"]{
    --bg:#ffffff;
    --bg2:#f5f5fa;
    --surf:rgba(0,0,0,0.028);
    --surf-h:rgba(0,0,0,0.05);
    --surf-act:rgba(109,40,217,0.05);
    --border:rgba(0,0,0,0.07);
    --border-h:rgba(0,0,0,0.13);
    --border-acc:rgba(109,40,217,0.35);
    --acc:#6d28d9;
    --acc-l:#7c3aed;
    --acc-xl:#6d28d9;
    --acc-dim:rgba(109,40,217,0.09);
    --acc-glow:rgba(109,40,217,0.22);
    --acc-glow2:rgba(109,40,217,0.12);
    --ink1:rgba(0,0,0,0.88);
    --ink2:rgba(0,0,0,0.48);
    --ink3:rgba(0,0,0,0.28);
    --ink4:rgba(0,0,0,0.07);
    --good:#059669;
    --good-d:rgba(5,150,105,0.1);
    --warn:#d97706;
    --bad:#dc2626;
    --info:#2563eb;
    --topbar:rgba(255,255,255,0.65);
    --card-sh:0 0 0 1px rgba(0,0,0,0.04) inset,0 8px 40px rgba(0,0,0,0.07),0 0 0 1px rgba(109,40,217,0.04);
    --card-sh-h:0 0 0 1px rgba(0,0,0,0.06) inset,0 14px 56px rgba(0,0,0,0.11),0 0 30px rgba(109,40,217,0.06);
    --ma:rgba(109,40,217,0.07);
    --mb:rgba(59,130,246,0.05);
    --mc:rgba(236,72,153,0.04);
  }

  html{transition:background 0.4s ease,color 0.4s ease}

  body{
    background:var(--bg);
    color:var(--ink1);
    font-family:var(--font-body);
    font-size:14px;
    -webkit-font-smoothing:antialiased;
    line-height:1.55;
    min-height:100vh;
    transition:background 0.4s ease,color 0.4s ease;
    overflow-x:hidden;
    position:relative;
  }

  body::before{
    content:'';
    position:fixed;
    inset:0;
    background:
    radial-gradient(ellipse 90% 70% at 5% 5%,var(--ma) 0%,transparent 55%),
    radial-gradient(ellipse 65% 85% at 95% 95%,var(--mb) 0%,transparent 55%),
    radial-gradient(ellipse 75% 55% at 55% 45%,var(--mc) 0%,transparent 65%);
    animation:meshDrift 28s ease-in-out infinite alternate;
    pointer-events:none;
    z-index:0;
    transition:opacity 0.4s;
  }

  @keyframes meshDrift{
    0%{transform:scale(1) rotate(0deg) translate(0,0)}
    20%{transform:scale(1.04) rotate(1.2deg) translate(0.8%,0.5%)}
    45%{transform:scale(0.97) rotate(-0.8deg) translate(-0.6%,0.8%)}
    70%{transform:scale(1.03) rotate(1.5deg) translate(0.4%,-0.6%)}
    100%{transform:scale(1.05) rotate(-1deg) translate(-0.4%,0.6%)}
  }

  body::after{
    content:'';
    position:fixed;
    inset:0;
    background-image:url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='1'/%3E%3C/svg%3E");
    opacity:0.018;
    pointer-events:none;
    z-index:0;
    mix-blend-mode:overlay;
  }

  [data-theme="light"] body::after{opacity:0.012}

  .page-wrap,.login-wrap{position:relative;z-index:1}

  .hidden{display:none!important}

  .topbar{
    display:flex;
    align-items:center;
    gap:10px;
    padding:0 24px;
    height:56px;
    border-bottom:1px solid var(--border);
    background:var(--topbar);
    backdrop-filter:blur(24px) saturate(180%);
    -webkit-backdrop-filter:blur(24px) saturate(180%);
    position:sticky;
    top:0;
    z-index:100;
    flex-shrink:0;
    transition:background 0.4s;
  }

  .topbar-logo{display:flex;align-items:center;gap:10px}

  .logo-mark{
    width:30px;
    height:30px;
    border-radius:9px;
    background:var(--acc-dim);
    border:1px solid rgba(124,58,237,0.28);
    display:flex;
    align-items:center;
    justify-content:center;
    color:var(--acc-l);
    animation:logoPulse 4s ease-in-out infinite;
    flex-shrink:0;
  }

  @keyframes logoPulse{
    0%,100%{box-shadow:0 0 0 0 var(--acc-glow2)}
    50%{box-shadow:0 0 0 6px transparent,0 0 18px var(--acc-glow)}
  }

  .logo-name{
    font-family:var(--font-head);
    font-size:15px;
    font-weight:800;
    letter-spacing:-0.02em;
    background:linear-gradient(135deg,var(--ink1) 0%,var(--acc-l) 100%);
    -webkit-background-clip:text;
    -webkit-text-fill-color:transparent;
    background-clip:text;
  }

  .topbar-sep{flex:1}

  .live-pill{
    display:flex;
    align-items:center;
    gap:6px;
    font-size:11px;
    font-weight:600;
    font-family:var(--font-mono);
    color:var(--good);
    background:var(--good-d);
    border:1px solid rgba(52,211,153,0.2);
    border-radius:20px;
    padding:4px 10px;
    letter-spacing:0.03em;
  }

  [data-theme="light"] .live-pill{border-color:rgba(5,150,105,0.2)}

  .live-dot{
    width:6px;
    height:6px;
    border-radius:50%;
    background:var(--good);
    animation:livePulse 2s ease-in-out infinite;
  }

  @keyframes livePulse{
    0%,100%{box-shadow:0 0 0 0 var(--good);opacity:1}
    50%{box-shadow:0 0 0 4px transparent;opacity:0.8}
  }

  .theme-toggle{
    width:34px;
    height:34px;
    border-radius:9px;
    border:1px solid var(--border);
    background:var(--surf);
    color:var(--ink2);
    display:flex;
    align-items:center;
    justify-content:center;
    cursor:pointer;
    transition:background 0.18s,border-color 0.18s,color 0.18s,transform 0.18s;
  }

  .theme-toggle:hover{background:var(--surf-h);border-color:var(--border-h);color:var(--ink1);transform:rotate(15deg)}

  .theme-icon{font-size:15px;line-height:1;transition:transform 0.35s cubic-bezier(0.34,1.56,0.64,1)}

  .logout-btn{
    display:flex;
    align-items:center;
    gap:6px;
    font-size:12px;
    font-weight:600;
    font-family:var(--font-body);
    color:var(--ink2);
    background:var(--surf);
    border:1px solid var(--border);
    border-radius:9px;
    padding:6px 13px;
    cursor:pointer;
    transition:all 0.18s;
  }

  .logout-btn:hover{color:var(--bad);border-color:rgba(248,113,113,0.3);background:rgba(248,113,113,0.06)}

  .main{
    flex:1;
    padding:28px 24px;
    max-width:980px;
    margin:0 auto;
    width:100%;
    display:flex;
    flex-direction:column;
    gap:20px;
  }

  .tabs{
    display:flex;
    gap:2px;
    padding:3px;
    background:var(--surf);
    border:1px solid var(--border);
    border-radius:12px;
    width:fit-content;
    position:relative;
    backdrop-filter:blur(12px);
  }

  .tab-pill{
    position:absolute;
    top:3px;
    height:calc(100% - 6px);
    background:var(--acc-dim);
    border:1px solid var(--border-acc);
    border-radius:9px;
    transition:left 0.3s cubic-bezier(0.34,1.56,0.64,1),width 0.3s cubic-bezier(0.34,1.56,0.64,1);
    box-shadow:0 0 16px var(--acc-glow2),inset 0 0 8px var(--acc-glow2);
    pointer-events:none;
  }

  .tab{
    font-size:12.5px;
    font-weight:600;
    font-family:var(--font-body);
    padding:7px 16px;
    border-radius:9px;
    border:none;
    background:transparent;
    color:var(--ink3);
    cursor:pointer;
    transition:color 0.2s;
    letter-spacing:0.01em;
    display:flex;
    align-items:center;
    gap:7px;
    position:relative;
    z-index:1;
    white-space:nowrap;
  }

  .tab.active{color:var(--acc-l)}
  .tab:not(.active):hover{color:var(--ink2)}

  .tab-panel{display:none;flex-direction:column;gap:18px}
  .tab-panel.active{display:flex}

  .card{
    background:var(--surf);
    border:1px solid var(--border);
    border-radius:16px;
    overflow:hidden;
    box-shadow:var(--card-sh);
    backdrop-filter:blur(16px);
    -webkit-backdrop-filter:blur(16px);
    transition:box-shadow 0.25s,border-color 0.25s,transform 0.25s;
  }

  .card:hover{
    box-shadow:var(--card-sh-h);
    border-color:var(--border-h);
    transform:translateY(-1px);
  }

  .card-head{
    padding:13px 18px;
    border-bottom:1px solid var(--border);
    display:flex;
    align-items:center;
    gap:10px;
    background:var(--ink4);
  }

  .card-icon{
    width:26px;
    height:26px;
    border-radius:7px;
    display:flex;
    align-items:center;
    justify-content:center;
    background:var(--acc-dim);
    border:1px solid rgba(124,58,237,0.22);
    color:var(--acc-l);
    flex-shrink:0;
  }

  .card-title{
    font-family:var(--font-head);
    font-size:11.5px;
    font-weight:700;
    letter-spacing:0.06em;
    text-transform:uppercase;
    color:var(--ink2);
    flex:1;
  }

  .card-body{padding:18px}

  .empty-state{
    display:flex;
    align-items:center;
    gap:10px;
    padding:14px;
    background:var(--surf);
    border:1px solid var(--border);
    border-radius:10px;
    color:var(--ink3);
  }

  .empty-state span{font-size:12.5px}

  .active-item{
    background:var(--surf);
    border:1px solid var(--border);
    border-radius:12px;
    overflow:hidden;
    position:relative;
  }

  .active-item::before{
    content:'';
    position:absolute;
    top:0;
    left:0;
    right:0;
    height:2px;
    background:linear-gradient(90deg,transparent,var(--acc-l),transparent);
    opacity:0.7;
  }

  .active-item-head{
    display:flex;
    align-items:center;
    gap:9px;
    padding:11px 14px;
    border-bottom:1px solid var(--border);
  }

  .type-dot{
    width:8px;
    height:8px;
    border-radius:50%;
    flex-shrink:0;
  }

  .active-item-title{
    font-size:13px;
    font-weight:600;
    font-family:var(--font-body);
    color:var(--ink1);
    flex:1;
    min-width:0;
    overflow:hidden;
    text-overflow:ellipsis;
    white-space:nowrap;
  }

  .active-item-meta{font-size:10.5px;color:var(--ink3);flex-shrink:0;font-family:var(--font-mono)}

  .active-item-ver{
    font-size:10.5px;
    font-family:var(--font-mono);
    color:var(--acc-l);
    background:var(--acc-dim);
    border:1px solid rgba(124,58,237,0.25);
    border-radius:5px;
    padding:2px 8px;
    flex-shrink:0;
  }

  .active-item-body{padding:14px;max-height:200px;overflow-y:auto}

  .active-item-foot{
    display:flex;
    align-items:center;
    justify-content:space-between;
    padding:9px 14px;
    border-top:1px solid var(--border);
    background:var(--ink4);
  }

  .id-mono{font-size:10px;color:var(--ink3);font-family:var(--font-mono);letter-spacing:0.02em}

  .type-tag{
    font-size:10px;
    font-weight:700;
    font-family:var(--font-mono);
    text-transform:uppercase;
    letter-spacing:0.07em;
    padding:2px 8px;
    border-radius:5px;
    border:1px solid transparent;
    flex-shrink:0;
  }

  .form-row{display:flex;gap:12px;align-items:flex-start}

  .form-group{display:flex;flex-direction:column;gap:5px;flex:1}

  .form-label{
    font-size:10.5px;
    font-weight:700;
    font-family:var(--font-head);
    color:var(--ink2);
    letter-spacing:0.05em;
    text-transform:uppercase;
  }

  .form-input,.form-select{
    background:var(--surf);
    border:1px solid var(--border);
    border-radius:9px;
    padding:9px 12px;
    color:var(--ink1);
    font-size:13px;
    font-family:var(--font-body);
    outline:none;
    transition:border-color 0.18s,box-shadow 0.18s,background 0.18s;
    width:100%;
    backdrop-filter:blur(8px);
  }

  .form-input:focus,.form-select:focus{
    border-color:var(--border-acc);
    box-shadow:0 0 0 3px var(--acc-glow2),0 0 16px var(--acc-glow2);
    background:var(--surf-act);
  }

  .form-input::placeholder{color:var(--ink3)}

  .form-select option{background:var(--bg);color:var(--ink1)}

  .editor-wrap{
    border:1px solid var(--border);
    border-radius:12px;
    overflow:hidden;
    display:grid;
    grid-template-columns:1fr 1fr;
    transition:border-color 0.18s;
  }

  .editor-wrap:focus-within{border-color:var(--border-acc);box-shadow:0 0 0 3px var(--acc-glow2)}

  .editor-pane{display:flex;flex-direction:column}

  .editor-label{
    font-size:10px;
    font-weight:700;
    font-family:var(--font-mono);
    text-transform:uppercase;
    letter-spacing:0.08em;
    color:var(--ink3);
    padding:7px 12px;
    border-bottom:1px solid var(--border);
    background:var(--ink4);
  }

  .editor-pane:first-child .editor-label{border-right:1px solid var(--border)}

  .editor-pane:first-child{
    border-right:1px solid var(--border);
    position:relative;
  }

  .editor-pane:first-child::after{
    content:'';
    position:absolute;
    top:0;
    right:-1px;
    width:1px;
    height:100%;
    background:linear-gradient(180deg,transparent,var(--acc),transparent);
    opacity:0.4;
    pointer-events:none;
  }

  textarea.editor-ta{
    flex:1;
    background:transparent;
    border:none;
    padding:12px;
    color:var(--ink1);
    font-size:12.5px;
    font-family:var(--font-mono);
    line-height:1.65;
    resize:none;
    outline:none;
    min-height:240px;
    caret-color:var(--acc-l);
  }

  .editor-preview{
    padding:12px 14px;
    min-height:240px;
    overflow-y:auto;
    font-size:12.5px;
    line-height:1.65;
    color:var(--ink2);
  }

  .form-actions{display:flex;justify-content:flex-end;margin-top:14px}

  .btn{
    display:inline-flex;
    align-items:center;
    gap:7px;
    font-size:12.5px;
    font-weight:600;
    font-family:var(--font-body);
    padding:9px 18px;
    border-radius:9px;
    border:1px solid transparent;
    cursor:pointer;
    letter-spacing:0.01em;
    transition:all 0.18s cubic-bezier(0.34,1.56,0.64,1);
    position:relative;
    overflow:hidden;
  }

  .btn::before{
    content:'';
    position:absolute;
    inset:0;
    background:linear-gradient(135deg,rgba(255,255,255,0.06),transparent);
    opacity:0;
    transition:opacity 0.18s;
  }

  .btn:hover::before{opacity:1}

  .btn-primary{
    background:var(--acc-dim);
    border-color:rgba(124,58,237,0.4);
    color:var(--acc-xl);
  }

  .btn-primary:hover{
    background:rgba(124,58,237,0.25);
    border-color:rgba(124,58,237,0.65);
    box-shadow:0 0 22px var(--acc-glow),0 4px 16px var(--acc-glow2);
    transform:translateY(-1px);
  }

  .btn-primary:disabled{opacity:0.4;cursor:not-allowed;transform:none;box-shadow:none}

  .btn-danger{
    background:rgba(248,113,113,0.07);
    border-color:rgba(248,113,113,0.25);
    color:#fca5a5;
    font-size:12px;
    padding:6px 14px;
  }

  .btn-danger:hover{background:rgba(248,113,113,0.16);border-color:rgba(248,113,113,0.45);box-shadow:0 0 14px rgba(248,113,113,0.2)}

  .btn-danger:disabled{opacity:0.4;cursor:not-allowed}

  .hist-list{display:flex;flex-direction:column;gap:6px}

  .hist-item{
    display:flex;
    align-items:center;
    gap:10px;
    padding:10px 14px;
    background:var(--surf);
    border:1px solid var(--border);
    border-radius:10px;
    transition:all 0.2s;
    cursor:default;
  }

  .hist-item:hover{
    background:var(--surf-h);
    border-color:var(--border-h);
    transform:translateX(3px);
  }

  .hist-item.is-live{border-color:var(--border-acc);background:var(--surf-act)}

  .hist-title{
    font-size:12.5px;
    font-weight:600;
    color:var(--ink1);
    flex:1;
    min-width:0;
    overflow:hidden;
    text-overflow:ellipsis;
    white-space:nowrap;
  }

  .hist-date{font-size:10.5px;color:var(--ink3);flex-shrink:0;font-family:var(--font-mono)}

  .hist-ver{
    font-size:10.5px;
    font-family:var(--font-mono);
    color:var(--ink3);
    background:var(--surf);
    border:1px solid var(--border);
    border-radius:4px;
    padding:1px 7px;
    flex-shrink:0;
  }

  .live-badge{
    font-size:10px;
    font-weight:700;
    font-family:var(--font-mono);
    color:var(--good);
    display:flex;
    align-items:center;
    gap:4px;
    flex-shrink:0;
  }

  .live-badge::before{
    content:'';
    width:5px;
    height:5px;
    border-radius:50%;
    background:var(--good);
    animation:livePulse 2s ease-in-out infinite;
  }

  .hist-empty{font-size:12.5px;color:var(--ink3);text-align:center;padding:24px;font-family:var(--font-mono)}

  ::-webkit-scrollbar{width:5px;height:5px}
  ::-webkit-scrollbar-track{background:transparent}
  ::-webkit-scrollbar-thumb{background:var(--acc-dim);border-radius:3px}
  ::-webkit-scrollbar-thumb:hover{background:var(--acc-glow2)}

  .login-wrap{
    min-height:100vh;
    display:flex;
    align-items:center;
    justify-content:center;
    position:relative;
  }

  .login-aurora{
    position:absolute;
    inset:0;
    overflow:hidden;
    pointer-events:none;
  }

  .login-aurora::before{
    content:'';
    position:absolute;
    top:-30%;
    left:-20%;
    width:80%;
    height:80%;
    background:radial-gradient(ellipse,rgba(124,58,237,0.22) 0%,transparent 60%);
    animation:auroraA 12s ease-in-out infinite alternate;
  }

  .login-aurora::after{
    content:'';
    position:absolute;
    bottom:-30%;
    right:-20%;
    width:70%;
    height:70%;
    background:radial-gradient(ellipse,rgba(59,130,246,0.15) 0%,transparent 60%);
    animation:auroraB 15s ease-in-out infinite alternate;
  }

  @keyframes auroraA{
    0%{transform:scale(1) rotate(0deg) translate(0,0)}
    100%{transform:scale(1.15) rotate(8deg) translate(4%,6%)}
  }

  @keyframes auroraB{
    0%{transform:scale(1) rotate(0deg) translate(0,0)}
    100%{transform:scale(1.1) rotate(-6deg) translate(-3%,-4%)}
  }

  .login-card{
    position:relative;
    width:360px;
    max-width:calc(100vw - 32px);
    background:var(--surf);
    border:1px solid var(--border);
    border-radius:20px;
    box-shadow:var(--card-sh);
    backdrop-filter:blur(32px) saturate(160%);
    -webkit-backdrop-filter:blur(32px) saturate(160%);
    padding:36px 30px;
    overflow:hidden;
  }

  .login-card::before{
    content:'';
    position:absolute;
    inset:-1px;
    border-radius:20px;
    padding:1px;
    background:linear-gradient(135deg,rgba(124,58,237,0.5),rgba(59,130,246,0.2),rgba(236,72,153,0.2),rgba(124,58,237,0.5));
    background-size:300% 300%;
    animation:borderSpin 6s linear infinite;
    -webkit-mask:linear-gradient(#fff 0 0) content-box,linear-gradient(#fff 0 0);
    -webkit-mask-composite:destination-out;
    mask-composite:exclude;
    pointer-events:none;
  }

  @keyframes borderSpin{
    0%{background-position:0% 50%}
    50%{background-position:100% 50%}
    100%{background-position:0% 50%}
  }

  .login-logo-wrap{
    width:48px;
    height:48px;
    border-radius:14px;
    background:var(--acc-dim);
    border:1px solid rgba(124,58,237,0.3);
    display:flex;
    align-items:center;
    justify-content:center;
    margin:0 auto 20px;
    animation:logoPulse 4s ease-in-out infinite;
    color:var(--acc-l);
  }

  .login-title{
    text-align:center;
    font-family:var(--font-head);
    font-size:22px;
    font-weight:800;
    letter-spacing:-0.03em;
    background:linear-gradient(135deg,var(--ink1) 0%,var(--acc-l) 100%);
    -webkit-background-clip:text;
    -webkit-text-fill-color:transparent;
    background-clip:text;
    margin-bottom:4px;
  }

  .login-sub{text-align:center;font-size:12px;color:var(--ink3);margin-bottom:28px;font-family:var(--font-mono)}

  .login-form{display:flex;flex-direction:column;gap:10px}

  .login-label{
    font-size:10.5px;
    font-weight:700;
    font-family:var(--font-head);
    color:var(--ink2);
    letter-spacing:0.05em;
    text-transform:uppercase;
    margin-bottom:4px;
    display:block;
  }

  .login-input{
    width:100%;
    background:var(--surf);
    border:1px solid var(--border);
    border-radius:10px;
    padding:11px 14px;
    color:var(--ink1);
    font-size:14px;
    font-family:var(--font-body);
    outline:none;
    transition:border-color 0.18s,box-shadow 0.18s;
  }

  .login-input:focus{border-color:var(--border-acc);box-shadow:0 0 0 3px var(--acc-glow2),0 0 20px var(--acc-glow2)}

  .login-input::placeholder{color:var(--ink3)}

  .login-btn{
    width:100%;
    padding:11px;
    border-radius:10px;
    border:1px solid rgba(124,58,237,0.4);
    background:var(--acc-dim);
    color:var(--acc-xl);
    font-size:14px;
    font-weight:700;
    font-family:var(--font-body);
    cursor:pointer;
    margin-top:6px;
    transition:all 0.2s cubic-bezier(0.34,1.56,0.64,1);
    letter-spacing:0.01em;
    position:relative;
    overflow:hidden;
  }

  .login-btn::after{
    content:'';
    position:absolute;
    inset:0;
    background:linear-gradient(135deg,rgba(255,255,255,0.08),transparent);
    opacity:0;
    transition:opacity 0.18s;
  }

  .login-btn:hover::after{opacity:1}

  .login-btn:hover{
    background:rgba(124,58,237,0.28);
    border-color:rgba(124,58,237,0.65);
    box-shadow:0 0 28px var(--acc-glow),0 4px 20px var(--acc-glow2);
    transform:translateY(-1px);
  }

  .login-btn:disabled{opacity:0.5;cursor:not-allowed;transform:none;box-shadow:none}

  .login-err{
    margin-top:8px;
    font-size:12px;
    color:var(--bad);
    background:rgba(248,113,113,0.07);
    border:1px solid rgba(248,113,113,0.18);
    border-radius:8px;
    padding:8px 12px;
    text-align:center;
    display:none;
    font-family:var(--font-mono);
  }

  .login-err.show{display:block}

  .md-content h1,.md-content h2,.md-content h3,.md-content h4{
    color:var(--ink1);
    font-family:var(--font-head);
    font-weight:700;
    margin:.9em 0 .35em;
    line-height:1.3;
  }

  .md-content h1{font-size:15px}
  .md-content h2{font-size:13.5px}
  .md-content h3{font-size:12.5px}
  .md-content h1:first-child,.md-content h2:first-child{margin-top:0}
  .md-content p{margin:0 0 .65em}
  .md-content p:last-child{margin-bottom:0}
  .md-content ul,.md-content ol{margin:.3em 0 .65em;padding-left:1.3em}
  .md-content li{margin:.2em 0}
  .md-content li::marker{color:var(--acc)}
  .md-content strong{color:var(--ink1);font-weight:600}
  .md-content em{color:var(--ink2);font-style:italic}
  .md-content u{text-decoration-color:var(--acc-l);text-underline-offset:2px}
  .md-content code{
    font-family:var(--font-mono);
    font-size:11px;
    background:var(--acc-dim);
    border:1px solid rgba(124,58,237,0.2);
    border-radius:4px;
    padding:1px 5px;
    color:var(--acc-xl);
  }
  .md-content pre{
    background:var(--ink4);
    border:1px solid var(--border);
    border-radius:8px;
    padding:10px 13px;
    overflow-x:auto;
    margin:.65em 0;
  }
  .md-content pre code{background:none;border:none;padding:0;color:var(--info)}
  .md-content blockquote{
    border-left:3px solid var(--acc);
    margin:.65em 0;
    padding:5px 11px;
    color:var(--ink2);
    font-style:italic;
    background:var(--acc-dim);
    border-radius:0 6px 6px 0;
  }
  .md-content a{color:var(--acc-l);text-decoration:none}
  .md-content a:hover{text-decoration:underline}
  .md-content hr{border:none;height:1px;background:linear-gradient(90deg,transparent,var(--acc),transparent);opacity:0.35;margin:.75em 0}
  .md-content table{width:100%;border-collapse:collapse;font-size:11.5px;margin:.65em 0}
  .md-content th{padding:5px 9px;text-align:left;color:var(--ink1);font-weight:600;border-bottom:1px solid var(--border);background:var(--ink4)}
  .md-content td{padding:4px 9px;border-bottom:1px solid var(--border);color:var(--ink2)}

  .toast-root{position:fixed;bottom:22px;right:22px;z-index:9999;display:flex;flex-direction:column;gap:7px;pointer-events:none}

  .toast{
    background:var(--surf);
    border:1px solid var(--border);
    border-radius:10px;
    padding:10px 16px;
    font-size:12.5px;
    font-family:var(--font-mono);
    color:var(--ink1);
    box-shadow:var(--card-sh);
    backdrop-filter:blur(20px);
    opacity:0;
    transform:translateY(10px) scale(0.97);
    transition:opacity 0.22s,transform 0.22s cubic-bezier(0.34,1.56,0.64,1);
    pointer-events:none;
  }

  .toast.show{opacity:1;transform:translateY(0) scale(1)}
  .toast.ok{border-color:rgba(52,211,153,0.3);color:var(--good)}
  .toast.err{border-color:rgba(248,113,113,0.3);color:var(--bad)}

  .spinner{
    display:inline-block;
    width:13px;
    height:13px;
    border:2px solid rgba(255,255,255,0.1);
    border-top-color:var(--acc-l);
    border-radius:50%;
    animation:spin 0.65s linear infinite;
    vertical-align:middle;
  }

  @keyframes spin{to{transform:rotate(360deg)}}

  .head-badge{
    font-size:10px;
    font-weight:700;
    font-family:var(--font-mono);
    padding:2px 9px;
    border-radius:5px;
    text-transform:uppercase;
    letter-spacing:0.06em;
    position:relative;
    overflow:hidden;
  }

  .head-badge::after{
    content:'';
    position:absolute;
    top:0;
    left:-100%;
    width:50%;
    height:100%;
    background:linear-gradient(90deg,transparent,rgba(255,255,255,0.15),transparent);
    animation:shimmer 3s ease-in-out infinite;
  }

  @keyframes shimmer{
    0%{left:-100%}
    60%,100%{left:200%}
  }

  .sep{height:1px;background:linear-gradient(90deg,transparent,var(--acc),transparent);opacity:0.18;margin:2px 0}

  .page-wrap{display:flex;flex-direction:column;min-height:100vh}
  </style>
  </head>
  <body>

  <div id="login-root" class="login-wrap hidden">
  <div class="login-aurora"></div>
  <div class="login-card">
  <div class="login-logo-wrap">
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8h1a4 4 0 0 1 0 8h-1"/><path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z"/><line x1="6" y1="1" x2="6" y2="4"/><line x1="10" y1="1" x2="10" y2="4"/><line x1="14" y1="1" x2="14" y2="4"/></svg>
  </div>
  <h1 class="login-title">Overlay Dashboard</h1>
  <p class="login-sub">// admin access required</p>
  <form class="login-form" id="login-form">
  <div>
  <label class="login-label" for="login-pass">Password</label>
  <input class="login-input" type="password" id="login-pass" autocomplete="current-password" placeholder="Enter admin password" required>
  </div>
  <button class="login-btn" type="submit" id="login-btn">Sign In</button>
  <div class="login-err" id="login-error"></div>
  </form>
  </div>
  </div>

  <div id="dashboard-root" class="page-wrap hidden">
  <header class="topbar">
  <div class="topbar-logo">
  <div class="logo-mark">
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8h1a4 4 0 0 1 0 8h-1"/><path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z"/></svg>
  </div>
  <span class="logo-name">Overlay Dashboard</span>
  </div>
  <div class="topbar-sep"></div>
  <div class="live-pill"><div class="live-dot"></div>System Live</div>
  <button class="theme-toggle" id="theme-toggle" title="Toggle theme">
  <span class="theme-icon" id="theme-icon">\u{1F319}</span>
  </button>
  <button class="logout-btn" id="logout-btn">
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
  Sign out
  </button>
  </header>

  <main class="main">
  <div class="tabs" id="tabs-root" role="tablist">
  <div class="tab-pill" id="tab-pill"></div>
  <button class="tab active" data-tab="alerts" role="tab">
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
  Alerts
  </button>
  <button class="tab" data-tab="changelog" role="tab">
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
  Changelogs
  </button>
  </div>

  <div class="tab-panel active" data-panel="alerts">
  <div class="card">
  <div class="card-head">
  <div class="card-icon"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg></div>
  <span class="card-title">Active Alert</span>
  <span id="active-alert-badge"></span>
  </div>
  <div class="card-body" id="active-alert-body">
  <div class="empty-state"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M8 12h8"/></svg><span>No active alert</span></div>
  </div>
  </div>

  <div class="card">
  <div class="card-head">
  <div class="card-icon"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg></div>
  <span class="card-title">Publish Alert</span>
  </div>
  <div class="card-body">
  <div class="form-row" style="margin-bottom:14px">
  <div class="form-group" style="flex:0 0 148px">
  <label class="form-label">Type</label>
  <select class="form-select" id="alert-type">
  <option value="info">Info</option>
  <option value="warning">Warning</option>
  <option value="update">Update</option>
  <option value="maintenance">Maintenance</option>
  </select>
  </div>
  <div class="form-group">
  <label class="form-label">Title</label>
  <input class="form-input" type="text" id="alert-title" placeholder="Alert title\u2026" maxlength="120">
  </div>
  </div>
  <div class="form-group" style="margin-bottom:6px"><label class="form-label">Content \u2014 Markdown</label></div>
  <div class="editor-wrap">
  <div class="editor-pane">
  <div class="editor-label">Markdown</div>
  <textarea class="editor-ta" id="alert-content" placeholder="Write **anything** in Markdown\u2026" spellcheck="false"></textarea>
  </div>
  <div class="editor-pane">
  <div class="editor-label">Preview</div>
  <div class="editor-preview md-content" id="alert-preview"></div>
  </div>
  </div>
  <div class="form-actions">
  <button class="btn btn-primary" id="publish-alert-btn">
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
  Publish Alert
  </button>
  </div>
  </div>
  </div>

  <div class="card">
  <div class="card-head">
  <div class="card-icon"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="12 8 12 12 14 14"/><path d="M3.05 11a9 9 0 1 1 .5 4m-.5 5v-5h5"/></svg></div>
  <span class="card-title">Alert History</span>
  </div>
  <div class="card-body" id="alert-history-body"><div class="hist-empty">Loading\u2026</div></div>
  </div>
  </div>

  <div class="tab-panel" data-panel="changelog">
  <div class="card">
  <div class="card-head">
  <div class="card-icon"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg></div>
  <span class="card-title">Active Changelog</span>
  </div>
  <div class="card-body" id="active-cl-body">
  <div class="empty-state"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M8 12h8"/></svg><span>No active changelog</span></div>
  </div>
  </div>

  <div class="card">
  <div class="card-head">
  <div class="card-icon"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg></div>
  <span class="card-title">Publish Changelog</span>
  </div>
  <div class="card-body">
  <div class="form-row" style="margin-bottom:14px">
  <div class="form-group" style="flex:0 0 120px">
  <label class="form-label">Version</label>
  <input class="form-input" type="text" id="cl-version" placeholder="1.5.2" maxlength="30">
  </div>
  <div class="form-group" style="flex:0 0 155px">
  <label class="form-label">Date</label>
  <input class="form-input" type="date" id="cl-date">
  </div>
  <div class="form-group">
  <label class="form-label">Title</label>
  <input class="form-input" type="text" id="cl-title" placeholder="v1.5.2 \u2014 Patch Notes" maxlength="120">
  </div>
  </div>
  <div class="form-group" style="margin-bottom:6px"><label class="form-label">Content \u2014 Markdown</label></div>
  <div class="editor-wrap">
  <div class="editor-pane">
  <div class="editor-label">Markdown</div>
  <textarea class="editor-ta" id="cl-content" placeholder="## What's New&#10;&#10;- Full Markdown supported&#10;- **Bold**, *italic*, \`code\`, __underline__" spellcheck="false"></textarea>
  </div>
  <div class="editor-pane">
  <div class="editor-label">Preview</div>
  <div class="editor-preview md-content" id="cl-preview"></div>
  </div>
  </div>
  <div class="form-actions">
  <button class="btn btn-primary" id="publish-cl-btn">
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
  Publish Changelog
  </button>
  </div>
  </div>
  </div>

  <div class="card">
  <div class="card-head">
  <div class="card-icon"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="12 8 12 12 14 14"/><path d="M3.05 11a9 9 0 1 1 .5 4m-.5 5v-5h5"/></svg></div>
  <span class="card-title">Changelog History</span>
  </div>
  <div class="card-body" id="cl-history-body"><div class="hist-empty">Loading\u2026</div></div>
  </div>
  </div>
  </main>
  </div>

  <div class="toast-root" id="toast-root"></div>

  <script>
  const TYPE_META={
    info:{color:'#60a5fa',label:'Info'},
    warning:{color:'#fbbf24',label:'Warning'},
    update:{color:'#a78bfa',label:'Update'},
    maintenance:{color:'#94a3b8',label:'Maintenance'},
  };

  function esc(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
  function fmtDate(ts){return new Date(ts).toLocaleString('en-US',{month:'short',day:'numeric',year:'numeric',hour:'2-digit',minute:'2-digit'});}

  function renderMd(raw){
    if(!raw)return'';
    const n=raw
    .replace(/\\\\n/g,'\\n')
    .replace(/\\n([-*+]|\\d+\\.) /g,'\\n\\n$1 ');
    return marked.parse(n);
  }

  function showToast(msg,kind){
    const root=document.getElementById('toast-root');
    const el=document.createElement('div');
    el.className='toast '+(kind||'');
    el.textContent=msg;
    root.appendChild(el);
    requestAnimationFrame(()=>el.classList.add('show'));
    setTimeout(()=>{el.classList.remove('show');setTimeout(()=>el.remove(),250);},3000);
  }

  async function api(path,opts){
    return fetch(path,{credentials:'same-origin',headers:{'Content-Type':'application/json',...((opts&&opts.headers)||{})},...(opts||{})});
  }

  function initTabs(){
    const tabs=document.querySelectorAll('.tab');
    const pill=document.getElementById('tab-pill');
    function movePill(tab){
      const tr=document.getElementById('tabs-root').getBoundingClientRect();
      const r=tab.getBoundingClientRect();
      pill.style.left=(r.left-tr.left-3)+'px';
      pill.style.width=r.width+'px';
    }
    const activeTab=document.querySelector('.tab.active');
    if(activeTab)requestAnimationFrame(()=>movePill(activeTab));
    tabs.forEach(btn=>{
      btn.addEventListener('click',()=>{
        const target=btn.dataset.tab;
        tabs.forEach(t=>t.classList.toggle('active',t.dataset.tab===target));
        document.querySelectorAll('.tab-panel').forEach(p=>p.classList.toggle('active',p.dataset.panel===target));
        movePill(btn);
      });
    });
  }

  function renderActiveAlert(alert){
    const c=document.getElementById('active-alert-body');
    const badge=document.getElementById('active-alert-badge');
    if(!alert){
      c.innerHTML='<div class="empty-state"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M8 12h8"/></svg><span>No active alert</span></div>';
      badge.innerHTML='';
      return;
    }
    const m=TYPE_META[alert.type]||TYPE_META.info;
    badge.innerHTML='<span class="head-badge" style="color:'+m.color+';background:'+m.color+'18;border:1px solid '+m.color+'40">'+m.label+'</span>';
    c.innerHTML='<div class="active-item">'
    +'<div class="active-item-head"><div class="type-dot" style="background:'+m.color+';box-shadow:0 0 8px '+m.color+'88"></div>'
    +'<div class="active-item-title">'+esc(alert.title)+'</div>'
    +'<div class="active-item-meta">'+fmtDate(alert.createdAt)+'</div></div>'
    +'<div class="active-item-body md-content">'+renderMd(alert.content||'')+'</div>'
    +'<div class="active-item-foot"><span class="id-mono">'+esc(alert.id)+'</span>'
    +'<button class="btn btn-danger" onclick="dismissAlert()">Dismiss</button></div></div>';
  }

  function renderAlertHistory(alerts){
    const c=document.getElementById('alert-history-body');
    if(!alerts||!alerts.length){c.innerHTML='<div class="hist-empty">No alerts yet</div>';return;}
    c.innerHTML='<div class="hist-list">'+alerts.map(a=>{
      const m=TYPE_META[a.type]||TYPE_META.info;
      return '<div class="hist-item'+(a.active?' is-live':'')+'">'
    +'<div class="type-dot" style="background:'+m.color+';'+(a.active?'box-shadow:0 0 8px '+m.color+'88':'')+'">'+'</div>'
    +'<div class="hist-title" title="'+esc(a.title)+'">'+esc(a.title)+'</div>'
    +'<span class="type-tag" style="color:'+m.color+';background:'+m.color+'14;border-color:'+m.color+'38">'+m.label+'</span>'
    +(a.active?'<span class="live-badge">Live</span>':'')
    +'<div class="hist-date">'+fmtDate(a.createdAt)+'</div></div>';
    }).join('')+'</div>';
  }

  function renderActiveChangelog(cl){
    const c=document.getElementById('active-cl-body');
    if(!cl){
      c.innerHTML='<div class="empty-state"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M8 12h8"/></svg><span>No active changelog</span></div>';
      return;
    }
    c.innerHTML='<div class="active-item">'
    +'<div class="active-item-head">'
    +'<div class="type-dot" style="background:#a78bfa;box-shadow:0 0 8px #a78bfa88"></div>'
    +'<div class="active-item-title">'+esc(cl.title||cl.version)+'</div>'
    +'<span class="active-item-ver">v'+esc(cl.version)+'</span>'
    +'<div class="active-item-meta">'+fmtDate(cl.createdAt)+'</div></div>'
    +'<div class="active-item-body md-content">'+renderMd(cl.content||'')+'</div>'
    +'<div class="active-item-foot"><span class="id-mono">'+esc(cl.id)+'</span>'
    +'<button class="btn btn-danger" onclick="dismissChangelog()">Dismiss</button></div></div>';
  }

  function renderChangelogHistory(cls){
    const c=document.getElementById('cl-history-body');
    if(!cls||!cls.length){c.innerHTML='<div class="hist-empty">No changelogs yet</div>';return;}
    c.innerHTML='<div class="hist-list">'+cls.map(cl=>{
      return '<div class="hist-item'+(cl.active?' is-live':'')+'">'
    +'<div class="type-dot" style="background:#a78bfa;'+(cl.active?'box-shadow:0 0 8px #a78bfa88':'')+'">'+'</div>'
    +'<div class="hist-title" title="'+esc(cl.title||cl.version)+'">'+esc(cl.title||cl.version)+'</div>'
    +'<span class="hist-ver">v'+esc(cl.version)+'</span>'
    +(cl.active?'<span class="live-badge">Live</span>':'')
    +'<div class="hist-date">'+fmtDate(cl.createdAt)+'</div></div>';
    }).join('')+'</div>';
  }

  async function loadAll(){
    const [ar,ahr,cr,chr]=await Promise.all([
      api('/api/admin/alert'),api('/api/admin/alerts'),
                                            api('/api/admin/changelog'),api('/api/admin/changelogs'),
    ]);
    renderActiveAlert(ar.ok?await ar.json():null);
    renderAlertHistory(ahr.ok?await ahr.json():[]);
    renderActiveChangelog(cr.ok?await cr.json():null);
    renderChangelogHistory(chr.ok?await chr.json():[]);
  }

  async function dismissAlert(){
    const btn=document.querySelector('#active-alert-body .btn-danger');
    if(btn)btn.disabled=true;
    const res=await api('/api/admin/alert',{method:'DELETE'});
    if(res.ok){showToast('Alert dismissed.','ok');await loadAll();}
    else{showToast('Failed.','err');if(btn)btn.disabled=false;}
  }

  async function dismissChangelog(){
    const btn=document.querySelector('#active-cl-body .btn-danger');
    if(btn)btn.disabled=true;
    const res=await api('/api/admin/changelog',{method:'DELETE'});
    if(res.ok){showToast('Changelog dismissed.','ok');await loadAll();}
    else{showToast('Failed.','err');if(btn)btn.disabled=false;}
  }

  document.getElementById('publish-alert-btn').addEventListener('click',async()=>{
    const title=document.getElementById('alert-title').value.trim();
    const type=document.getElementById('alert-type').value;
    const content=document.getElementById('alert-content').value.trim();
    const btn=document.getElementById('publish-alert-btn');
    if(!title||!content){showToast('Title and content required.','err');return;}
    btn.disabled=true;btn.innerHTML='<span class="spinner"></span> Publishing\u2026';
  const res=await api('/api/admin/alert',{method:'POST',body:JSON.stringify({type,title,content})});
  if(res.ok){
    showToast('Alert published!','ok');
    document.getElementById('alert-title').value='';
  document.getElementById('alert-content').value='';
  document.getElementById('alert-preview').innerHTML='';
  await loadAll();
  }else{
    const b=await res.json().catch(()=>({}));
    showToast(b.error||'Failed.','err');
  }
  btn.disabled=false;btn.innerHTML='<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg> Publish Alert';
  });

  document.getElementById('publish-cl-btn').addEventListener('click',async()=>{
    const version=document.getElementById('cl-version').value.trim();
    const date=document.getElementById('cl-date').value;
    const title=document.getElementById('cl-title').value.trim();
    const content=document.getElementById('cl-content').value.trim();
    const btn=document.getElementById('publish-cl-btn');
    if(!version||!content){showToast('Version and content required.','err');return;}
    btn.disabled=true;btn.innerHTML='<span class="spinner"></span> Publishing\u2026';
  const res=await api('/api/admin/changelog',{method:'POST',body:JSON.stringify({version,date,title,content})});
  if(res.ok){
    showToast('Changelog published!','ok');
    document.getElementById('cl-version').value='';
  document.getElementById('cl-date').value='';
  document.getElementById('cl-title').value='';
  document.getElementById('cl-content').value='';
  document.getElementById('cl-preview').innerHTML='';
  await loadAll();
  }else{
    const b=await res.json().catch(()=>({}));
    showToast(b.error||'Failed.','err');
  }
  btn.disabled=false;btn.innerHTML='<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg> Publish Changelog';
  });

  document.getElementById('alert-content').addEventListener('input',function(){
    document.getElementById('alert-preview').innerHTML=renderMd(this.value);
  });

  document.getElementById('cl-content').addEventListener('input',function(){
    document.getElementById('cl-preview').innerHTML=renderMd(this.value);
  });

  document.getElementById('logout-btn').addEventListener('click',async()=>{
    await api('/api/admin/logout',{method:'POST'});
    location.reload();
  });

  document.getElementById('theme-toggle').addEventListener('click',()=>{
    const html=document.documentElement;
    const isLight=html.dataset.theme==='light';
  html.dataset.theme=isLight?'dark':'light';
  document.getElementById('theme-icon').textContent=isLight?'\u{1F319}':'\u2600\uFE0F';
  localStorage.setItem('theme',html.dataset.theme);
  });

  async function doLogin(e){
    e.preventDefault();
    const pass=document.getElementById('login-pass').value;
    const btn=document.getElementById('login-btn');
    const errEl=document.getElementById('login-error');
    btn.disabled=true;btn.textContent='Signing in\u2026';errEl.classList.remove('show');
    const res=await fetch('/api/admin/login',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({password:pass})});
    if(res.ok){location.reload();}
    else{
      const b=await res.json().catch(()=>({}));
      errEl.textContent=b.error||'Invalid password.';errEl.classList.add('show');
      btn.disabled=false;btn.textContent='Sign In';
      document.getElementById('login-pass').value='';
    }
  }

  (async function init(){
    try{
      marked.setOptions({gfm:true,breaks:true});
      const savedTheme=localStorage.getItem('theme')||'dark';
  document.documentElement.dataset.theme=savedTheme;
  document.getElementById('theme-icon').textContent=savedTheme==='light'?'\u2600\uFE0F':'\u{1F319}';
  const res=await fetch('/api/admin/session',{credentials:'same-origin'});
  if(!res.ok){
    document.getElementById('login-root').classList.remove('hidden');
    document.getElementById('login-form').addEventListener('submit',doLogin);
    return;
  }
  document.getElementById('dashboard-root').classList.remove('hidden');
  document.getElementById('cl-date').value=new Date().toISOString().split('T')[0];
  initTabs();
  await loadAll();
    }catch(e){
      console.error('Init failed:',e);
      document.getElementById('login-root').classList.remove('hidden');
      document.getElementById('login-form').addEventListener('submit',doLogin);
    }
  })();
  <\/script>
  </body>
  </html>`;
}
const OAUTH_SESSION_PREFIX = 'oauthsession:';
const DISCORD_USER_PREFIX = 'discorduser:';
const API_KEY_PREFIX = 'apikey:';
const COUNT_CLAIMED_PREFIX = 'countclaimed:';
const OAUTH_SESSION_TTL_S = 60 * 10;
const OAUTH_SESSION_RESULT_TTL_S = 60 * 5;

interface DiscordUserRecord {
  username: string;
  apiKey: string;
  linkedAt: number;
}

type OAuthSessionRecord =
  | { status: 'pending' }
  | { status: 'success'; apiKey: string; username: string; avatarUrl: string }
  | { status: 'error'; message: string };

async function getOAuthSession(
  kv: KVNamespace,
  state: string,
): Promise<OAuthSessionRecord | null> {
  const raw = await kv.get(`${OAUTH_SESSION_PREFIX}${state}`);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as OAuthSessionRecord;
  } catch {
    return null;
  }
}

async function putOAuthSession(
  kv: KVNamespace,
  state: string,
  record: OAuthSessionRecord,
  ttlSeconds: number,
): Promise<void> {
  await kv.put(`${OAUTH_SESSION_PREFIX}${state}`, JSON.stringify(record), {
    expirationTtl: ttlSeconds,
  });
}

function generateApiKey(): string {
  return generateToken();
}

async function resolveApiKeyOwner(
  kv: KVNamespace,
  apiKey: string,
): Promise<string | null> {
  return kv.get(`${API_KEY_PREFIX}${apiKey}`);
}

async function countClaimedUsers(kv: KVNamespace): Promise<number> {
  let count = 0;
  let cursor: string | undefined;
  do {
    const page = await kv.list({ prefix: COUNT_CLAIMED_PREFIX, cursor });
    count += page.keys.length;
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor);
  return count;
}

function discordAvatarUrl(
  id: string,
  avatar: string | null,
  discriminator: string,
): string {
  if (avatar) {
    const ext = avatar.startsWith('a_') ? 'gif' : 'png';
    return `https://cdn.discordapp.com/avatars/${id}/${avatar}.${ext}`;
  }
  const fallbackIndex =
    discriminator === '0' ? Number(BigInt(id) >> 22n) % 6 : Number(discriminator) % 5;
  return `https://cdn.discordapp.com/embed/avatars/${fallbackIndex}.png`;
}

async function sendDiscordWebhookEmbed(
  webhookUrl: string,
  user: { id: string; username: string; avatarUrl: string },
  isNewUser: boolean,
): Promise<void> {
  const embed = {
    title: isNewUser ? 'New Overlay User Linked' : 'Overlay User Re-Linked',
    color: isNewUser ? 8138989 : 6323434,
    thumbnail: { url: user.avatarUrl },
    fields: [
      { name: 'Username', value: user.username, inline: true },
      { name: 'Discord ID', value: user.id, inline: true },
    ],
    timestamp: new Date().toISOString(),
  };
  try {
    await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ embeds: [embed] }),
    });
  } catch {}
}

function getOAuthCompletePageHtml(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Kyra Overlay</title>
<style>
  *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
  html,body{height:100%}
  body{
    background:#000;
    color:rgba(255,255,255,0.85);
    font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;
    min-height:100vh;
    display:flex;
    align-items:center;
    justify-content:center;
    text-align:center;
    padding:32px 20px;
  }
  .card{max-width:340px}
  h1{font-size:16px;font-weight:600;margin-bottom:8px}
  p{font-size:13px;line-height:1.6;color:rgba(255,255,255,0.5)}
</style>
</head>
<body>
  <div class="card">
    <h1>You're all set</h1>
    <p>You may close this tab and head back to the overlay now.</p>
  </div>
</body>
</html>`;
}

const app = new Hono<{ Bindings: Env }>();
app.use('/api/alert', cors({ origin: '*', allowMethods: ['GET', 'OPTIONS'] }));
app.use('/api/changelog', cors({ origin: '*', allowMethods: ['GET', 'OPTIONS'] }));
app.get('/api/alert', async (c) => {
  try {
    const alert = await getActiveAlert(c.env.ALERTS_KV);
    if (!alert) return c.json(null);
    return c.json({
      id: alert.id,
      type: alert.type,
      title: alert.title,
      content: alert.content,
    });
  } catch {
    return c.json(null);
  }
});
app.get('/api/changelog', async (c) => {
  try {
    const cl = await getActiveChangelog(c.env.ALERTS_KV);
    if (!cl) return c.json(null);
    return c.json({
      id: cl.id,
      version: cl.version,
      date: cl.date,
      title: cl.title ?? '',
      content: cl.content,
    });
  } catch {
    return c.json(null);
  }
});
app.get('/', (c) => c.redirect('/dashboard', 302));
app.get('/dashboard', (c) => c.html(getDashboardHtml()));
app.post('/api/admin/login', async (c) => {
  const ip =
    c.req.header('CF-Connecting-IP') ?? c.req.header('X-Forwarded-For') ?? 'unknown';
  const allowed = await checkRateLimit(c.env.ALERTS_KV, ip);
  if (!allowed) {
    return c.json({ error: 'Too many failed attempts. Try again in 15 minutes.' }, 429);
  }
  let body;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid request body.' }, 400);
  }
  if (typeof body.password !== 'string' || body.password.length === 0) {
    await recordFailedAttempt(c.env.ALERTS_KV, ip);
    return c.json({ error: 'Password is required.' }, 400);
  }
  const valid = await timingSafeEquals(body.password, c.env.ADMIN_PASSWORD);
  if (!valid) {
    await recordFailedAttempt(c.env.ALERTS_KV, ip);
    return c.json({ error: 'Invalid password.' }, 401);
  }
  await clearRateLimit(c.env.ALERTS_KV, ip);
  const token = await createSession(c.env.ALERTS_KV);
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Set-Cookie': sessionCookieHeader(token, SESSION_TTL_S),
    },
  });
});
app.post('/api/admin/logout', async (c) => {
  const token = parseSessionCookie(c.req.header('Cookie') ?? null);
  if (token) await destroySession(c.env.ALERTS_KV, token);
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Set-Cookie': sessionCookieHeader('', 0),
    },
  });
});
app.get('/api/admin/session', async (c) => {
  const ok = await requireSession(c.env.ALERTS_KV, c.req.header('Cookie') ?? null);
  return ok ? c.json({ ok: true }) : c.json({ error: 'Unauthorized' }, 401);
});
app.get('/api/admin/alert', async (c) => {
  if (!(await requireSession(c.env.ALERTS_KV, c.req.header('Cookie') ?? null)))
    return c.json({ error: 'Unauthorized' }, 401);
  return c.json(await getActiveAlert(c.env.ALERTS_KV));
});
app.post('/api/admin/alert', async (c) => {
  if (!(await requireSession(c.env.ALERTS_KV, c.req.header('Cookie') ?? null)))
    return c.json({ error: 'Unauthorized' }, 401);
  let body;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid request body.' }, 400);
  }
  const validTypes = ['info', 'warning', 'update', 'maintenance'];
  if (!body.type || !validTypes.includes(body.type))
    return c.json(
      { error: 'type must be one of: info, warning, update, maintenance' },
      400,
    );
  if (!body.title?.trim()) return c.json({ error: 'title is required.' }, 400);
  if (!body.content?.trim()) return c.json({ error: 'content is required.' }, 400);
  const id = generateId();
  const alert = {
    id,
    type: body.type,
    title: body.title.trim(),
    content: body.content.trim(),
    createdAt: Date.now(),
    active: true,
  };
  await c.env.ALERTS_KV.put(`${ALERT_PREFIX}${id}`, JSON.stringify(alert), {
    expirationTtl: 60 * 60 * 24 * 30,
  });
  await c.env.ALERTS_KV.put(ACTIVE_ALERT_KEY, id);
  return c.json({ id }, 201);
});
app.delete('/api/admin/alert', async (c) => {
  if (!(await requireSession(c.env.ALERTS_KV, c.req.header('Cookie') ?? null)))
    return c.json({ error: 'Unauthorized' }, 401);
  const activeId = await c.env.ALERTS_KV.get(ACTIVE_ALERT_KEY);
  if (activeId) {
    const raw2 = await c.env.ALERTS_KV.get(`${ALERT_PREFIX}${activeId}`);
    if (raw2) {
      const a = JSON.parse(raw2);
      a.active = false;
      await c.env.ALERTS_KV.put(`${ALERT_PREFIX}${activeId}`, JSON.stringify(a));
    }
    await c.env.ALERTS_KV.delete(ACTIVE_ALERT_KEY);
  }
  return c.json({ ok: true });
});
app.get('/api/admin/alerts', async (c) => {
  if (!(await requireSession(c.env.ALERTS_KV, c.req.header('Cookie') ?? null)))
    return c.json({ error: 'Unauthorized' }, 401);
  return c.json(await listAlerts(c.env.ALERTS_KV));
});
app.get('/api/admin/changelog', async (c) => {
  if (!(await requireSession(c.env.ALERTS_KV, c.req.header('Cookie') ?? null)))
    return c.json({ error: 'Unauthorized' }, 401);
  return c.json(await getActiveChangelog(c.env.ALERTS_KV));
});
app.post('/api/admin/changelog', async (c) => {
  if (!(await requireSession(c.env.ALERTS_KV, c.req.header('Cookie') ?? null)))
    return c.json({ error: 'Unauthorized' }, 401);
  let body;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid request body.' }, 400);
  }
  if (!body.version?.trim()) return c.json({ error: 'version is required.' }, 400);
  if (!body.content?.trim()) return c.json({ error: 'content is required.' }, 400);
  const id = generateId();
  const cl = {
    id,
    version: body.version.trim(),
    date: body.date?.trim() ?? /* @__PURE__ */ new Date().toISOString().split('T')[0],
    title: body.title?.trim() ?? '',
    content: body.content.trim(),
    createdAt: Date.now(),
    active: true,
  };
  await c.env.ALERTS_KV.put(`${CHANGELOG_PREFIX}${id}`, JSON.stringify(cl), {
    expirationTtl: 60 * 60 * 24 * 30,
  });
  await c.env.ALERTS_KV.put(ACTIVE_CHANGELOG_KEY, id);
  return c.json({ id }, 201);
});
app.delete('/api/admin/changelog', async (c) => {
  if (!(await requireSession(c.env.ALERTS_KV, c.req.header('Cookie') ?? null)))
    return c.json({ error: 'Unauthorized' }, 401);
  const activeId = await c.env.ALERTS_KV.get(ACTIVE_CHANGELOG_KEY);
  if (activeId) {
    const raw2 = await c.env.ALERTS_KV.get(`${CHANGELOG_PREFIX}${activeId}`);
    if (raw2) {
      const cl = JSON.parse(raw2);
      cl.active = false;
      await c.env.ALERTS_KV.put(`${CHANGELOG_PREFIX}${activeId}`, JSON.stringify(cl));
    }
    await c.env.ALERTS_KV.delete(ACTIVE_CHANGELOG_KEY);
  }
  return c.json({ ok: true });
});
app.get('/api/admin/changelogs', async (c) => {
  if (!(await requireSession(c.env.ALERTS_KV, c.req.header('Cookie') ?? null)))
    return c.json({ error: 'Unauthorized' }, 401);
  return c.json(await listChangelogs(c.env.ALERTS_KV));
});
app.get('/health', (c) => c.json({ ok: true, ts: Date.now() }));
app.get('/oauth/discord/start', async (c) => {
  const state = generateToken();
  await putOAuthSession(
    c.env.ALERTS_KV,
    state,
    { status: 'pending' },
    OAUTH_SESSION_TTL_S,
  );

  const redirectUri = new URL('/oauth/discord/callback', c.req.url).toString();
  const authorizeUrl = new URL('https://discord.com/oauth2/authorize');
  authorizeUrl.searchParams.set('client_id', c.env.DISCORD_CLIENT_ID);
  authorizeUrl.searchParams.set('redirect_uri', redirectUri);
  authorizeUrl.searchParams.set('response_type', 'code');
  authorizeUrl.searchParams.set('scope', 'identify');
  authorizeUrl.searchParams.set('state', state);
  authorizeUrl.searchParams.set('prompt', 'consent');

  // The app polls /oauth/discord/poll with this state to learn the outcome
  // in-app, instead of relying on a browser redirect back into the app.
  return c.json({ state, authorizeUrl: authorizeUrl.toString() });
});
app.get('/oauth/discord/poll', async (c) => {
  const state = c.req.query('state');
  if (!state) {
    return c.json({ status: 'error', message: 'Missing session state.' }, 400);
  }

  const session = await getOAuthSession(c.env.ALERTS_KV, state);
  if (!session) {
    return c.json({
      status: 'error',
      message: 'This sign-in session expired. Please try again.',
    });
  }

  if (session.status === 'pending') {
    return c.json({ status: 'pending' });
  }

  // Terminal states are consumed once so a stale poll can't replay them.
  await c.env.ALERTS_KV.delete(`${OAUTH_SESSION_PREFIX}${state}`);
  return c.json(session);
});
app.get('/oauth/discord/callback', async (c) => {
  const code = c.req.query('code');
  const state = c.req.query('state');
  const oauthError = c.req.query('error');

  if (!state) {
    return c.html(getOAuthCompletePageHtml(), 400);
  }

  const failSession = async (message: string, status: 200 | 400 | 502 = 400) => {
    await putOAuthSession(
      c.env.ALERTS_KV,
      state,
      { status: 'error', message },
      OAUTH_SESSION_RESULT_TTL_S,
    );
    return c.html(getOAuthCompletePageHtml(), status);
  };

  if (oauthError) {
    return failSession('Discord sign-in was cancelled.', 200);
  }
  if (!code) {
    return failSession('Missing authorization code.');
  }

  const session = await getOAuthSession(c.env.ALERTS_KV, state);
  if (!session || session.status !== 'pending') {
    return failSession('This sign-in link expired. Please try again from the app.');
  }

  const redirectUri = new URL('/oauth/discord/callback', c.req.url).toString();

  let tokenRes: Response;
  try {
    tokenRes = await fetch('https://discord.com/api/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: c.env.DISCORD_CLIENT_ID,
        client_secret: c.env.DISCORD_CLIENT_SECRET,
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri,
      }),
    });
  } catch {
    return failSession('Could not reach Discord. Please try again.', 502);
  }

  if (!tokenRes.ok) {
    return failSession('Discord rejected the sign-in request. Please try again.');
  }

  const tokenBody = await tokenRes.json<{ access_token: string; token_type: string }>();

  let userRes: Response;
  try {
    userRes = await fetch('https://discord.com/api/users/@me', {
      headers: { Authorization: `${tokenBody.token_type} ${tokenBody.access_token}` },
    });
  } catch {
    return failSession('Could not reach Discord. Please try again.', 502);
  }

  if (!userRes.ok) {
    return failSession('Could not read your Discord profile. Please try again.');
  }

  const discordUser = await userRes.json<{
    id: string;
    username: string;
    avatar: string | null;
    discriminator: string;
  }>();
  const avatarUrl = discordAvatarUrl(
    discordUser.id,
    discordUser.avatar,
    discordUser.discriminator,
  );
  const userKey = `${DISCORD_USER_PREFIX}${discordUser.id}`;
  const existingRaw = await c.env.ALERTS_KV.get(userKey);
  const existing = existingRaw ? (JSON.parse(existingRaw) as DiscordUserRecord) : null;

  const apiKey = existing?.apiKey ?? generateApiKey();

  if (!existing) {
    const record: DiscordUserRecord = {
      username: discordUser.username,
      apiKey,
      linkedAt: Date.now(),
    };
    await c.env.ALERTS_KV.put(userKey, JSON.stringify(record));
    await c.env.ALERTS_KV.put(`${API_KEY_PREFIX}${apiKey}`, discordUser.id);
  }

  await sendDiscordWebhookEmbed(
    c.env.DISCORD_WEBHOOK_URL,
    { id: discordUser.id, username: discordUser.username, avatarUrl },
    !existing,
  );

  await putOAuthSession(
    c.env.ALERTS_KV,
    state,
    { status: 'success', apiKey, username: discordUser.username, avatarUrl },
    OAUTH_SESSION_RESULT_TTL_S,
  );

  return c.html(getOAuthCompletePageHtml());
});
app.post('/api/telemetry/count-increment', async (c) => {
  let body;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid request body.' }, 400);
  }
  if (typeof body.key !== 'string' || body.key.length === 0) {
    return c.json({ error: 'key is required.' }, 400);
  }

  const discordId = await resolveApiKeyOwner(c.env.ALERTS_KV, body.key);
  if (!discordId) {
    return c.json({ error: 'Invalid API key.' }, 401);
  }

  const claimKey = `${COUNT_CLAIMED_PREFIX}${body.key}`;
  const alreadyClaimed = await c.env.ALERTS_KV.get(claimKey);
  if (alreadyClaimed) {
    return c.json({ ok: true, alreadyCounted: true });
  }

  await c.env.ALERTS_KV.put(claimKey, String(Date.now()));
  return c.json({ ok: true, alreadyCounted: false });
});
app.post('/api/telemetry/verify', async (c) => {
  const ip =
    c.req.header('CF-Connecting-IP') ?? c.req.header('X-Forwarded-For') ?? 'unknown';
  const allowed = await checkRateLimit(c.env.ALERTS_KV, ip);
  if (!allowed) {
    return c.json({ error: 'Too many requests. Try again later.' }, 429);
  }

  let body;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid request body.' }, 400);
  }

  if (typeof body.key !== 'string' || body.key.length === 0) {
    await recordFailedAttempt(c.env.ALERTS_KV, ip);
    return c.json({ error: 'key is required.' }, 400);
  }

  const discordId = await resolveApiKeyOwner(c.env.ALERTS_KV, body.key);
  if (!discordId) {
    await recordFailedAttempt(c.env.ALERTS_KV, ip);
    return c.json({ valid: false });
  }

  await clearRateLimit(c.env.ALERTS_KV, ip);
  return c.json({ valid: true });
});
app.get('/api/telemetry/count', async (c) => {
  const key = c.req.query('key');
  if (
    typeof key !== 'string' ||
    key.length === 0 ||
    !(await timingSafeEquals(key, c.env.TELEMETRY_ADMIN_KEY))
  ) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const count = await countClaimedUsers(c.env.ALERTS_KV);
  return c.json({ count });
});
app.notFound((c) => c.json({ error: 'Not found' }, 404));

export default app;
