import { join, resolve } from "node:path";
import { app, BrowserWindow } from "electron";
import log from "electron-log";
import type { SessionEvent } from "@code-app/shared";
import { initializeDatabase } from "./services/database";
import { createAppPaths } from "./services/paths";
import { Repository } from "./services/repository";
import { PermissionEngine } from "./services/permissionEngine";
import { SessionManager } from "./services/sessionManager";
import { InstallerManager } from "./services/installerManager";
import { UpdaterService } from "./services/updaterService";
import { registerIpcHandlers } from "./ipc/registerHandlers";

let mainWindow: BrowserWindow | null = null;

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
      sandbox: false
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
  const sessionManager = new SessionManager({
    repository,
    permissionEngine,
    emit: (event) => emitSessionEvent(event)
  });

  const handlers = registerIpcHandlers({
    repository,
    permissionEngine,
    installerManager,
    updaterService,
    sessionManager
  });
  emitSessionEvent = handlers.emitSessionEvent;

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
