/**
 * useLogParser — parses Minecraft log lines for PikaNetwork BedWars events.
 *
 * ENCODING NOTE: On Windows, Minecraft may write § (U+00A7) as raw byte 0xA7
 * (Windows-1252). When Node.js readline reads the file as UTF-8, 0xA7 is an
 * invalid lead byte and gets replaced with U+FFFD (replacement character).
 * This means color codes arrive as "\uFFFDr" instead of "§r". We handle both.
 */

const CHAT_REGEXP = /^\[[0-9]{2}:[0-9]{2}:[0-9]{2}\] \[[^\]]+\/INFO\]: (?:\[CHAT\] )?(.+)$/

const MC_NAME = '[A-Za-z0-9_]{1,16}'

const PATTERNS = {
  join: new RegExp(`(${MC_NAME}) has joined! \\(\\d+/\\d+\\)`),

  quit: new RegExp(`(${MC_NAME}) has quit! \\(\\d+/\\d+\\)`),

  quitDc: new RegExp(`^(${MC_NAME}) disconnected!$`),

  whoPlain: /^((?:\[[A-Z0-9+_§]+?] )?[A-Za-z0-9_]+)(?:,\s*(?:\[[A-Z0-9+_§]+?] )?[A-Za-z0-9_]+)+$/,

  finalKill: /FINAL KILL/,
}

/**
 * Strip Minecraft color/format codes.
 * Handles § (U+00A7) AND U+FFFD (replacement char when § is misread as UTF-8).
 */
export function stripColorCodes(str: string): string {
  return str
    .replace(/[\u00A7\uFFFD][0-9A-FK-OR]/gi, '') // §X or <FFFD>X
    .replace(/[\u00A7\uFFFD]/g, '') // any lone section/replacement char
}

export type LogEvent =
  | { type: 'join'; name: string }
  | { type: 'quit'; name: string }
  | { type: 'who'; names: string[] }
  | { type: 'finalKill'; name: string }

export function parseLine(raw: string): LogEvent | null {
  const chatMatch = raw.match(CHAT_REGEXP)
  let msg = (chatMatch ? chatMatch[1] : raw).trim()
  if (!msg) return null

  msg = stripColorCodes(msg)
  if (!msg) return null

  if (PATTERNS.finalKill.test(msg)) {
    const name = msg.split(/\s+/)[0]
    if (/^[A-Za-z0-9_]{1,16}$/.test(name)) return { type: 'finalKill', name }
  }

  const joinM = msg.match(PATTERNS.join)
  if (joinM) return { type: 'join', name: joinM[1] }

  const quitM = msg.match(PATTERNS.quit) ?? msg.match(PATTERNS.quitDc)
  if (quitM) return { type: 'quit', name: quitM[1] }

  if (PATTERNS.whoPlain.test(msg)) {
    const names = msg.split(/\s*,\s*/).flatMap((part) => {
      const clean = part.replace(/\[[A-Z0-9+_§]+?]\s*/g, '').replace(/[\u00A7\uFFFD]./g, '')
      return clean.match(/[A-Za-z0-9_]{1,16}/g) || []
    })
    if (names.length >= 2) return { type: 'who', names }
  }

  return null
}
