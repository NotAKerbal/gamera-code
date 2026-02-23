import { BrowserWindow, dialog, ipcMain, type OpenDialogOptions } from "electron";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
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

export interface HandlerDeps {
  repository: Repository;
  sessionManager: SessionManager;
  projectTerminalManager: ProjectTerminalManager;
  installerManager: InstallerManager;
  permissionEngine: PermissionEngine;
  updaterService: UpdaterService;
  preview: {
    openPopout: (url: string) => Promise<{ ok: boolean }>;
    closePopout: () => Promise<{ ok: boolean }>;
    navigate: (url: string) => Promise<{ ok: boolean }>;
  };
}

export const registerIpcHandlers = (deps: HandlerDeps) => {
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
        devCommands?: Array<{ id: string; name: string; command: string }>;
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

  ipcMain.handle(IPC_CHANNELS.projectTerminalStop, async (_event, input: { projectId: string }) => {
    return deps.projectTerminalManager.stop(input.projectId);
  });

  ipcMain.handle(IPC_CHANNELS.projectTerminalGetState, async (_event, input: { projectId: string }) => {
    return deps.projectTerminalManager.getState(input.projectId);
  });

  ipcMain.handle(IPC_CHANNELS.previewOpenPopout, async (_event, input: { url: string }) => {
    return deps.preview.openPopout(input.url);
  });

  ipcMain.handle(IPC_CHANNELS.previewClosePopout, async () => {
    return deps.preview.closePopout();
  });

  ipcMain.handle(IPC_CHANNELS.previewNavigate, async (_event, input: { url: string }) => {
    return deps.preview.navigate(input.url);
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

  ipcMain.handle(IPC_CHANNELS.threadsEvents, async (_event, input: { threadId: string }) => {
    return deps.repository.listMessages(input.threadId);
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

  ipcMain.handle(IPC_CHANNELS.updatesCheck, async () => deps.updaterService.checkForUpdates());

  ipcMain.handle(IPC_CHANNELS.updatesApply, async () => deps.updaterService.applyUpdate());

  return {
    emitSessionEvent: pushSessionEvent,
    emitProjectTerminalEvent: pushProjectTerminalEvent
  };
};
