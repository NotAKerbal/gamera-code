import { join, resolve } from "node:path";
import { app, BrowserWindow } from "electron";
import log from "electron-log";
import type { ProjectTerminalEvent, SessionEvent } from "@code-app/shared";
import { initializeDatabase } from "./services/database";
import { createAppPaths } from "./services/paths";
import { Repository } from "./services/repository";
import { PermissionEngine } from "./services/permissionEngine";
import { SessionManager } from "./services/sessionManager";
import { ProjectTerminalManager } from "./services/projectTerminalManager";
import { InstallerManager } from "./services/installerManager";
import { UpdaterService } from "./services/updaterService";
import { registerIpcHandlers } from "./ipc/registerHandlers";

let mainWindow: BrowserWindow | null = null;
let previewPopoutWindow: BrowserWindow | null = null;
const PREVIEW_LOAD_MAX_ATTEMPTS = 6;
const PREVIEW_LOAD_BASE_DELAY_MS = 350;

const isAllowedPreviewUrl = (value: string): boolean => {
  try {
    const url = new URL(value);
    if (!(url.protocol === "http:" || url.protocol === "https:")) {
      return false;
    }
    return url.hostname === "localhost" || url.hostname === "127.0.0.1";
  } catch {
    return false;
  }
};

const createWindow = () => {
  mainWindow = new BrowserWindow({
    width: 1520,
    height: 980,
    minWidth: 1100,
    minHeight: 700,
    titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "default",
    backgroundColor: "#0b0d10",
    webPreferences: {
      preload: join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      webviewTag: true
    }
  });

  const devServerUrl = process.env.VITE_DEV_SERVER_URL;

  if (devServerUrl) {
    mainWindow.loadURL(devServerUrl).catch((error) => {
      log.error("Failed to load dev server", error);
    });
    mainWindow.webContents.openDevTools({ mode: "detach" });
  } else {
    const indexPath = resolve(__dirname, "../../renderer/dist/index.html");
    mainWindow.loadFile(indexPath).catch((error) => {
      log.error("Failed to load renderer build", error);
    });
  }
};

const delay = (ms: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });

const isRetryablePreviewError = (error: unknown): boolean => {
  const text = error instanceof Error ? error.message : String(error);
  return text.includes("ERR_CONNECTION_REFUSED") || text.includes("ERR_CONNECTION_RESET");
};

const loadPreviewUrlWithRetry = async (window: BrowserWindow, url: string) => {
  let lastError: unknown;
  for (let attempt = 1; attempt <= PREVIEW_LOAD_MAX_ATTEMPTS; attempt += 1) {
    try {
      await window.loadURL(url);
      return;
    } catch (error) {
      lastError = error;
      if (!isRetryablePreviewError(error) || attempt === PREVIEW_LOAD_MAX_ATTEMPTS) {
        break;
      }
      await delay(PREVIEW_LOAD_BASE_DELAY_MS * attempt);
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError));
};

const ensurePreviewPopout = async (url: string) => {
  if (!isAllowedPreviewUrl(url)) {
    throw new Error("Preview URL must target localhost or 127.0.0.1 over http/https.");
  }
  if (!previewPopoutWindow || previewPopoutWindow.isDestroyed()) {
    previewPopoutWindow = new BrowserWindow({
      width: 1200,
      height: 820,
      minWidth: 700,
      minHeight: 500,
      title: "Project Preview",
      backgroundColor: "#0b0d10",
      webPreferences: {
        contextIsolation: true,
        sandbox: true,
        nodeIntegration: false
      }
    });
    previewPopoutWindow.on("closed", () => {
      previewPopoutWindow = null;
    });
  }
  await loadPreviewUrlWithRetry(previewPopoutWindow, url);
  previewPopoutWindow.show();
  previewPopoutWindow.focus();
};

const bootstrap = async () => {
  await app.whenReady();

  const paths = createAppPaths(app.getPath("userData"));
  const db = initializeDatabase(paths.dbPath);
  const repository = new Repository(db, paths);
  const permissionEngine = new PermissionEngine(repository, repository.getSettings().permissionMode);
  const installerManager = new InstallerManager(repository);

  createWindow();

  if (!mainWindow) {
    throw new Error("Main window did not initialize");
  }

  const updaterService = new UpdaterService();
  let emitSessionEvent = (_event: SessionEvent) => {};
  let emitProjectTerminalEvent = (_event: ProjectTerminalEvent) => {};
  const sessionManager = new SessionManager({
    repository,
    permissionEngine,
    emit: (event) => emitSessionEvent(event)
  });
  const projectTerminalManager = new ProjectTerminalManager({
    repository,
    emit: (event) => emitProjectTerminalEvent(event)
  });

  app.on("web-contents-created", (_event, contents) => {
    contents.on("will-attach-webview", (attachEvent, webPreferences, params) => {
      webPreferences.preload = "";
      webPreferences.nodeIntegration = false;
      webPreferences.contextIsolation = true;
      webPreferences.sandbox = true;
      const src = typeof params.src === "string" ? params.src : "";
      if (!isAllowedPreviewUrl(src)) {
        attachEvent.preventDefault();
      }
    });
  });

  const handlers = registerIpcHandlers({
    repository,
    permissionEngine,
    installerManager,
    updaterService,
    sessionManager,
    projectTerminalManager,
    preview: {
      openPopout: async (url: string) => {
        await ensurePreviewPopout(url);
        return { ok: true };
      },
      closePopout: async () => {
        if (previewPopoutWindow && !previewPopoutWindow.isDestroyed()) {
          previewPopoutWindow.close();
        }
        previewPopoutWindow = null;
        return { ok: true };
      },
      navigate: async (url: string) => {
        await ensurePreviewPopout(url);
        return { ok: true };
      }
    }
  });
  emitSessionEvent = handlers.emitSessionEvent;
  emitProjectTerminalEvent = handlers.emitProjectTerminalEvent;

  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") {
      app.quit();
    }
  });
};

bootstrap().catch((error) => {
  log.error("App bootstrap failed", error);
  app.quit();
});
