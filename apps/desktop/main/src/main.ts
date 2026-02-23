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

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const escapeJsString = (value: string) =>
  value
    .replace(/\\/g, "\\\\")
    .replace(/"/g, "\\\"")
    .replace(/\n/g, "\\n");

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

const buildPreviewPopoutHtml = (initialUrl: string) => {
  const safeUrl = escapeHtml(initialUrl);
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Project Preview</title>
    <style>
      :root {
        color-scheme: dark;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }
      body {
        margin: 0;
        background: #0d0d0d;
        color: #e5e7eb;
        height: 100vh;
        display: flex;
        flex-direction: column;
      }
      .toolbar {
        display: grid;
        grid-template-columns: 1fr auto auto;
        gap: 8px;
        padding: 10px;
        border-bottom: 1px solid #2f2f2f;
        background: #111;
      }
      .url {
        height: 34px;
        border: 1px solid #3a3a3a;
        border-radius: 8px;
        background: #161616;
        color: #e5e7eb;
        padding: 0 10px;
        font-size: 13px;
      }
      .btn {
        height: 34px;
        border: 1px solid #3a3a3a;
        border-radius: 8px;
        background: #191919;
        color: #e5e7eb;
        padding: 0 10px;
        font-size: 12px;
        cursor: pointer;
      }
      .btn:hover {
        background: #222;
      }
      .layout {
        flex: 1;
        min-height: 0;
        display: flex;
        flex-direction: column;
      }
      .viewport-wrap {
        flex: 1;
        min-height: 0;
        display: flex;
        justify-content: stretch;
        align-items: stretch;
        padding: 0;
        overflow: auto;
      }
      iframe {
        width: 100%;
        border: 0;
        background: white;
        flex: 1;
      }
      .status {
        margin-left: 8px;
        color: #9ca3af;
        font-size: 11px;
      }
    </style>
  </head>
  <body>
    <div class="toolbar">
      <input id="urlInput" class="url" value="${safeUrl}" />
      <button id="goBtn" class="btn">Go</button>
      <button id="refreshBtn" class="btn">Refresh</button>
      <span id="status" class="status">Ready</span>
    </div>
    <div class="layout">
      <div class="viewport-wrap">
        <iframe id="previewFrame" allow="clipboard-read; clipboard-write"></iframe>
      </div>
    </div>
    <script>
      const allowedHosts = new Set(["localhost", "127.0.0.1"]);
      const statusEl = document.getElementById("status");
      const urlInput = document.getElementById("urlInput");
      const frame = document.getElementById("previewFrame");
      const setStatus = (text) => {
        if (statusEl) statusEl.textContent = text;
      };
      const normalizeUrl = (value) => {
        try {
          const parsed = new URL(value);
          if (!["http:", "https:"].includes(parsed.protocol)) return null;
          if (!allowedHosts.has(parsed.hostname)) return null;
          return parsed.toString();
        } catch {
          return null;
        }
      };
      const tryNavigate = (nextUrl, attempts = 0) => {
        const normalized = normalizeUrl(nextUrl);
        if (!normalized) {
          setStatus("Invalid preview URL. Use localhost/127.0.0.1.");
          return false;
        }
        if (urlInput) urlInput.value = normalized;
        frame.src = normalized;
        setStatus(attempts > 0 ? "Retrying..." : "Loading...");
        return true;
      };
      window.__codeappNavigate = (nextUrl) => {
        tryNavigate(nextUrl);
      };
      frame.addEventListener("load", () => {
        const href = frame.contentWindow ? String(frame.contentWindow.location.href || "") : "";
        if (href.startsWith("chrome-error://")) {
          setStatus("Server not ready, retrying...");
          const target = urlInput ? urlInput.value : "";
          setTimeout(() => {
            frame.src = target;
          }, 500);
          return;
        }
        setStatus("Loaded");
      });
      document.getElementById("goBtn").addEventListener("click", () => {
        tryNavigate(urlInput.value);
      });
      document.getElementById("refreshBtn").addEventListener("click", () => {
        frame.src = frame.src;
        setStatus("Refreshing...");
      });
      urlInput.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          tryNavigate(urlInput.value);
        }
      });
      tryNavigate("${safeUrl}");
    </script>
  </body>
</html>`;
};

const formatPreviewWindowTitle = (projectName?: string) => {
  const name = projectName?.trim();
  return name ? `Project Preview — ${name}` : "Project Preview";
};

const ensurePreviewPopout = async (url: string, projectName?: string) => {
  if (!isAllowedPreviewUrl(url)) {
    throw new Error("Preview URL must target localhost or 127.0.0.1 over http/https.");
  }
  if (!previewPopoutWindow || previewPopoutWindow.isDestroyed()) {
    previewPopoutWindow = new BrowserWindow({
      width: 420,
      height: 780,
      minWidth: 320,
      minHeight: 480,
      title: formatPreviewWindowTitle(projectName),
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
  previewPopoutWindow.setTitle(formatPreviewWindowTitle(projectName));
  const html = buildPreviewPopoutHtml(url);
  const dataUrl = `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;
  await loadPreviewUrlWithRetry(previewPopoutWindow, dataUrl);
  previewPopoutWindow.show();
  previewPopoutWindow.focus();
};

const navigatePreviewPopout = async (url: string, projectName?: string) => {
  if (!isAllowedPreviewUrl(url)) {
    throw new Error("Preview URL must target localhost or 127.0.0.1 over http/https.");
  }
  if (!previewPopoutWindow || previewPopoutWindow.isDestroyed()) {
    await ensurePreviewPopout(url, projectName);
    return;
  }
  previewPopoutWindow.setTitle(formatPreviewWindowTitle(projectName));

  try {
    await previewPopoutWindow.webContents.executeJavaScript(
      `window.__codeappNavigate && window.__codeappNavigate("${escapeJsString(url)}");`,
      true
    );
  } catch {
    await ensurePreviewPopout(url, projectName);
    return;
  }
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
      openPopout: async (url: string, projectName?: string) => {
        await ensurePreviewPopout(url, projectName);
        return { ok: true };
      },
      closePopout: async () => {
        if (previewPopoutWindow && !previewPopoutWindow.isDestroyed()) {
          previewPopoutWindow.close();
        }
        previewPopoutWindow = null;
        return { ok: true };
      },
      navigate: async (url: string, projectName?: string) => {
        await navigatePreviewPopout(url, projectName);
        return { ok: true };
      },
      openDevTools: async () => {
        if (!previewPopoutWindow || previewPopoutWindow.isDestroyed()) {
          return { ok: false };
        }
        previewPopoutWindow.webContents.openDevTools({ mode: "detach" });
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
