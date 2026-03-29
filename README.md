# THEBOIS Overlay

PikaNetwork BedWars stat tracker — Electron + Vue 3 + TypeScript overlay.

## Setup

```bash
npm install
```

## Development

```bash
npm run dev
```

## Code Quality

```bash
# Fix all lint + formatting issues in one shot
npm run fix

# Individual commands
npm run lint        # ESLint check
npm run lint:fix    # ESLint auto-fix
npm run format      # Prettier format
npm run format:check # Prettier dry-run check
npm run typecheck   # TypeScript type-check
```

## Build

```bash
npm run build:win    # Windows installer (.exe)
npm run build:mac    # macOS disk image (.dmg)
npm run build:linux  # Linux AppImage
```

## GitHub Actions (fully automated)

| Trigger | Workflow | What it does |
|---|---|---|
| Push to `main` / `dev` | **CI** | Prettier check → ESLint → TypeScript |
| Push to `main` / `dev` | **Auto-fix** | Runs `npm run fix`, commits back any changes |
| Push tag `v*.*.*` | **Release** | Builds Win + Mac + Linux, publishes to GitHub Releases |

### Publishing a release

```bash
git tag v1.2.3
git push origin v1.2.3
```

GitHub Actions builds all three platforms and uploads installers to the release automatically.

### Configuration

Before publishing, update `package.json` → `build.publish`:

```json
{
  "publish": {
    "provider": "github",
    "owner": "YOUR_GITHUB_USERNAME",
    "repo": "YOUR_REPO_NAME"
  }
}
```

Add a `GITHUB_TOKEN` secret (already available by default in Actions) — no extra setup needed.
