# Code App

Electron desktop app for running coding agents against local projects with a project-first UI, persistent threads, integrated git tools, and workspace management.

## Highlights

- Multi-project workspace layout with archived project and thread support
- Multiple harnesses with Codex and OpenCode support
- Persistent per-thread sessions with local history storage
- Rich thread timeline with plans, grouped tool activity, file diffs, and web search entries
- Project import, clone, and starter template flows for `Next.js` and `Electron`
- Built-in code panel, browser preview popout, and project web links
- Git snapshot, diff, stage, commit, push, sync, branching, and AI conflict-resolution flows
- Project actions/dev commands with terminal streaming and optional auto-start behavior
- Skills management at app and project scope
- Setup/install doctor, auth flows, model selection, and permission controls
- Audio transcription support for prompt input
- Desktop auto-update packaging and Cloudflare R2 release publishing

## Workspace Layout

- `apps/desktop/shared`: shared contracts, IPC types, harness metadata
- `apps/desktop/main`: Electron main process, persistence, services, packaging
- `apps/desktop/renderer`: React renderer UI
- `apps/desktop/scripts`: local desktop helper scripts
- `apps/desktop/resources`: app icons and packaged assets
- `scripts`: root development and release helpers

## Requirements

- Node.js 20+
- npm
- Platform support for Electron 35 native modules
- At least one configured harness account for agent sessions

## Quick Start

```bash
npm install
npm run ensure:native
npm run dev
```

Useful development commands:

```bash
npm run test
npm run build
npm run lint
```

If native modules fail to install or Electron reports an ABI mismatch:

```bash
rm -rf node_modules package-lock.json
npm install
npm run ensure:native
```

On Windows:

```powershell
Remove-Item -Recurse -Force node_modules
Remove-Item -Force package-lock.json
npm install
npm run ensure:native
```

## App Capabilities

### Projects and Workspaces

- Create projects in an existing folder or generate a starter app from templates
- Import existing folders, discover local repositories, or clone from a git URL
- Organize projects into custom workspaces with icons and colors
- Manage per-project environment variables, web links, browser preview, and action commands

### Threads and Sessions

- Start isolated agent sessions per thread
- Fork threads from prior prompts
- Review a thread or a specific commit from the UI
- Compact long-running threads and generate thread metadata
- Support user-input requests, plan cards, and sub-thread orchestration proposals

### Editor, Preview, and Terminal Tools

- Monaco-based code panel in a dedicated window
- Embedded terminal support for project actions and system terminals
- Preview popout for local dev apps and saved project web links
- File read/write, rename, create-folder, and delete flows through the desktop API

### Git and Automation

- Inspect repository status, diffs, outgoing/incoming commits, and shared history
- Stage, unstage, discard, commit, pull, push, sync, and branch from the app
- Open AI-assisted merge conflict resolution flows
- Configure reusable dev commands with hotkeys and overflow actions

## Build and Package

```bash
npm run package
```

Platform-specific packaging:

```bash
npm run package:mac
npm run package:win
npm run package:linux
npm run package:all
```

Packaged output is written to `apps/desktop/main/release`.

If Windows packaging fails because `app-builder.exe` is missing or blocked, reinstall dependencies and verify the binary directly:

```powershell
Remove-Item -Recurse -Force node_modules
Remove-Item -Force package-lock.json
npm install
.\node_modules\app-builder-bin\win\x64\app-builder.exe --version
```

## Release Publishing

Cloudflare R2 publishing is handled by `scripts/publish-cloudflare-release.mjs`.

```bash
cp .env.release.example .env.release
# fill in .env.release

npm run package:win
npm run release:win
```

Also available:

```bash
npm run release:mac
npm run release:linux
```

Dry run:

```bash
npm run release:win -- --dry-run
```

## Testing

```bash
npm run test
```

Main-process tests run with Vitest from `apps/desktop/main/src/__tests__`.

## License

Licensed under the Apache License, Version 2.0. See [LICENSE](./LICENSE).
