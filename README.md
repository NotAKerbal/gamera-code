# Code App

Cross-platform Electron wrapper focused on Codex SDK with a Codex-inspired project/thread UI.

## Features

- Project sidebar with grouped thread lists
- Codex SDK threads with live streaming activity
- One isolated session per thread
- Local persistence with SQLite + JSONL thread logs
- Install doctor for Node/npm + Codex SDK health
- Permission modes (`prompt_on_risk`, `always_ask`, `auto_allow`)
- Environment variable settings for Codex SDK sessions
- Electron auto-update integration

## Workspace Layout

- `/Users/isaaccochran/Github/code-app/apps/desktop/shared`
- `/Users/isaaccochran/Github/code-app/apps/desktop/main`
- `/Users/isaaccochran/Github/code-app/apps/desktop/renderer`
- `/Users/isaaccochran/Github/code-app/apps/desktop/scripts`
- `/Users/isaaccochran/Github/code-app/apps/desktop/resources`

## Quick Start

```bash
npm install
npm run ensure:native
npm run dev
```

If install fails on native modules (`better-sqlite3` / `node-pty`), run:

```bash
rm -rf node_modules package-lock.json
npm install
```

If Electron reports `NODE_MODULE_VERSION` mismatch, run:

```bash
npm run ensure:native
```

This rebuild uses the official `@electron/rebuild` Node API with Electron `35.0.1`, rebuilding `better-sqlite3` and `node-pty` against that ABI with local caches in `.electron-gyp` and `.cache-home`.

## Build and Package

```bash
npm run build
npm run package
```

Target-specific packaging commands:

```bash
npm run package:mac    # produces .dmg
npm run package:win    # produces NSIS .exe installer
npm run package:linux  # produces .AppImage
```

Run all targets in one command (best for CI runners with full tooling):

```bash
npm run package:all
```

Artifacts are written to `/Users/isaaccochran/Github/code-app/apps/desktop/main/dist`.

Host/tooling notes:

- macOS `.dmg` builds are supported on macOS.
- Windows `.exe` cross-builds from macOS/Linux may require Wine.
- Linux `.AppImage` cross-builds are most reliable on Linux (or Linux CI/container).

## Testing

```bash
npm run test
```

## Requirements

- Node.js 20+
- npm available on PATH
- Codex SDK authentication flow

## Current Focus

- Gemini is temporarily disabled while the Codex SDK flow is being finalized.
- The UI now prioritizes Codex-first workflows with a live activity feed (commands, file changes, reasoning, and tool calls).
