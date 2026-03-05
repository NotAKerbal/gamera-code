import { BrowserWindow, dialog, ipcMain, shell, type OpenDialogOptions } from "electron";
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";
import {
  IPC_CHANNELS,
  type AppSettings,
  type CodexThreadOptions,
  type PermissionMode,
  type ProjectTerminalEvent,
  type PromptAttachment,
  type SessionEvent,
  type SystemTerminalId,
  type SystemTerminalOption,
  type ThreadStatus
} from "@code-app/shared";
import { Repository } from "../services/repository";
import { SessionManager } from "../services/sessionManager";
import { ProjectTerminalManager } from "../services/projectTerminalManager";
import { InstallerManager } from "../services/installerManager";
import { PermissionEngine } from "../services/permissionEngine";
import { UpdaterService } from "../services/updaterService";
import { GitService } from "../services/gitService";

export interface HandlerDeps {
  repository: Repository;
  sessionManager: SessionManager;
  projectTerminalManager: ProjectTerminalManager;
  installerManager: InstallerManager;
  permissionEngine: PermissionEngine;
  updaterService: UpdaterService;
  gitService: GitService;
  gitPopout: {
    open: (projectId: string, projectName?: string) => Promise<{ ok: boolean }>;
    close: () => Promise<{ ok: boolean }>;
  };
  preview: {
    openPopout: (url: string, projectName?: string) => Promise<{ ok: boolean }>;
    closePopout: () => Promise<{ ok: boolean }>;
    navigate: (url: string, projectName?: string) => Promise<{ ok: boolean }>;
    openDevTools: () => Promise<{ ok: boolean }>;
  };
  webLink: {
    open: (url: string, name?: string, projectName?: string, focus?: boolean) => Promise<{ ok: boolean }>;
    getState: () => Promise<{ open: boolean; url?: string }>;
  };
  settingsWindow: {
    open: () => Promise<{ ok: boolean }>;
  };
}

export const registerIpcHandlers = (deps: HandlerDeps) => {
  type ProjectTemplateId = "nextjs" | "electron";
  type ProjectSetupEvent = {
    projectId: string;
    phase:
      | "creating_folder"
      | "setting_up_files"
      | "installing_dependencies"
      | "running_setup_scripts"
      | "ready"
      | "failed";
    status: "running" | "completed" | "failed";
    message: string;
    ts: string;
  };
  const FILE_INDEX_DEFAULT_LIMIT = 3000;
  const FILE_INDEX_MAX_LIMIT = 8000;
  const SKILL_DOC_MAX_BYTES = 256 * 1024;
  const FILE_INDEX_IGNORED_DIRS = new Set([
    ".git",
    "node_modules",
    "dist",
    "build",
    "out",
    "coverage",
    ".next",
    ".turbo",
    ".cache"
  ]);
  const gitDiscardChannel = (IPC_CHANNELS as Record<string, string>).gitDiscard ?? "git:discard";
  const projectsListFilesChannel =
    (IPC_CHANNELS as Record<string, string>).projectsListFiles ?? "projects:listFiles";
  const gitGetOutgoingCommitsChannel =
    (IPC_CHANNELS as Record<string, string>).gitGetOutgoingCommits ?? "git:getOutgoingCommits";
  const gitGetIncomingCommitsChannel =
    (IPC_CHANNELS as Record<string, string>).gitGetIncomingCommits ?? "git:getIncomingCommits";
  const gitGetSharedHistoryChannel =
    (IPC_CHANNELS as Record<string, string>).gitGetSharedHistory ?? "git:getSharedHistory";
  const gitGetSnapshotChannel =
    (IPC_CHANNELS as Record<string, string>).gitGetSnapshot ?? "git:getSnapshot";
  const gitInitChannel =
    (IPC_CHANNELS as Record<string, string>).gitInit ?? "git:init";
  const gitResolveConflictsAiChannel =
    (IPC_CHANNELS as Record<string, string>).gitResolveConflictsAi ?? "git:resolveConflictsAi";
  const orchestrationListRunsChannel =
    (IPC_CHANNELS as Record<string, string>).orchestrationListRuns ?? "orchestration:listRuns";
  const orchestrationGetRunChannel =
    (IPC_CHANNELS as Record<string, string>).orchestrationGetRun ?? "orchestration:getRun";
  const orchestrationApproveProposalChannel =
    (IPC_CHANNELS as Record<string, string>).orchestrationApproveProposal ?? "orchestration:approveProposal";
  const orchestrationStopChildChannel =
    (IPC_CHANNELS as Record<string, string>).orchestrationStopChild ?? "orchestration:stopChild";
  const orchestrationRetryChildChannel =
    (IPC_CHANNELS as Record<string, string>).orchestrationRetryChild ?? "orchestration:retryChild";
  const workspacesListChannel = (IPC_CHANNELS as Record<string, string>).workspacesList ?? "workspaces:list";
  const workspacesCreateChannel = (IPC_CHANNELS as Record<string, string>).workspacesCreate ?? "workspaces:create";
  const workspacesUpdateChannel = (IPC_CHANNELS as Record<string, string>).workspacesUpdate ?? "workspaces:update";
  const workspacesDeleteChannel = (IPC_CHANNELS as Record<string, string>).workspacesDelete ?? "workspaces:delete";
  const normalizePath = (path: string) => resolve(path);
  const SUPPORTED_PROJECT_TEMPLATES = new Set<ProjectTemplateId>(["nextjs", "electron"]);
  const toPackageName = (value: string) => {
    const normalized = value
      .toLowerCase()
      .replace(/[^a-z0-9-_]+/g, "-")
      .replace(/^-+/, "")
      .replace(/-+$/, "");
    return normalized || "app";
  };
  const writeProjectFiles = async (baseDir: string, files: Record<string, string>) => {
    await Promise.all(
      Object.entries(files).map(async ([relativePath, contents]) => {
        const filePath = join(baseDir, relativePath);
        await mkdir(dirname(filePath), { recursive: true });
        await writeFile(filePath, contents, "utf8");
      })
    );
  };
  const scaffoldNextJsTemplate = async (targetDir: string, packageName: string) => {
    const files: Record<string, string> = {
      ".gitignore": "node_modules\n.next\ndist\ncoverage\n.env*\n",
      "package.json": `${JSON.stringify(
        {
          name: packageName,
          private: true,
          scripts: {
            dev: "next dev",
            build: "next build",
            start: "next start",
            lint: "next lint"
          },
          dependencies: {
            next: "^16.0.0",
            react: "^19.0.0",
            "react-dom": "^19.0.0"
          },
          devDependencies: {
            "@types/node": "^22.10.0",
            "@types/react": "^19.0.0",
            "@types/react-dom": "^19.0.0",
            eslint: "^9.20.0",
            "eslint-config-next": "^16.0.0",
            typescript: "^5.7.0"
          }
        },
        null,
        2
      )}\n`,
      "next.config.ts": `import type { NextConfig } from "next";

const config: NextConfig = {
  reactStrictMode: true
};

export default config;
`,
      "tsconfig.json": `${JSON.stringify(
        {
          compilerOptions: {
            target: "ES2017",
            lib: ["dom", "dom.iterable", "esnext"],
            allowJs: false,
            skipLibCheck: true,
            strict: true,
            noEmit: true,
            esModuleInterop: true,
            module: "esnext",
            moduleResolution: "bundler",
            resolveJsonModule: true,
            isolatedModules: true,
            jsx: "preserve",
            incremental: true,
            plugins: [{ name: "next" }]
          },
          include: ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
          exclude: ["node_modules"]
        },
        null,
        2
      )}\n`,
      "next-env.d.ts": '/// <reference types="next" />\n/// <reference types="next/image-types/global" />\n',
      "src/app/layout.tsx": `import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "New Next.js App",
  description: "Generated by Code App"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
`,
      "src/app/page.tsx": `export default function HomePage() {
  return (
    <main style={{ padding: 24, fontFamily: "system-ui, sans-serif" }}>
      <h1>Welcome</h1>
      <p>Start building your Next.js app.</p>
    </main>
  );
}
`,
      "src/app/globals.css": "html, body { margin: 0; padding: 0; }\n* { box-sizing: border-box; }\n"
    };

    await writeProjectFiles(targetDir, files);
  };
  const scaffoldElectronTemplate = async (targetDir: string, packageName: string) => {
    const files: Record<string, string> = {
      ".gitignore": "node_modules\ndist\nout\ncoverage\n",
      "package.json": `${JSON.stringify(
        {
          name: packageName,
          private: true,
          type: "module",
          scripts: {
            dev: "electron-vite dev",
            build: "electron-vite build",
            preview: "electron-vite preview"
          },
          main: "out/main/index.js",
          dependencies: {
            electron: "^37.2.0"
          },
          devDependencies: {
            "electron-vite": "^3.0.0",
            typescript: "^5.7.0",
            vite: "^6.2.0"
          }
        },
        null,
        2
      )}\n`,
      "tsconfig.json": `${JSON.stringify(
        {
          compilerOptions: {
            target: "ES2022",
            module: "ESNext",
            moduleResolution: "Bundler",
            strict: true,
            skipLibCheck: true,
            noEmit: true,
            types: ["node"]
          },
          include: ["electron.vite.config.ts", "src/**/*"]
        },
        null,
        2
      )}\n`,
      "electron.vite.config.ts": `import { resolve } from "node:path";
import { defineConfig, externalizeDepsPlugin } from "electron-vite";

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()]
  },
  preload: {
    plugins: [externalizeDepsPlugin()]
  },
  renderer: {
    resolve: {
      alias: {
        "@renderer": resolve("src/renderer/src")
      }
    }
  }
});
`,
      "src/main/index.ts": `import { app, BrowserWindow } from "electron";
import { join } from "node:path";

function createWindow() {
  const window = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: join(__dirname, "../preload/index.js")
    }
  });

  if (process.env["ELECTRON_RENDERER_URL"]) {
    void window.loadURL(process.env["ELECTRON_RENDERER_URL"]);
  } else {
    void window.loadFile(join(__dirname, "../renderer/index.html"));
  }
}

app.whenReady().then(() => {
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
`,
      "src/preload/index.ts": `import { contextBridge } from "electron";

contextBridge.exposeInMainWorld("app", {
  platform: process.platform
});
`,
      "src/renderer/index.html": `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Electron App</title>
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
`,
      "src/renderer/src/main.ts": `import "./styles.css";

const appRoot = document.querySelector<HTMLDivElement>("#app");
if (appRoot) {
  appRoot.innerHTML = "<h1>Electron + Vite + TypeScript</h1><p>Project created successfully.</p>";
}
`,
      "src/renderer/src/styles.css": `:root { color-scheme: light dark; font-family: system-ui, sans-serif; }
body { margin: 0; padding: 32px; }
h1 { margin: 0 0 12px; }
p { margin: 0; }
`
    };

    await writeProjectFiles(targetDir, files);
  };
  const scaffoldProjectTemplate = async (targetDir: string, templateId: ProjectTemplateId, packageName: string) => {
    if (templateId === "nextjs") {
      await scaffoldNextJsTemplate(targetDir, packageName);
      return;
    }
    await scaffoldElectronTemplate(targetDir, packageName);
  };
  const scaffoldMonorepoRoot = async (targetDir: string, packageName: string) => {
    const files: Record<string, string> = {
      ".gitignore": "node_modules\ndist\ncoverage\n.env*\n",
      "package.json": `${JSON.stringify(
        {
          name: packageName,
          private: true,
          workspaces: ["apps/*"],
          scripts: {
            dev: "npm run dev --workspaces --if-present",
            build: "npm run build --workspaces --if-present",
            lint: "npm run lint --workspaces --if-present"
          }
        },
        null,
        2
      )}\n`,
      "README.md": `# ${packageName}

Monorepo scaffold generated by Code App.

- Apps live in \`apps/*\`
- Run \`npm install\`
- Run \`npm run dev\`
`
    };
    await writeProjectFiles(targetDir, files);
    await mkdir(join(targetDir, "apps"), { recursive: true });
  };
  const readPackageScripts = async (projectDir: string): Promise<Record<string, string>> => {
    const packageJsonPath = join(projectDir, "package.json");
    if (!existsSync(packageJsonPath)) {
      return {};
    }
    try {
      const raw = await readFile(packageJsonPath, "utf8");
      const parsed = JSON.parse(raw) as { scripts?: Record<string, unknown> };
      const scripts = parsed.scripts ?? {};
      const normalized: Record<string, string> = {};
      Object.entries(scripts).forEach(([name, value]) => {
        if (typeof value === "string" && value.trim()) {
          normalized[name] = value;
        }
      });
      return normalized;
    } catch {
      return {};
    }
  };
  const runCommand = async (command: string, args: string[], cwd: string) =>
    new Promise<void>((resolve, reject) => {
      const isWindows = process.platform === "win32";
      const escapeCmdArg = (value: string) => {
        if (!/[\s"&^|<>]/.test(value)) {
          return value;
        }
        return `"${value.replace(/"/g, '""')}"`;
      };
      const executable = isWindows ? "cmd.exe" : command;
      const executableArgs = isWindows
        ? ["/d", "/s", "/c", [command, ...args].map(escapeCmdArg).join(" ")]
        : args;

      const child = spawn(executable, executableArgs, {
        cwd,
        shell: false,
        stdio: ["ignore", "pipe", "pipe"]
      });
      let stderr = "";
      child.stderr?.on("data", (chunk: Buffer | string) => {
        stderr += String(chunk);
      });
      child.on("error", (error) => reject(error));
      child.on("close", (code) => {
        if (code === 0) {
          resolve();
          return;
        }
        const trimmedStderr = stderr.trim();
        reject(
          new Error(
            `${command} ${args.join(" ")} failed with code ${code ?? "unknown"}${
              trimmedStderr ? `: ${trimmedStderr}` : ""
            }`
          )
        );
      });
    });
  const isPathInside = (rootPath: string, candidatePath: string) => {
    const relativePath = relative(rootPath, candidatePath);
    if (!relativePath) {
      return true;
    }
    return !relativePath.startsWith("..") && relativePath !== ".." && !isAbsolute(relativePath);
  };
  const resolveSkillDocumentPath = (inputPath: string) => {
    const trimmed = inputPath.trim();
    if (!trimmed) {
      throw new Error("Skill document path is required.");
    }

    const normalizedPath = normalizePath(trimmed);
    const lowerPath = normalizedPath.toLowerCase();
    if (!lowerPath.endsWith(".md")) {
      throw new Error("Only markdown skill documents are supported.");
    }

    const skillRoots = new Set<string>();
    const codexHome = process.env["CODEX_HOME"]?.trim();
    if (codexHome) {
      skillRoots.add(normalizePath(join(codexHome, "skills")));
    }

    const userHome = process.env["USERPROFILE"]?.trim() || process.env["HOME"]?.trim();
    if (userHome) {
      skillRoots.add(normalizePath(join(userHome, ".codex", "skills")));
    }

    deps.repository
      .listProjects()
      .map((project) => normalizePath(project.path))
      .forEach((projectPath) => {
        skillRoots.add(projectPath);
      });

    const allowed = Array.from(skillRoots).some((root) => isPathInside(root, normalizedPath));
    if (!allowed) {
      throw new Error("Skill document path is outside allowed roots.");
    }

    return normalizedPath;
  };
  const findProjectByPath = (path: string) => {
    const normalized = normalizePath(path);
    return deps.repository.listProjects().find((project) => normalizePath(project.path) === normalized) ?? null;
  };

  const getProjectPath = (projectId: string) => {
    const project = deps.repository.getProject(projectId);
    if (!project) {
      throw new Error("Project not found");
    }
    return project.path;
  };

  const listProjectFiles = async (projectPath: string, requestedLimit?: number) => {
    const limit =
      typeof requestedLimit === "number" && Number.isFinite(requestedLimit)
        ? Math.max(1, Math.min(FILE_INDEX_MAX_LIMIT, Math.floor(requestedLimit)))
        : FILE_INDEX_DEFAULT_LIMIT;
    const paths = [projectPath];
    const files: Array<{ path: string; updatedAtMs: number }> = [];

    while (paths.length > 0 && files.length < limit) {
      const currentDir = paths.pop();
      if (!currentDir) {
        continue;
      }

      let entries: Array<{ name: string; isDirectory: () => boolean; isFile: () => boolean }>;
      try {
        entries = await readdir(currentDir, { withFileTypes: true });
      } catch {
        continue;
      }

      for (const entry of entries) {
        if (entry.isDirectory()) {
          if (FILE_INDEX_IGNORED_DIRS.has(entry.name)) {
            continue;
          }
          paths.push(join(currentDir, entry.name));
          continue;
        }

        if (!entry.isFile()) {
          continue;
        }

        const absolutePath = join(currentDir, entry.name);
        const relativePath = relative(projectPath, absolutePath).replace(/\\/g, "/");
        if (!relativePath || relativePath.startsWith("../")) {
          continue;
        }

        let updatedAtMs = 0;
        try {
          const fileStats = await stat(absolutePath);
          updatedAtMs = Number.isFinite(fileStats.mtimeMs) ? fileStats.mtimeMs : 0;
        } catch {
          // Ignore stat errors for files that disappear during indexing.
        }

        files.push({
          path: relativePath,
          updatedAtMs
        });

        if (files.length >= limit) {
          break;
        }
      }
    }

    files.sort((left, right) => right.updatedAtMs - left.updatedAtMs || left.path.localeCompare(right.path));
    return files;
  };

  interface TerminalRuntime {
    id: SystemTerminalId;
    label: string;
    command: string;
    available: boolean;
    launch: (cwd: string) => Promise<boolean>;
  }

  const commandExists = (command: string): boolean => {
    const checker = process.platform === "win32" ? "where" : "which";
    const result = spawnSync(checker, [command], { stdio: "ignore" });
    return result.status === 0;
  };

  const appExistsOnMac = (appName: string): boolean => {
    if (process.platform !== "darwin") {
      return false;
    }
    const result = spawnSync("open", ["-Ra", appName], { stdio: "ignore" });
    return result.status === 0;
  };

  const spawnDetached = (command: string, args: string[], cwd: string, windowsHide = false): boolean => {
    try {
      spawn(command, args, {
        cwd,
        detached: true,
        stdio: "ignore",
        windowsHide
      }).unref();
      return true;
    } catch {
      return false;
    }
  };

  const terminalCandidates = (): TerminalRuntime[] => {
    if (process.platform === "win32") {
      const gitBashPaths = [
        join(process.env["ProgramFiles"] ?? "C:\\Program Files", "Git", "git-bash.exe"),
        join(process.env["ProgramFiles(x86)"] ?? "C:\\Program Files (x86)", "Git", "git-bash.exe")
      ];
      const gitBashPath = gitBashPaths.find((path) => existsSync(path));

      return [
        {
          id: "windows-terminal",
          label: "Windows Terminal",
          command: "wt",
          available: commandExists("wt"),
          launch: async (cwd) => spawnDetached("wt", ["-d", cwd], cwd)
        },
        {
          id: "powershell-core",
          label: "PowerShell (pwsh)",
          command: "pwsh",
          available: commandExists("pwsh"),
          launch: async (cwd) => spawnDetached("pwsh", ["-NoExit"], cwd)
        },
        {
          id: "powershell",
          label: "Windows PowerShell",
          command: "powershell",
          available: commandExists("powershell"),
          launch: async (cwd) => spawnDetached("powershell", ["-NoExit"], cwd)
        },
        {
          id: "command-prompt",
          label: "Command Prompt",
          command: "cmd",
          available: commandExists("cmd"),
          launch: async (cwd) => spawnDetached("cmd.exe", ["/k"], cwd, false)
        },
        {
          id: "git-bash",
          label: "Git Bash",
          command: gitBashPath ?? "git-bash.exe",
          available: Boolean(gitBashPath),
          launch: async (cwd) => (gitBashPath ? spawnDetached(gitBashPath, [`--cd=${cwd}`], cwd) : false)
        }
      ];
    }

    if (process.platform === "darwin") {
      return [
        {
          id: "terminal-app",
          label: "Terminal.app",
          command: "open -a Terminal",
          available: appExistsOnMac("Terminal"),
          launch: async (cwd) => spawnDetached("open", ["-a", "Terminal", cwd], cwd)
        },
        {
          id: "iterm-app",
          label: "iTerm",
          command: "open -a iTerm",
          available: appExistsOnMac("iTerm"),
          launch: async (cwd) => spawnDetached("open", ["-a", "iTerm", cwd], cwd)
        },
        {
          id: "kitty",
          label: "Kitty",
          command: "kitty",
          available: commandExists("kitty"),
          launch: async (cwd) => spawnDetached("kitty", ["--directory", cwd], cwd)
        },
        {
          id: "alacritty",
          label: "Alacritty",
          command: "alacritty",
          available: commandExists("alacritty"),
          launch: async (cwd) => spawnDetached("alacritty", ["--working-directory", cwd], cwd)
        }
      ];
    }

    return [
      {
        id: "x-terminal-emulator",
        label: "Default Terminal",
        command: "x-terminal-emulator",
        available: commandExists("x-terminal-emulator"),
        launch: async (cwd) => spawnDetached("x-terminal-emulator", [], cwd)
      },
      {
        id: "gnome-terminal",
        label: "GNOME Terminal",
        command: "gnome-terminal",
        available: commandExists("gnome-terminal"),
        launch: async (cwd) => spawnDetached("gnome-terminal", ["--working-directory", cwd], cwd)
      },
      {
        id: "gnome-console",
        label: "GNOME Console",
        command: "kgx",
        available: commandExists("kgx"),
        launch: async (cwd) => spawnDetached("kgx", ["--working-directory", cwd], cwd)
      },
      {
        id: "konsole",
        label: "Konsole",
        command: "konsole",
        available: commandExists("konsole"),
        launch: async (cwd) => spawnDetached("konsole", ["--workdir", cwd], cwd)
      },
      {
        id: "xfce4-terminal",
        label: "Xfce Terminal",
        command: "xfce4-terminal",
        available: commandExists("xfce4-terminal"),
        launch: async (cwd) => spawnDetached("xfce4-terminal", ["--working-directory", cwd], cwd)
      },
      {
        id: "tilix",
        label: "Tilix",
        command: "tilix",
        available: commandExists("tilix"),
        launch: async (cwd) => spawnDetached("tilix", ["--working-directory", cwd], cwd)
      },
      {
        id: "mate-terminal",
        label: "MATE Terminal",
        command: "mate-terminal",
        available: commandExists("mate-terminal"),
        launch: async (cwd) => spawnDetached("mate-terminal", ["--working-directory", cwd], cwd)
      },
      {
        id: "lxterminal",
        label: "LXTerminal",
        command: "lxterminal",
        available: commandExists("lxterminal"),
        launch: async (cwd) => spawnDetached("lxterminal", ["--working-directory", cwd], cwd)
      },
      {
        id: "terminator",
        label: "Terminator",
        command: "terminator",
        available: commandExists("terminator"),
        launch: async (cwd) => spawnDetached("terminator", ["--working-directory", cwd], cwd)
      },
      {
        id: "kitty",
        label: "Kitty",
        command: "kitty",
        available: commandExists("kitty"),
        launch: async (cwd) => spawnDetached("kitty", ["--directory", cwd], cwd)
      },
      {
        id: "alacritty",
        label: "Alacritty",
        command: "alacritty",
        available: commandExists("alacritty"),
        launch: async (cwd) => spawnDetached("alacritty", ["--working-directory", cwd], cwd)
      },
      {
        id: "wezterm",
        label: "WezTerm",
        command: "wezterm",
        available: commandExists("wezterm"),
        launch: async (cwd) => spawnDetached("wezterm", ["start", "--cwd", cwd], cwd)
      },
      {
        id: "ghostty",
        label: "Ghostty",
        command: "ghostty",
        available: commandExists("ghostty"),
        launch: async (cwd) => spawnDetached("ghostty", ["--working-directory", cwd], cwd)
      },
      {
        id: "foot",
        label: "Foot",
        command: "foot",
        available: commandExists("foot"),
        launch: async (cwd) => spawnDetached("foot", ["--working-directory", cwd], cwd)
      },
      {
        id: "xterm",
        label: "XTerm",
        command: "xterm",
        available: commandExists("xterm"),
        launch: async (cwd) => spawnDetached("xterm", [], cwd)
      }
    ];
  };

  const listSystemTerminals = (): SystemTerminalOption[] => {
    const settings = deps.repository.getSettings();
    const candidates = terminalCandidates();
    const available = candidates.filter((candidate) => candidate.available);
    const preferredId = settings.preferredSystemTerminalId?.trim();
    const defaultId =
      (preferredId && available.find((candidate) => candidate.id === preferredId)?.id) ?? available[0]?.id ?? "";

    return candidates.map((candidate) => ({
      id: candidate.id,
      label: candidate.label,
      command: candidate.command,
      available: candidate.available,
      isDefault: defaultId === candidate.id
    }));
  };

  const openSystemTerminal = async (cwd: string, terminalId?: SystemTerminalId) => {
    const settings = deps.repository.getSettings();
    const preferredId = settings.preferredSystemTerminalId?.trim();
    const candidates = terminalCandidates();
    const available = candidates.filter((candidate) => candidate.available);
    const selected =
      (terminalId && available.find((candidate) => candidate.id === terminalId)) ??
      (preferredId && available.find((candidate) => candidate.id === preferredId)) ??
      available[0];

    if (!selected) {
      throw new Error("No system terminal detected. Install a terminal and try again.");
    }

    const fallbackCandidates = available.filter((candidate) => candidate.id !== selected.id);
    for (const candidate of [selected, ...fallbackCandidates]) {
      if (await candidate.launch(cwd)) {
        return;
      }
    }

    throw new Error("Failed to launch a system terminal. Check your terminal settings and PATH.");
  };

  const pushSessionEvent = (event: SessionEvent) => {
    BrowserWindow.getAllWindows().forEach((window) => {
      if (!window.isDestroyed()) {
        window.webContents.send(IPC_CHANNELS.sessionsEvent, event);
      }
    });
  };
  const pushProjectTerminalEvent = (event: ProjectTerminalEvent) => {
    BrowserWindow.getAllWindows().forEach((window) => {
      if (!window.isDestroyed()) {
        window.webContents.send(IPC_CHANNELS.projectTerminalEvent, event);
      }
    });
  };
  const pushInstallLog = (line: string) => {
    BrowserWindow.getAllWindows().forEach((window) => {
      if (!window.isDestroyed()) {
        window.webContents.send(IPC_CHANNELS.installerInstallLog, line);
      }
    });
  };
  const pushSettingsChanged = (settings: AppSettings) => {
    BrowserWindow.getAllWindows().forEach((window) => {
      if (!window.isDestroyed()) {
        window.webContents.send(IPC_CHANNELS.settingsChanged, settings);
      }
    });
  };
  const projectsSetupEventChannel =
    (IPC_CHANNELS as Record<string, string>).projectsSetupEvent ?? "projects:setupEvent";
  const pushProjectSetupEvent = (event: ProjectSetupEvent) => {
    BrowserWindow.getAllWindows().forEach((window) => {
      if (!window.isDestroyed()) {
        window.webContents.send(projectsSetupEventChannel, event);
      }
    });
  };

  ipcMain.handle(IPC_CHANNELS.projectsList, async () => deps.repository.listProjects());
  ipcMain.handle(workspacesListChannel, async () => deps.repository.listWorkspaces());

  ipcMain.handle(
    workspacesCreateChannel,
    async (_event, input: { name: string; icon: string; color: string; moveProjectIds?: string[] }) => {
      return deps.repository.createWorkspace(input);
    }
  );

  ipcMain.handle(
    workspacesUpdateChannel,
    async (_event, input: { id: string; name?: string; icon?: string; color?: string }) => {
      return deps.repository.updateWorkspace(input);
    }
  );

  ipcMain.handle(workspacesDeleteChannel, async (_event, input: { id: string }) => {
    deps.repository.deleteWorkspace(input.id);
    return { ok: true };
  });

  ipcMain.handle(IPC_CHANNELS.projectsCreate, async (_event, input: { name: string; path: string }) => {
    return deps.repository.createProject(input);
  });

  ipcMain.handle(
    IPC_CHANNELS.projectsCreateInDirectory,
    async (_event, input: { name: string; parentDir: string; monorepo?: boolean; templateIds?: ProjectTemplateId[] }) => {
      const trimmedName = input.name.trim();
      if (!trimmedName) {
        throw new Error("Project name is required.");
      }
      const monorepo = Boolean(input.monorepo);
      const templateIdsRaw = Array.isArray(input.templateIds) ? input.templateIds : [];
      const templateIds = templateIdsRaw.filter((templateId): templateId is ProjectTemplateId =>
        SUPPORTED_PROJECT_TEMPLATES.has(templateId)
      );
      if (!monorepo && templateIds.length > 1) {
        throw new Error("Only one template is allowed when Monorepo is off.");
      }
      if (templateIds.length !== templateIdsRaw.length) {
        throw new Error("Unsupported project template selected.");
      }

      const targetPath = join(input.parentDir, trimmedName);
      mkdirSync(targetPath);
      const project = deps.repository.createProject({ name: trimmedName, path: targetPath });
      const emitSetup = (event: Omit<ProjectSetupEvent, "projectId" | "ts">) => {
        pushProjectSetupEvent({
          projectId: project.id,
          ...event,
          ts: new Date().toISOString()
        });
      };

      void (async () => {
        try {
          emitSetup({
            phase: "creating_folder",
            status: "running",
            message: "Creating folder..."
          });
          emitSetup({
            phase: "setting_up_files",
            status: "running",
            message: "Setting up files..."
          });

          const basePackageName = toPackageName(trimmedName);
          if (monorepo) {
            await scaffoldMonorepoRoot(targetPath, basePackageName);
            const dirByTemplate: Record<ProjectTemplateId, string> = {
              nextjs: "web",
              electron: "desktop"
            };
            for (const templateId of templateIds) {
              const appDirName = dirByTemplate[templateId];
              const appPath = join(targetPath, "apps", appDirName);
              await mkdir(appPath, { recursive: true });
              await scaffoldProjectTemplate(appPath, templateId, `${basePackageName}-${appDirName}`);
            }
          } else {
            const selectedTemplate = templateIds[0];
            if (selectedTemplate) {
              await scaffoldProjectTemplate(targetPath, selectedTemplate, basePackageName);
            }
          }

          const packageJsonPath = join(targetPath, "package.json");
          if (existsSync(packageJsonPath)) {
            const npmCommand = "npm";
            emitSetup({
              phase: "installing_dependencies",
              status: "running",
              message: "Installing dependencies..."
            });
            await runCommand(npmCommand, ["install"], targetPath);

            const scripts = await readPackageScripts(targetPath);
            const setupScriptName = ["setup", "bootstrap", "init"].find((name) => Boolean(scripts[name]));
            if (setupScriptName) {
              emitSetup({
                phase: "running_setup_scripts",
                status: "running",
                message: `Running ${setupScriptName} script...`
              });
              await runCommand(npmCommand, ["run", setupScriptName], targetPath);
            }
          }

          emitSetup({
            phase: "ready",
            status: "completed",
            message: "Project is ready."
          });
        } catch (error) {
          emitSetup({
            phase: "failed",
            status: "failed",
            message: `Setup failed: ${String(error)}`
          });
        }
      })();

      return project;
    }
  );

  ipcMain.handle(IPC_CHANNELS.projectsListGitRepositories, async () => {
    const rootDir = deps.repository.getSettings().defaultProjectDirectory?.trim() ?? "";
    if (!rootDir) {
      return [];
    }
    return deps.gitService.discoverRepositories(rootDir);
  });

  ipcMain.handle(IPC_CHANNELS.projectsImportFromPath, async (_event, input: { path: string; name?: string }) => {
    const path = input.path.trim();
    if (!path) {
      throw new Error("Project path is required.");
    }

    const existing = findProjectByPath(path);
    if (existing) {
      return existing;
    }

    const gitState = await deps.gitService.getState(path);
    if (!gitState.insideRepo) {
      throw new Error("Selected folder is not a git repository.");
    }

    const name = input.name?.trim() || basename(path);
    return deps.repository.createProject({ name, path });
  });

  ipcMain.handle(IPC_CHANNELS.projectsCloneFromGitUrl, async (_event, input: { url: string; name?: string }) => {
    const url = input.url.trim();
    if (!url) {
      throw new Error("Repository URL is required.");
    }

    const rootDir = deps.repository.getSettings().defaultProjectDirectory?.trim() ?? "";
    if (!rootDir) {
      throw new Error("Set a default project directory in Settings first.");
    }

    mkdirSync(rootDir, { recursive: true });
    const clone = await deps.gitService.cloneRepository(url, rootDir, input.name);
    if (!clone.ok) {
      throw new Error(clone.stderr || "Failed to clone repository.");
    }

    const existing = findProjectByPath(clone.path);
    if (existing) {
      return existing;
    }

    const name = input.name?.trim() || basename(clone.path);
    return deps.repository.createProject({ name, path: clone.path });
  });

  ipcMain.handle(
    IPC_CHANNELS.projectsUpdate,
    async (_event, input: { id: string; name?: string; path?: string; workspaceId?: string }) => {
    return deps.repository.updateProject(input);
    }
  );

  ipcMain.handle(IPC_CHANNELS.projectsDelete, async (_event, input: { id: string }) => {
    deps.repository.deleteProject(input.id);
    return { ok: true };
  });

  ipcMain.handle(IPC_CHANNELS.projectsPickPath, async () => {
    const activeWindow =
      BrowserWindow.getFocusedWindow() ||
      BrowserWindow.getAllWindows().find((window) => !window.isDestroyed());
    const options: OpenDialogOptions = {
      title: "Select Project Folder",
      properties: ["openDirectory"]
    };
    const result = activeWindow
      ? await dialog.showOpenDialog(activeWindow, options)
      : await dialog.showOpenDialog(options);

    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }

    return result.filePaths[0];
  });

  ipcMain.handle(IPC_CHANNELS.projectsListSystemTerminals, async () => {
    return listSystemTerminals();
  });

  ipcMain.handle(
    IPC_CHANNELS.projectsOpenTerminal,
    async (_event, input: { projectId: string; terminalId?: SystemTerminalId }) => {
    const projectPath = getProjectPath(input.projectId);
    await openSystemTerminal(projectPath, input.terminalId);
    return { ok: true };
    }
  );

  ipcMain.handle(IPC_CHANNELS.projectsOpenFiles, async (_event, input: { projectId: string }) => {
    const projectPath = getProjectPath(input.projectId);
    await shell.openPath(projectPath);
    return { ok: true };
  });

  ipcMain.handle(projectsListFilesChannel, async (_event, input: { projectId: string; limit?: number }) => {
    const projectPath = getProjectPath(input.projectId);
    return listProjectFiles(projectPath, input.limit);
  });

  ipcMain.handle(
    IPC_CHANNELS.projectsOpenWebLink,
    async (_event, input: { url: string; name?: string; projectName?: string; focus?: boolean }) => {
      return deps.webLink.open(input.url, input.name, input.projectName, input.focus);
    }
  );

  ipcMain.handle(IPC_CHANNELS.projectsGetWebLinkState, async () => {
    return deps.webLink.getState();
  });

  ipcMain.handle(IPC_CHANNELS.projectSettingsGet, async (_event, input: { projectId: string }) => {
    return deps.repository.getProjectSettings(input.projectId);
  });

  ipcMain.handle(
    IPC_CHANNELS.projectSettingsSet,
    async (
      _event,
      input: {
        projectId: string;
        envVars?: Record<string, string>;
        devCommands?: Array<{ id: string; name: string; command: string; autoStart?: boolean; useForPreview?: boolean }>;
        webLinks?: Array<{ id: string; name: string; url: string }>;
        browserEnabled?: boolean;
        defaultDevCommandId?: string;
        autoStartDevTerminal?: boolean;
        switchBehaviorOverride?: "start_stop" | "start_only" | "manual";
        subthreadPolicyOverride?: "manual" | "ask" | "auto";
        lastDetectedPreviewUrl?: string;
      }
    ) => deps.repository.setProjectSettings(input)
  );

  ipcMain.handle(IPC_CHANNELS.projectTerminalSetActiveProject, async (_event, input: { projectId: string | null }) => {
    return deps.projectTerminalManager.setActiveProject(input.projectId);
  });

  ipcMain.handle(
    IPC_CHANNELS.projectTerminalStart,
    async (_event, input: { projectId: string; commandId?: string }) => {
      return deps.projectTerminalManager.start(input.projectId, input.commandId);
    }
  );

  ipcMain.handle(IPC_CHANNELS.projectTerminalStop, async (_event, input: { projectId: string; commandId?: string }) => {
    return deps.projectTerminalManager.stop(input.projectId, input.commandId);
  });

  ipcMain.handle(IPC_CHANNELS.projectTerminalGetState, async (_event, input: { projectId: string }) => {
    return deps.projectTerminalManager.getState(input.projectId);
  });

  ipcMain.handle(IPC_CHANNELS.previewOpenPopout, async (_event, input: { url: string; projectName?: string }) => {
    return deps.preview.openPopout(input.url, input.projectName);
  });

  ipcMain.handle(IPC_CHANNELS.previewClosePopout, async () => {
    return deps.preview.closePopout();
  });

  ipcMain.handle(IPC_CHANNELS.previewNavigate, async (_event, input: { url: string; projectName?: string }) => {
    return deps.preview.navigate(input.url, input.projectName);
  });

  ipcMain.handle(IPC_CHANNELS.previewOpenDevTools, async () => {
    return deps.preview.openDevTools();
  });

  ipcMain.handle(IPC_CHANNELS.threadsList, async (_event, input?: { projectId?: string; includeArchived?: boolean }) => {
    return deps.repository.listThreads(input);
  });

  ipcMain.handle(
    IPC_CHANNELS.threadsCreate,
    async (_event, input: { projectId: string; title: string; provider: "codex" | "gemini" }) => {
      return deps.repository.createThread(input);
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.threadsUpdate,
    async (
      _event,
      input: {
        id: string;
        title?: string;
        color?: string;
        provider?: "codex" | "gemini";
        status?: ThreadStatus;
        pinned?: boolean;
      }
    ) => {
      return deps.repository.updateThread(input);
    }
  );

  ipcMain.handle(IPC_CHANNELS.threadsArchive, async (_event, input: { id: string; archived: boolean }) => {
    return deps.repository.archiveThread(input.id, input.archived);
  });

  const threadsForkChannel = (IPC_CHANNELS as Record<string, string>).threadsFork ?? "threads:fork";
  ipcMain.handle(threadsForkChannel, async (_event, input: { id: string; upToStreamSeq?: number }) => {
    const forked = await deps.sessionManager.forkThread(input.id, input.upToStreamSeq);
    if (!forked) {
      throw new Error("Thread not found.");
    }
    return forked;
  });

  ipcMain.handle(
    IPC_CHANNELS.threadsEvents,
    async (_event, input: { threadId: string; beforeStreamSeq?: number; userPromptCount?: number }) => {
      return deps.repository.listMessages(input);
    }
  );

  ipcMain.handle(orchestrationListRunsChannel, async (_event, input: { parentThreadId: string }) => {
    return deps.sessionManager.listOrchestrationRuns(input.parentThreadId);
  });

  ipcMain.handle(orchestrationGetRunChannel, async (_event, input: { runId: string }) => {
    return deps.sessionManager.getOrchestrationRun(input.runId);
  });

  ipcMain.handle(
    orchestrationApproveProposalChannel,
    async (_event, input: { runId: string; selectedTaskKeys?: string[] }) => {
      const ok = await deps.sessionManager.approveOrchestrationProposal(input.runId, input.selectedTaskKeys);
      return { ok };
    }
  );

  ipcMain.handle(orchestrationStopChildChannel, async (_event, input: { childThreadId: string }) => {
    const ok = await deps.sessionManager.stopOrchestrationChild(input.childThreadId);
    return { ok };
  });

  ipcMain.handle(orchestrationRetryChildChannel, async (_event, input: { childRowId: string }) => {
    const ok = await deps.sessionManager.retryOrchestrationChild(input.childRowId);
    return { ok };
  });

  ipcMain.handle(IPC_CHANNELS.sessionsStart, async (_event, input: { threadId: string; options?: CodexThreadOptions }) => {
    const thread = deps.repository.getThread(input.threadId);
    if (!thread) {
      throw new Error("Thread not found");
    }

    const project = deps.repository.getProject(thread.projectId);
    if (!project) {
      throw new Error("Project not found");
    }

    const session = await deps.sessionManager.start(thread, project.path, input.options);

    return session;
  });

  ipcMain.handle(IPC_CHANNELS.sessionsStop, async (_event, input: { threadId: string }) => {
    const ok = deps.sessionManager.stop(input.threadId);
    return { ok };
  });

  ipcMain.handle(
    IPC_CHANNELS.sessionsSendInput,
    async (
      _event,
      input: {
        threadId: string;
        input: string;
        options?: CodexThreadOptions;
        attachments?: PromptAttachment[];
        skills?: Array<{ name: string; path: string }>;
      }
    ) => {
      const ok = await deps.sessionManager.sendInput(
        input.threadId,
        input.input,
        input.options,
        input.attachments,
        input.skills
      );
      return { ok };
    }
  );

  const sessionsSteerChannel = (IPC_CHANNELS as Record<string, string>).sessionsSteer ?? "sessions:steer";
  ipcMain.handle(
    sessionsSteerChannel,
    async (
      _event,
      input: {
        threadId: string;
        input: string;
        attachments?: PromptAttachment[];
        skills?: Array<{ name: string; path: string }>;
      }
    ) => {
      const ok = await deps.sessionManager.steerInput(input.threadId, input.input, input.attachments, input.skills);
      return { ok };
    }
  );

  const sessionsSubmitUserInputChannel =
    (IPC_CHANNELS as Record<string, string>).sessionsSubmitUserInput ?? "sessions:submitUserInput";
  ipcMain.handle(
    sessionsSubmitUserInputChannel,
    async (_event, input: { threadId: string; requestId: string; answersByQuestionId: Record<string, string> }) => {
      const ok = await deps.sessionManager.submitUserInputAnswers(
        input.threadId,
        input.requestId,
        input.answersByQuestionId
      );
      return { ok };
    }
  );

  const sessionsCompactChannel = (IPC_CHANNELS as Record<string, string>).sessionsCompact ?? "sessions:compact";
  ipcMain.handle(sessionsCompactChannel, async (_event, input: { threadId: string }) => {
    const ok = await deps.sessionManager.compactThread(input.threadId);
    return { ok };
  });

  const sessionsReviewThreadChannel =
    (IPC_CHANNELS as Record<string, string>).sessionsReviewThread ?? "sessions:reviewThread";
  ipcMain.handle(sessionsReviewThreadChannel, async (_event, input: { threadId: string; instructions?: string }) => {
    const ok = await deps.sessionManager.reviewThread(input.threadId, input.instructions);
    return { ok };
  });

  const sessionsReviewCommitChannel =
    (IPC_CHANNELS as Record<string, string>).sessionsReviewCommit ?? "sessions:reviewCommit";
  ipcMain.handle(sessionsReviewCommitChannel, async (_event, input: { threadId: string; sha: string; title?: string }) => {
    const ok = await deps.sessionManager.reviewCommit(input.threadId, input.sha, input.title);
    return { ok };
  });

  ipcMain.handle(
    IPC_CHANNELS.sessionsGenerateThreadMetadata,
    async (_event, input: { threadId: string; input: string; options?: CodexThreadOptions }) => {
      return deps.sessionManager.generateThreadMetadata(input.threadId, input.input, input.options);
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.sessionsResize,
    async (_event, input: { threadId: string; cols: number; rows: number }) => {
      const ok = deps.sessionManager.resize(input.threadId, input.cols, input.rows);
      return { ok };
    }
  );

  ipcMain.handle(IPC_CHANNELS.installerDoctor, async () => deps.installerManager.doctor());

  ipcMain.handle(IPC_CHANNELS.installerInstallCli, async (_event, input: { provider: "codex" | "gemini" }) => {
    return deps.installerManager.installCli(input.provider);
  });

  ipcMain.handle(
    IPC_CHANNELS.installerInstallDependencies,
    async (_event, input?: { targets?: Array<"node" | "npm" | "git" | "rg" | "codex"> }) => {
      return deps.installerManager.installDependencies(input?.targets, pushInstallLog);
    }
  );

  ipcMain.handle(IPC_CHANNELS.installerVerify, async () => deps.installerManager.verify());

  ipcMain.handle(
    IPC_CHANNELS.permissionsEvaluate,
    async (_event, input: { threadId?: string; command: string; cwd: string; approve?: boolean }) => {
      return deps.permissionEngine.evaluate(input);
    }
  );

  ipcMain.handle(IPC_CHANNELS.permissionsSetMode, async (_event, input: { mode: PermissionMode }) => {
    deps.permissionEngine.setMode(input.mode);
    const settings = deps.repository.setSettings({ permissionMode: input.mode });
    pushSettingsChanged(settings);
    return { ok: true };
  });

  ipcMain.handle(IPC_CHANNELS.permissionsGetMode, async () => deps.permissionEngine.getMode());

  ipcMain.handle(IPC_CHANNELS.settingsGet, async () => deps.repository.getSettings());

  ipcMain.handle(IPC_CHANNELS.settingsSet, async (_event, input) => {
    const settings = deps.repository.setSettings(input);
    deps.permissionEngine.setMode(settings.permissionMode);
    pushSettingsChanged(settings);
    return settings;
  });

  const settingsOpenWindowChannel =
    (IPC_CHANNELS as Record<string, string>).settingsOpenWindow ?? "settings:openWindow";
  ipcMain.handle(settingsOpenWindowChannel, async () => deps.settingsWindow.open());

  ipcMain.handle(IPC_CHANNELS.updatesCheck, async () => deps.updaterService.checkForUpdates());

  ipcMain.handle(IPC_CHANNELS.updatesApply, async () => deps.updaterService.applyUpdate());

  ipcMain.handle(IPC_CHANNELS.windowMinimize, async (event) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    if (!window || window.isDestroyed()) {
      return { ok: false };
    }
    window.minimize();
    return { ok: true };
  });

  ipcMain.handle(IPC_CHANNELS.windowToggleMaximize, async (event) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    if (!window || window.isDestroyed()) {
      return { ok: false, maximized: false };
    }
    if (window.isMaximized()) {
      window.unmaximize();
    } else {
      window.maximize();
    }
    return { ok: true, maximized: window.isMaximized() };
  });

  ipcMain.handle(IPC_CHANNELS.windowClose, async (event) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    if (!window || window.isDestroyed()) {
      return { ok: false };
    }
    window.close();
    return { ok: true };
  });

  ipcMain.handle(IPC_CHANNELS.windowIsMaximized, async (event) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    if (!window || window.isDestroyed()) {
      return { ok: false, maximized: false };
    }
    return { ok: true, maximized: window.isMaximized() };
  });

  ipcMain.handle(IPC_CHANNELS.gitGetState, async (_event, input: { projectId: string }) => {
    return deps.gitService.getState(getProjectPath(input.projectId));
  });

  ipcMain.handle(gitGetSnapshotChannel, async (_event, input: { projectId: string }) => {
    return deps.gitService.getSnapshot(getProjectPath(input.projectId));
  });

  ipcMain.handle(IPC_CHANNELS.gitGetDiff, async (_event, input: { projectId: string; path?: string }) => {
    return deps.gitService.getDiff(getProjectPath(input.projectId), input.path);
  });

  ipcMain.handle(gitGetOutgoingCommitsChannel, async (_event, input: { projectId: string }) => {
    return deps.gitService.getOutgoingCommits(getProjectPath(input.projectId));
  });

  ipcMain.handle(gitGetIncomingCommitsChannel, async (_event, input: { projectId: string }) => {
    return deps.gitService.getIncomingCommits(getProjectPath(input.projectId));
  });

  ipcMain.handle(gitGetSharedHistoryChannel, async (_event, input: { projectId: string; limit?: number }) => {
    return deps.gitService.getSharedHistory(getProjectPath(input.projectId), input.limit);
  });

  ipcMain.handle(IPC_CHANNELS.gitFetch, async (_event, input: { projectId: string }) => {
    return deps.gitService.fetch(getProjectPath(input.projectId));
  });

  ipcMain.handle(IPC_CHANNELS.gitPull, async (_event, input: { projectId: string }) => {
    return deps.gitService.pull(getProjectPath(input.projectId));
  });

  ipcMain.handle(IPC_CHANNELS.gitPush, async (_event, input: { projectId: string }) => {
    return deps.gitService.push(getProjectPath(input.projectId));
  });

  ipcMain.handle(IPC_CHANNELS.gitSync, async (_event, input: { projectId: string }) => {
    return deps.gitService.sync(getProjectPath(input.projectId));
  });

  ipcMain.handle(IPC_CHANNELS.gitStage, async (_event, input: { projectId: string; path?: string }) => {
    return deps.gitService.stage(getProjectPath(input.projectId), input.path);
  });

  ipcMain.handle(IPC_CHANNELS.gitUnstage, async (_event, input: { projectId: string; path?: string }) => {
    return deps.gitService.unstage(getProjectPath(input.projectId), input.path);
  });

  ipcMain.handle(gitDiscardChannel, async (_event, input: { projectId: string; path?: string }) => {
    return deps.gitService.discard(getProjectPath(input.projectId), input.path);
  });

  ipcMain.handle(IPC_CHANNELS.gitCommit, async (_event, input: { projectId: string; message?: string }) => {
    return deps.gitService.commit(getProjectPath(input.projectId), input.message);
  });

  ipcMain.handle(gitResolveConflictsAiChannel, async (_event, input: { projectId: string }) => {
    return deps.gitService.resolveConflictsAi(getProjectPath(input.projectId));
  });

  ipcMain.handle(gitInitChannel, async (_event, input: { projectId: string }) => {
    return deps.gitService.init(getProjectPath(input.projectId));
  });

  ipcMain.handle(IPC_CHANNELS.gitCheckoutBranch, async (_event, input: { projectId: string; branch: string }) => {
    return deps.gitService.checkoutBranch(getProjectPath(input.projectId), input.branch);
  });

  ipcMain.handle(
    IPC_CHANNELS.gitCreateBranch,
    async (_event, input: { projectId: string; branch: string; checkout?: boolean }) => {
      return deps.gitService.createBranch(getProjectPath(input.projectId), input.branch, input.checkout ?? true);
    }
  );

  ipcMain.handle(IPC_CHANNELS.gitOpenPopout, async (_event, input: { projectId: string; projectName?: string }) => {
    return deps.gitPopout.open(input.projectId, input.projectName);
  });

  ipcMain.handle(IPC_CHANNELS.gitClosePopout, async () => {
    return deps.gitPopout.close();
  });

  const skillsListChannel = (IPC_CHANNELS as Record<string, string>).skillsList ?? "skills:list";
  ipcMain.handle(skillsListChannel, async (_event, input?: { projectId?: string }) => {
    return deps.sessionManager.listSkills(input?.projectId);
  });

  const skillsSetEnabledChannel = (IPC_CHANNELS as Record<string, string>).skillsSetEnabled ?? "skills:setEnabled";
  ipcMain.handle(skillsSetEnabledChannel, async (_event, input: { projectId?: string; path: string; enabled: boolean }) => {
    const ok = await deps.sessionManager.setSkillEnabled(input.projectId, input.path, input.enabled);
    return { ok };
  });

  const skillsReadDocumentChannel =
    (IPC_CHANNELS as Record<string, string>).skillsReadDocument ?? "skills:readDocument";
  ipcMain.handle(skillsReadDocumentChannel, async (_event, input: { path: string }) => {
    const filePath = resolveSkillDocumentPath(input.path);
    const metadata = await stat(filePath);
    if (!metadata.isFile()) {
      throw new Error("Skill document path is not a file.");
    }
    if (metadata.size > SKILL_DOC_MAX_BYTES) {
      throw new Error("Skill document is too large.");
    }
    const content = await readFile(filePath, "utf8");
    return { content };
  });

  const skillsWriteDocumentChannel =
    (IPC_CHANNELS as Record<string, string>).skillsWriteDocument ?? "skills:writeDocument";
  ipcMain.handle(skillsWriteDocumentChannel, async (_event, input: { path: string; content: string }) => {
    const filePath = resolveSkillDocumentPath(input.path);
    if (Buffer.byteLength(input.content, "utf8") > SKILL_DOC_MAX_BYTES) {
      throw new Error("Skill document is too large.");
    }
    await writeFile(filePath, input.content, "utf8");
    return { ok: true };
  });

  return {
    emitSessionEvent: pushSessionEvent,
    emitProjectTerminalEvent: pushProjectTerminalEvent
  };
};
