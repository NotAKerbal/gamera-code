import { BrowserWindow, dialog, ipcMain, shell, type OpenDialogOptions } from "electron";
import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import {
  IPC_CHANNELS,
  type CodexThreadOptions,
  type PermissionMode,
  type ProjectTerminalEvent,
  type PromptAttachment,
  type SessionEvent,
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
  const normalizePath = (path: string) => resolve(path);
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

  const openNativeTerminal = (cwd: string) => {
    if (process.platform === "win32") {
      spawn("cmd.exe", ["/c", "start", "", "cmd.exe", "/k", `cd /d "${cwd}"`], {
        cwd,
        detached: true,
        stdio: "ignore",
        windowsHide: false
      }).unref();
      return;
    }

    if (process.platform === "darwin") {
      spawn("open", ["-a", "Terminal", cwd], {
        cwd,
        detached: true,
        stdio: "ignore"
      }).unref();
      return;
    }

    // Linux fallback: this will open the folder if no terminal command is available.
    shell.openPath(cwd).catch(() => undefined);
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

  ipcMain.handle(IPC_CHANNELS.projectsList, async () => deps.repository.listProjects());

  ipcMain.handle(IPC_CHANNELS.projectsCreate, async (_event, input: { name: string; path: string }) => {
    return deps.repository.createProject(input);
  });

  ipcMain.handle(
    IPC_CHANNELS.projectsCreateInDirectory,
    async (_event, input: { name: string; parentDir: string }) => {
      const trimmedName = input.name.trim();
      if (!trimmedName) {
        throw new Error("Project name is required.");
      }
      const targetPath = join(input.parentDir, trimmedName);
      mkdirSync(targetPath);
      return deps.repository.createProject({ name: trimmedName, path: targetPath });
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

  ipcMain.handle(IPC_CHANNELS.projectsUpdate, async (_event, input: { id: string; name?: string; path?: string }) => {
    return deps.repository.updateProject(input);
  });

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

  ipcMain.handle(IPC_CHANNELS.projectsOpenTerminal, async (_event, input: { projectId: string }) => {
    const projectPath = getProjectPath(input.projectId);
    openNativeTerminal(projectPath);
    return { ok: true };
  });

  ipcMain.handle(IPC_CHANNELS.projectsOpenFiles, async (_event, input: { projectId: string }) => {
    const projectPath = getProjectPath(input.projectId);
    await shell.openPath(projectPath);
    return { ok: true };
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
      input: { id: string; title?: string; provider?: "codex" | "gemini"; status?: ThreadStatus }
    ) => {
      return deps.repository.updateThread(input);
    }
  );

  ipcMain.handle(IPC_CHANNELS.threadsArchive, async (_event, input: { id: string; archived: boolean }) => {
    return deps.repository.archiveThread(input.id, input.archived);
  });

  ipcMain.handle(
    IPC_CHANNELS.threadsEvents,
    async (_event, input: { threadId: string; beforeStreamSeq?: number; userPromptCount?: number }) => {
      return deps.repository.listMessages(input);
    }
  );

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
    async (_event, input: { threadId: string; input: string; options?: CodexThreadOptions; attachments?: PromptAttachment[] }) => {
      const ok = await deps.sessionManager.sendInput(input.threadId, input.input, input.options, input.attachments);
      return { ok };
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
      return deps.installerManager.installDependencies(input?.targets);
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
    deps.repository.setSettings({ permissionMode: input.mode });
    return { ok: true };
  });

  ipcMain.handle(IPC_CHANNELS.permissionsGetMode, async () => deps.permissionEngine.getMode());

  ipcMain.handle(IPC_CHANNELS.settingsGet, async () => deps.repository.getSettings());

  ipcMain.handle(IPC_CHANNELS.settingsSet, async (_event, input) => deps.repository.setSettings(input));

  const settingsOpenWindowChannel =
    (IPC_CHANNELS as Record<string, string>).settingsOpenWindow ?? "settings:openWindow";
  ipcMain.handle(settingsOpenWindowChannel, async () => deps.settingsWindow.open());

  ipcMain.handle(IPC_CHANNELS.updatesCheck, async () => deps.updaterService.checkForUpdates());

  ipcMain.handle(IPC_CHANNELS.updatesApply, async () => deps.updaterService.applyUpdate());

  ipcMain.handle(IPC_CHANNELS.gitGetState, async (_event, input: { projectId: string }) => {
    return deps.gitService.getState(getProjectPath(input.projectId));
  });

  ipcMain.handle(IPC_CHANNELS.gitGetDiff, async (_event, input: { projectId: string; path?: string }) => {
    return deps.gitService.getDiff(getProjectPath(input.projectId), input.path);
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

  ipcMain.handle(IPC_CHANNELS.gitCommit, async (_event, input: { projectId: string; message?: string }) => {
    return deps.gitService.commit(getProjectPath(input.projectId), input.message);
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

  return {
    emitSessionEvent: pushSessionEvent,
    emitProjectTerminalEvent: pushProjectTerminalEvent
  };
};
