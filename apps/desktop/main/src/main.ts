import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { app, BrowserWindow, nativeImage } from "electron";
import log from "electron-log";
import { IPC_CHANNELS, type ProjectTerminalEvent, type SessionEvent } from "@code-app/shared";
import { initializeDatabase } from "./services/database";
import { createAppPaths } from "./services/paths";
import { Repository } from "./services/repository";
import { PermissionEngine } from "./services/permissionEngine";
import { SessionManager } from "./services/sessionManager";
import { ProjectTerminalManager } from "./services/projectTerminalManager";
import { InstallerManager } from "./services/installerManager";
import { UpdaterService } from "./services/updaterService";
import { GitService } from "./services/gitService";
import { registerIpcHandlers } from "./ipc/registerHandlers";
import { applyRuntimePathToProcessEnv } from "./utils/runtimeEnv";

let mainWindow: BrowserWindow | null = null;
let previewPopoutWindow: BrowserWindow | null = null;
let gitPopoutWindow: BrowserWindow | null = null;
let webLinkWindow: BrowserWindow | null = null;
let settingsWindow: BrowserWindow | null = null;
let webLinkCurrentUrl: string | null = null;
const PREVIEW_LOAD_MAX_ATTEMPTS = 6;
const PREVIEW_LOAD_BASE_DELAY_MS = 350;
const APP_ICON_FILENAME = "icon_rounded.png";

const resolveAppIconPath = (): string | undefined => {
  const devPath = resolve(__dirname, "../../resources", APP_ICON_FILENAME);
  const packagedPath = join(process.resourcesPath, "assets", APP_ICON_FILENAME);
  const candidates = app.isPackaged ? [packagedPath, devPath] : [devPath, packagedPath];
  return candidates.find((candidate) => existsSync(candidate));
};

const getBrowserWindowIcon = () => {
  const iconPath = resolveAppIconPath();
  return iconPath ? { icon: iconPath } : {};
};

const getAppIconDataUrl = (size = 26): string => {
  const iconPath = resolveAppIconPath();
  if (!iconPath) {
    return "";
  }
  try {
    const icon = nativeImage.createFromPath(iconPath);
    if (!icon.isEmpty()) {
      return icon.resize({ width: size, height: size, quality: "best" }).toDataURL();
    }
    return `data:image/png;base64,${readFileSync(iconPath).toString("base64")}`;
  } catch {
    return "";
  }
};

const getAppIconFileUrl = (): string => {
  const iconPath = resolveAppIconPath();
  if (!iconPath) {
    return "";
  }
  try {
    return pathToFileURL(iconPath).toString();
  } catch {
    return "";
  }
};

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

const isAllowedWebLinkUrl = (value: string): boolean => {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
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
  const isMac = process.platform === "darwin";
  const isWindows = process.platform === "win32";

  mainWindow = new BrowserWindow({
    width: 1520,
    height: 980,
    minWidth: 1100,
    minHeight: 700,
    frame: !isWindows,
    titleBarStyle: isMac ? "hiddenInset" : "default",
    titleBarOverlay: false,
    trafficLightPosition: isMac
      ? {
          x: 14,
          y: 14
        }
      : undefined,
    backgroundColor: "#0b0d10",
    ...getBrowserWindowIcon(),
    webPreferences: {
      preload: join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      webviewTag: true
    }
  });

  mainWindow.webContents.setWindowOpenHandler(({ frameName }) => {
    if (!frameName.startsWith("codeapp-terminal-")) {
      return { action: "allow" };
    }
    return {
      action: "allow",
      overrideBrowserWindowOptions: {
        autoHideMenuBar: true,
        frame: process.platform !== "win32",
        titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "default",
        titleBarOverlay: false,
        backgroundColor: "#0b0d10",
        ...getBrowserWindowIcon(),
        webPreferences: {
          preload: join(__dirname, "preload.js"),
          contextIsolation: true,
          nodeIntegration: false,
          sandbox: false
        }
      }
    };
  });

  const devServerUrl = process.env.VITE_DEV_SERVER_URL;
  if (devServerUrl) {
    mainWindow.loadURL(devServerUrl).catch((error) => {
      log.error("Failed to load dev server", error);
    });
    mainWindow.webContents.openDevTools({ mode: "detach" });
    return;
  }

  // In production, __dirname points to ".../Resources/app.asar/dist".
  // Renderer assets are copied to ".../Resources/app.asar/dist/renderer" at build time.
  const indexPath = resolve(__dirname, "./renderer/index.html");
  mainWindow.loadFile(indexPath).catch((error) => {
    log.error("Failed to load renderer build", error);
  });
};

const loadRendererWindow = async (window: BrowserWindow, query: Record<string, string> = {}) => {
  const devServerUrl = process.env.VITE_DEV_SERVER_URL;
  if (devServerUrl) {
    const nextUrl = new URL(devServerUrl);
    Object.entries(query).forEach(([key, value]) => {
      nextUrl.searchParams.set(key, value);
    });
    await window.loadURL(nextUrl.toString());
    return;
  }

  const indexPath = resolve(__dirname, "./renderer/index.html");
  await window.loadFile(indexPath, { query });
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

const buildPreviewPopoutHtml = (initialUrl: string, allowLocalOnly = true) => {
  const safeUrl = escapeHtml(initialUrl);
  const safeIconSrc = escapeHtml(getAppIconFileUrl());
  const isMac = process.platform === "darwin";
  const isWindows = process.platform === "win32";
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
      .app-header {
        min-height: 48px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
        padding: 8px 10px;
        border-bottom: 1px solid #2f2f2f;
        background: #0f1013;
        -webkit-app-region: drag;
      }
      .app-header.macos {
        padding-left: 5rem;
      }
      .app-brand {
        display: flex;
        align-items: center;
        gap: 8px;
        min-width: 0;
      }
      .app-icon {
        width: 26px;
        height: 26px;
        border-radius: 8px;
      }
      .app-title {
        font-size: 13px;
        font-weight: 600;
        color: #e2e8f0;
        white-space: nowrap;
      }
      .window-controls {
        display: flex;
        align-items: center;
        gap: 4px;
        -webkit-app-region: no-drag;
      }
      .window-btn {
        width: 34px;
        height: 28px;
        border: 0;
        border-radius: 8px;
        background: transparent;
        color: #cbd5e1;
        font-size: 13px;
        cursor: pointer;
      }
      .window-btn:hover {
        background: #1f2937;
        color: #fff;
      }
      .window-btn.close:hover {
        background: rgba(239, 68, 68, 0.2);
        color: #fee2e2;
      }
      .toolbar {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 10px;
        border-bottom: 1px solid #2f2f2f;
        background: #111;
      }
      .url {
        flex: 1;
        min-width: 0;
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
    <div class="app-header${isMac ? " macos" : ""}">
      <div class="app-brand">
        <img src="${safeIconSrc}" class="app-icon" alt="" />
        <div class="app-title">GameraCode - Browser</div>
      </div>
      ${isWindows ? `<div class="window-controls">
        <button id="windowMinBtn" class="window-btn" title="Minimize">-</button>
        <button id="windowMaxBtn" class="window-btn" title="Maximize or restore">□</button>
        <button id="windowCloseBtn" class="window-btn close" title="Close">×</button>
      </div>` : ""}
    </div>
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
      const allowLocalOnly = ${allowLocalOnly ? "true" : "false"};
      const api = window.desktopAPI;
      const allowedHosts = new Set(["localhost", "127.0.0.1"]);
      const statusEl = document.getElementById("status");
      const urlInput = document.getElementById("urlInput");
      const frame = document.getElementById("previewFrame");
      const windowMinBtn = document.getElementById("windowMinBtn");
      const windowMaxBtn = document.getElementById("windowMaxBtn");
      const windowCloseBtn = document.getElementById("windowCloseBtn");
      const setStatus = (text) => {
        if (statusEl) statusEl.textContent = text;
      };
      const normalizeUrl = (value) => {
        try {
          const parsed = new URL(value);
          if (!["http:", "https:"].includes(parsed.protocol)) return null;
          if (allowLocalOnly && !allowedHosts.has(parsed.hostname)) return null;
          return parsed.toString();
        } catch {
          return null;
        }
      };
      const tryNavigate = (nextUrl, attempts = 0) => {
        const normalized = normalizeUrl(nextUrl);
        if (!normalized) {
          setStatus(allowLocalOnly ? "Invalid preview URL. Use localhost/127.0.0.1." : "Invalid URL.");
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
      const syncWindowState = async () => {
        if (!api?.windowControls || !windowMaxBtn) {
          return;
        }
        const state = await api.windowControls.isMaximized();
        if (state?.ok) {
          windowMaxBtn.textContent = state.maximized ? "❐" : "□";
        }
      };
      if (windowMinBtn) {
        windowMinBtn.addEventListener("click", () => {
          if (api?.windowControls) {
            api.windowControls.minimize().catch(() => undefined);
            return;
          }
          window.close();
        });
      }
      if (windowMaxBtn && api?.windowControls) {
        windowMaxBtn.addEventListener("click", async () => {
          const state = await api.windowControls.toggleMaximize();
          if (state?.ok) {
            windowMaxBtn.textContent = state.maximized ? "❐" : "□";
          }
        });
      }
      if (windowCloseBtn) {
        windowCloseBtn.addEventListener("click", () => {
          if (api?.windowControls) {
            api.windowControls.close().catch(() => undefined);
            return;
          }
          window.close();
        });
      }
      frame.addEventListener("load", () => {
        let href = "";
        try {
          href = frame.contentWindow ? String(frame.contentWindow.location.href || "") : "";
        } catch {
          // Cross-origin iframe access throws in data: origin; treat as successful load.
          setStatus("Loaded");
          return;
        }

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
      syncWindowState().catch(() => undefined);
    </script>
  </body>
</html>`;
};

const formatPreviewWindowTitle = (projectName?: string) => {
  const name = projectName?.trim();
  return name ? `Project Preview — ${name}` : "Project Preview";
};

const ensurePreviewPopout = async (url: string, projectName?: string) => {
  const isMac = process.platform === "darwin";
  const isWindows = process.platform === "win32";
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
      frame: !isWindows,
      titleBarStyle: isMac ? "hiddenInset" : "default",
      titleBarOverlay: false,
      autoHideMenuBar: true,
      backgroundColor: "#0b0d10",
      ...getBrowserWindowIcon(),
      webPreferences: {
        preload: join(__dirname, "preload.js"),
        contextIsolation: true,
        sandbox: false,
        nodeIntegration: false
      }
    });
    previewPopoutWindow.on("closed", () => {
      previewPopoutWindow = null;
      BrowserWindow.getAllWindows().forEach((window) => {
        if (!window.isDestroyed()) {
          window.webContents.send(IPC_CHANNELS.previewEvent, { type: "popout_closed" });
        }
      });
    });
  }
  previewPopoutWindow.setTitle(formatPreviewWindowTitle(projectName));
  await loadEmbeddedBrowserWindow(previewPopoutWindow, url, true);
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
    await navigateEmbeddedBrowserWindow(previewPopoutWindow, url);
  } catch {
    await loadEmbeddedBrowserWindow(previewPopoutWindow, url, true);
  }
  previewPopoutWindow.show();
  previewPopoutWindow.focus();
};

const buildGitPopoutHtml = (projectId: string, projectName?: string) => {
  const safeProjectId = escapeJsString(projectId);
  const safeProjectName = escapeJsString(projectName?.trim() || "Project");
  const safeIconSrc = escapeHtml(getAppIconDataUrl(26));
  const isMac = process.platform === "darwin";
  const isWindows = process.platform === "win32";
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Git</title>
    <style>
      :root {
        color-scheme: dark;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }
      body {
        margin: 0;
        background: #0b0d10;
        color: #e5e7eb;
        height: 100vh;
      }
      .app-header {
        height: 48px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
        padding: 0 10px;
        border-bottom: 1px solid #24272d;
        background: #0b0d10;
        -webkit-app-region: drag;
      }
      .app-header.macos {
        padding-left: 5rem;
      }
      .app-title {
        font-size: 13px;
        font-weight: 600;
        color: #e2e8f0;
      }
      .app-brand {
        display: flex;
        align-items: center;
        gap: 8px;
        min-width: 0;
      }
      .app-icon {
        width: 26px;
        height: 26px;
        border-radius: 8px;
      }
      .window-controls {
        display: flex;
        align-items: center;
        gap: 4px;
        -webkit-app-region: no-drag;
      }
      .window-btn {
        width: 34px;
        height: 28px;
        border: 0;
        border-radius: 8px;
        background: transparent;
        color: #cbd5e1;
        font-size: 13px;
        cursor: pointer;
      }
      .window-btn:hover {
        background: #1f2937;
        color: #fff;
      }
      .window-btn.close:hover {
        background: rgba(239, 68, 68, 0.2);
        color: #fee2e2;
      }
      .window-btn-icon {
        width: 12px;
        height: 12px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
      }
      .window-btn-icon svg {
        width: 12px;
        height: 12px;
        fill: currentColor;
      }
      .window-btn-icon.min svg {
        transform: translateY(2px);
      }
      .shell {
        height: calc(100vh - 48px);
        display: grid;
        grid-template-columns: 360px minmax(0, 1fr);
        background: radial-gradient(circle at top left, #1b1b1b 0%, #111 40%, #0a0a0a 100%);
      }
      .sidebar {
        display: flex;
        flex-direction: column;
        border-right: 1px solid #2a2a2a;
        background: linear-gradient(180deg, #151515 0%, #121212 100%);
        min-height: 0;
        overflow-y: auto;
      }
      .main {
        min-width: 0;
        min-height: 0;
        display: flex;
        flex-direction: column;
        background: #0b0d10;
      }
      .section {
        padding: 10px;
        border-bottom: 1px solid #2a2a2a;
      }
      .section-title {
        font-size: 11px;
        text-transform: uppercase;
        letter-spacing: 0.08em;
        color: #94a3b8;
        margin-bottom: 8px;
      }
      .row {
        display: flex;
        align-items: center;
        gap: 8px;
      }
      .btn {
        min-height: 30px;
        border: 1px solid #2f3640;
        border-radius: 8px;
        background: #12151b;
        color: #dbe3ee;
        padding: 0 10px;
        font-size: 12px;
        cursor: pointer;
      }
      .btn:hover {
        background: #1a202a;
      }
      .btn[disabled] {
        opacity: 0.5;
        cursor: default;
      }
      .btn.secondary {
        background: #11151b;
      }
      .branch-input {
        flex: 1;
        min-width: 120px;
        height: 30px;
        border: 1px solid #2f3640;
        border-radius: 8px;
        background: #10141a;
        color: #e5e7eb;
        padding: 0 10px;
        font-size: 12px;
      }
      .commit-input {
        width: 100%;
        min-height: 48px;
        resize: vertical;
        border: 1px solid #2f3640;
        border-radius: 8px;
        background: #10141a;
        color: #e5e7eb;
        padding: 8px 10px;
        font-size: 12px;
        line-height: 1.35;
        white-space: pre-wrap;
      }
      .meta {
        font-size: 12px;
        color: #cbd5e1;
        min-height: 36px;
      }
      .files {
        flex: 1;
        min-height: 0;
        overflow: auto;
        padding: 8px 10px;
      }
      .files-section {
        display: flex;
        flex-direction: column;
        flex: 1;
        min-height: 180px;
      }
      .file {
        width: 100%;
        text-align: left;
        border: 0;
        background: transparent;
        color: #d1d5db;
        border-radius: 6px;
        padding: 6px 8px;
        margin-bottom: 4px;
        cursor: pointer;
      }
      .file:hover {
        background: #1a202a;
      }
      .file.active {
        background: #1f2937;
        color: #fff;
      }
      .status {
        font-size: 11px;
        color: #94a3b8;
      }
      .action-status {
        margin-top: 8px;
        font-size: 11px;
        color: #94a3b8;
        min-height: 16px;
        white-space: pre-wrap;
      }
      .diff-wrap {
        min-height: 0;
        display: flex;
        flex-direction: column;
        padding: 8px 10px;
      }
      .diff-title {
        font-size: 11px;
        color: #94a3b8;
        margin-bottom: 6px;
      }
      .diff-view {
        margin: 0;
        flex: 1;
        min-height: 0;
        overflow: auto;
        background: #0d1424;
        border: 1px solid #2a2a2a;
        border-radius: 8px;
        padding: 10px;
        font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
        font-size: 11px;
        white-space: pre-wrap;
        word-break: break-word;
      }
      .diff-line {
        display: block;
        white-space: pre-wrap;
        word-break: break-word;
      }
      .diff-line.add {
        background: rgba(16, 185, 129, 0.18);
        color: #86efac;
      }
      .diff-line.remove {
        background: rgba(239, 68, 68, 0.18);
        color: #fca5a5;
      }
      .diff-line.hunk {
        color: #67e8f9;
      }
      .diff-line.meta {
        color: #94a3b8;
      }
      .spinner {
        width: 10px;
        height: 10px;
        border-radius: 9999px;
        border: 2px solid rgba(148, 163, 184, 0.35);
        border-top-color: rgb(226, 232, 240);
        animation: spin-ring 0.75s linear infinite;
        display: inline-block;
      }
      .spinner.turtle {
        width: 12px;
        height: 12px;
        border: 0;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        animation: spin-ring 1s linear infinite;
      }
      .spinner.turtle::before {
        content: "🐢";
        font-size: 11px;
        line-height: 1;
      }
      @keyframes spin-ring {
        from {
          transform: rotate(0deg);
        }
        to {
          transform: rotate(360deg);
        }
      }
    </style>
  </head>
  <body>
    <div class="app-header${isMac ? " macos" : ""}">
      <div class="app-brand">
        <img src="${safeIconSrc}" class="app-icon" alt="" />
        <div class="app-title">GameraCode - Git (${safeProjectName})</div>
      </div>
      ${
        isWindows
          ? `<div class="window-controls">
        <button id="windowMinBtn" class="window-btn" title="Minimize">
          <span class="window-btn-icon min"><svg viewBox="0 0 448 512" aria-hidden="true"><path d="M32 288c-17.7 0-32-14.3-32-32s14.3-32 32-32l384 0c17.7 0 32 14.3 32 32s-14.3 32-32 32L32 288z"/></svg></span>
        </button>
        <button id="windowMaxBtn" class="window-btn" title="Maximize or restore">
          <span id="windowMaxIcon" class="window-btn-icon"><svg viewBox="0 0 512 512" aria-hidden="true"><path d="M32 32C14.3 32 0 46.3 0 64L0 352c0 17.7 14.3 32 32 32l128 0 0-64L64 320 64 96l288 0 0 96 64 0L416 64c0-17.7-14.3-32-32-32L32 32zM224 160c-17.7 0-32 14.3-32 32l0 256c0 17.7 14.3 32 32 32l256 0c17.7 0 32-14.3 32-32l0-256c0-17.7-14.3-32-32-32l-256 0zm32 64l192 0 0 192-192 0 0-192z"/></svg></span>
        </button>
        <button id="windowCloseBtn" class="window-btn close" title="Close">
          <span class="window-btn-icon"><svg viewBox="0 0 384 512" aria-hidden="true"><path d="M342.6 150.6c12.5-12.5 12.5-32.8 0-45.3s-32.8-12.5-45.3 0L192 210.7 86.6 105.4c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L146.7 256 41.4 361.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0L192 301.3 297.4 406.6c12.5 12.5 32.8 12.5 45.3 0s12.5-32.8 0-45.3L237.3 256 342.6 150.6z"/></svg></span>
        </button>
      </div>`
          : ""
      }
    </div>
    <div class="shell">
      <aside class="sidebar">
        <div class="section">
          <div class="section-title">Repository</div>
          <div id="meta" class="meta">Loading git state...</div>
          <div class="row" style="margin-top: 8px;">
            <button id="refreshBtn" class="btn secondary">Refresh</button>
            <button id="syncBtn" class="btn">Sync</button>
            <button id="stageBtn" class="btn secondary">Stage All</button>
          </div>
        </div>
        <div class="section">
          <div class="section-title">Branch</div>
          <div class="row">
            <input id="branchInput" class="branch-input" list="branches" placeholder="Search or type branch" />
            <datalist id="branches"></datalist>
            <button id="switchBtn" class="btn">Switch/Create</button>
          </div>
        </div>
        <div class="section files-section">
          <div class="section-title">Changed Files</div>
          <div id="files" class="files"></div>
        </div>
        <div class="section" style="border-bottom: 0;">
          <div class="section-title">Commit</div>
          <textarea id="commitInput" class="commit-input" placeholder="Commit message (optional: auto-generate if empty)"></textarea>
          <div class="row" style="margin-top: 8px;">
            <button id="commitBtn" class="btn">Commit</button>
          </div>
          <div id="actionStatus" class="action-status"></div>
        </div>
      </aside>
      <div class="main">
        <div class="diff-wrap">
          <div id="diffTitle" class="diff-title">Diff</div>
          <div id="diff" class="diff-view">Loading...</div>
        </div>
      </div>
    </div>
    <script>
      const api = window.desktopAPI;
      let activeProjectId = "${safeProjectId}";
      let activeProjectName = "${safeProjectName}";
      let activeState = null;
      let selectedPath = "";
      const meta = document.getElementById("meta");
      const files = document.getElementById("files");
      const diff = document.getElementById("diff");
      const diffTitle = document.getElementById("diffTitle");
      const branchInput = document.getElementById("branchInput");
      const branchList = document.getElementById("branches");
      const syncBtn = document.getElementById("syncBtn");
      const stageBtn = document.getElementById("stageBtn");
      const commitBtn = document.getElementById("commitBtn");
      const commitInput = document.getElementById("commitInput");
      const actionStatus = document.getElementById("actionStatus");
      const windowMinBtn = document.getElementById("windowMinBtn");
      const windowMaxBtn = document.getElementById("windowMaxBtn");
      const windowMaxIcon = document.getElementById("windowMaxIcon");
      const windowCloseBtn = document.getElementById("windowCloseBtn");
      let useTurtleSpinner = false;

      const maximizeIconSvg = '<svg viewBox="0 0 512 512" aria-hidden="true"><path d="M32 32C14.3 32 0 46.3 0 64L0 352c0 17.7 14.3 32 32 32l128 0 0-64L64 320 64 96l288 0 0 96 64 0L416 64c0-17.7-14.3-32-32-32L32 32zM224 160c-17.7 0-32 14.3-32 32l0 256c0 17.7 14.3 32 32 32l256 0c17.7 0 32-14.3 32-32l0-256c0-17.7-14.3-32-32-32l-256 0zm32 64l192 0 0 192-192 0 0-192z"/></svg>';
      const restoreIconSvg = '<svg viewBox="0 0 512 512" aria-hidden="true"><path d="M48 96c0-26.5 21.5-48 48-48l224 0c26.5 0 48 21.5 48 48l0 48 48 0c26.5 0 48 21.5 48 48l0 224c0 26.5-21.5 48-48 48l-224 0c-26.5 0-48-21.5-48-48l0-48-48 0c-26.5 0-48-21.5-48-48L48 96zm64 0l0 224 32 0 0-128c0-26.5 21.5-48 48-48l112 0 0-32L112 112zm96 112l0 192 192 0 0-192-192 0z"/></svg>';

      const syncWindowState = async () => {
        if (!windowMaxBtn || !api?.windowControls) {
          return;
        }
        const state = await api.windowControls.isMaximized();
        if (state?.ok) {
          if (windowMaxIcon) {
            windowMaxIcon.innerHTML = state.maximized ? restoreIconSvg : maximizeIconSvg;
          }
        }
      };

      if (windowMinBtn && api?.windowControls) {
        windowMinBtn.addEventListener("click", () => {
          api.windowControls.minimize().catch(() => undefined);
        });
      }
      if (windowMaxBtn && api?.windowControls) {
        windowMaxBtn.addEventListener("click", async () => {
          const state = await api.windowControls.toggleMaximize();
          if (state?.ok) {
            if (windowMaxIcon) {
              windowMaxIcon.innerHTML = state.maximized ? restoreIconSvg : maximizeIconSvg;
            }
          }
        });
      }
      if (windowCloseBtn && api?.windowControls) {
        windowCloseBtn.addEventListener("click", () => {
          api.windowControls.close().catch(() => undefined);
        });
      }

      const setBusy = (busy) => {
        const buttons = Array.from(document.querySelectorAll("button"));
        buttons.forEach((button) => {
          button.disabled = busy;
        });
      };

      const setActionStatus = (message) => {
        actionStatus.textContent = message || "";
      };

      const setSyncBusy = (busy) => {
        if (busy) {
          syncBtn.innerHTML = useTurtleSpinner
            ? '<span class="spinner turtle"></span> Syncing...'
            : '<span class="spinner"></span> Syncing...';
        } else {
          syncBtn.textContent = "Sync";
        }
      };

      const loadSpinnerPreference = async () => {
        try {
          const settings = await api.settings.get();
          useTurtleSpinner = Boolean(settings?.useTurtleSpinners);
        } catch {
          useTurtleSpinner = false;
        }
      };

      const diffLineClass = (line) => {
        if (
          line.startsWith("diff --git ") ||
          line.startsWith("index ") ||
          line.startsWith("+++ ") ||
          line.startsWith("--- ") ||
          line.startsWith("new file mode") ||
          line.startsWith("deleted file mode")
        ) {
          return "meta";
        }
        if (line.startsWith("@@")) {
          return "hunk";
        }
        if (line.startsWith("+")) {
          return "add";
        }
        if (line.startsWith("-")) {
          return "remove";
        }
        return "";
      };

      const renderDiff = (text) => {
        const content = text || "No diff available.";
        const lines = content.split("\\n");
        const maxLines = 12000;
        const visibleLines = lines.length > maxLines ? lines.slice(0, maxLines) : lines;
        diff.textContent = "";
        const fragment = document.createDocumentFragment();
        visibleLines.forEach((line) => {
          const row = document.createElement("div");
          const lineType = diffLineClass(line);
          row.className = lineType ? "diff-line " + lineType : "diff-line";
          row.textContent = line || " ";
          fragment.appendChild(row);
        });
        if (lines.length > maxLines) {
          const footer = document.createElement("div");
          footer.className = "diff-line meta";
          footer.textContent = "Diff truncated in view for performance.";
          fragment.appendChild(footer);
        }
        diff.appendChild(fragment);
      };

      const renderFiles = () => {
        const changed = activeState?.files || [];
        if (changed.length === 0) {
          files.innerHTML = '<div class="status">Working tree clean.</div>';
          return;
        }
        files.innerHTML = "";
        changed.forEach((file) => {
          const btn = document.createElement("button");
          btn.className = "file" + (selectedPath === file.path ? " active" : "");
          btn.innerHTML = '<div>' + file.path + '</div>';
          btn.addEventListener("click", async () => {
            selectedPath = file.path;
            renderFiles();
            await loadDiff();
          });
          files.appendChild(btn);
        });
      };

      const renderBranches = () => {
        const branches = activeState?.branches || [];
        branchList.innerHTML = "";
        branches.forEach((branch) => {
          const option = document.createElement("option");
          option.value = branch.name;
          branchList.appendChild(option);
        });
        if (!branchInput.value && activeState?.branch) {
          branchInput.value = activeState.branch;
        }
      };

      const renderMeta = () => {
        if (!activeState || !activeState.insideRepo) {
          meta.textContent = activeProjectName + " is not a git repository.";
          syncBtn.style.display = "none";
          stageBtn.style.display = "none";
          commitBtn.disabled = true;
          return;
        }
        meta.textContent =
          (activeState.branch || "(detached)") +
          (activeState.upstream ? " -> " + activeState.upstream : "") +
          " | Ahead " + activeState.ahead + " Behind " + activeState.behind +
          " | " + activeState.stagedCount + " staged, " + activeState.unstagedCount + " unstaged, " + activeState.untrackedCount + " untracked";
        syncBtn.style.display = activeState.ahead > 0 || activeState.behind > 0 ? "" : "none";
        stageBtn.style.display = "";
        commitBtn.disabled = activeState.stagedCount === 0;
      };

      const loadDiff = async () => {
        diffTitle.textContent = selectedPath ? "Diff - " + selectedPath : "Diff (working tree)";
        const result = await api.git.getDiff({ projectId: activeProjectId, path: selectedPath || undefined });
        renderDiff(result.ok ? (result.diff || "No diff available.") : (result.stderr || "No diff available."));
      };

      const loadState = async () => {
        activeState = await api.git.getState({ projectId: activeProjectId });
        if (!activeState.insideRepo) {
          selectedPath = "";
        } else if (!selectedPath || !activeState.files.some((file) => file.path === selectedPath)) {
          selectedPath = activeState.files[0]?.path || "";
        }
        renderMeta();
        renderBranches();
        renderFiles();
        await loadDiff();
      };

      const runAction = async (action) => {
        setBusy(true);
        try {
          await action();
          await loadState();
        } finally {
          setBusy(false);
        }
      };

      const switchOrCreateBranch = async () => {
        if (!activeState?.insideRepo) return;
        const branch = branchInput.value.trim();
        if (!branch) return;
        const exists = (activeState.branches || []).some((item) => item.name === branch);
        if (exists) {
          await runAction(() => api.git.checkoutBranch({ projectId: activeProjectId, branch }));
        } else {
          await runAction(() => api.git.createBranch({ projectId: activeProjectId, branch, checkout: true }));
        }
      };

      const commitChanges = async () => {
        if (!activeState?.insideRepo) return;
        setBusy(true);
        setActionStatus("");
        try {
          const result = await api.git.commit({
            projectId: activeProjectId,
            message: commitInput.value.trim() || undefined
          });
          if (result.ok) {
            if (result.autoGenerated) {
              setActionStatus("Committed with auto-generated message.");
            } else {
              setActionStatus("Commit created.");
            }
            commitInput.value = "";
          } else {
            setActionStatus(result.stderr || "Commit failed.");
          }
          await loadState();
        } finally {
          setBusy(false);
        }
      };

      document.getElementById("refreshBtn").addEventListener("click", () => loadState());
      document.getElementById("syncBtn").addEventListener("click", async () => {
        setSyncBusy(true);
        try {
          await runAction(() => api.git.sync({ projectId: activeProjectId }));
        } finally {
          setSyncBusy(false);
        }
      });
      document.getElementById("stageBtn").addEventListener("click", () => runAction(() => api.git.stage({ projectId: activeProjectId })));
      document.getElementById("commitBtn").addEventListener("click", () => commitChanges());
      document.getElementById("switchBtn").addEventListener("click", () => switchOrCreateBranch());
      branchInput.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          switchOrCreateBranch();
        }
      });
      commitInput.addEventListener("keydown", (event) => {
        if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
          event.preventDefault();
          commitChanges();
        }
      });

      window.__codeappSetGitProject = async (projectId, projectName) => {
        activeProjectId = String(projectId || "");
        activeProjectName = String(projectName || "Project");
        selectedPath = "";
        branchInput.value = "";
        commitInput.value = "";
        setActionStatus("");
        await loadState();
      };

      loadState();
      loadSpinnerPreference().catch(() => undefined);
      syncWindowState().catch(() => undefined);
    </script>
  </body>
</html>`;
};

const loadEmbeddedBrowserWindow = async (window: BrowserWindow, url: string, allowLocalOnly: boolean) => {
  const html = buildPreviewPopoutHtml(url, allowLocalOnly);
  const dataUrl = `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;
  await window.loadURL(dataUrl);
};

const navigateEmbeddedBrowserWindow = async (window: BrowserWindow, url: string) => {
  await window.webContents.executeJavaScript(
    `window.__codeappNavigate && window.__codeappNavigate("${escapeJsString(url)}");`,
    true
  );
};

const formatGitWindowTitle = (projectName?: string) => {
  const name = projectName?.trim();
  return name ? `Git — ${name}` : "Git";
};

const formatWebLinkWindowTitle = (name?: string, projectName?: string) => {
  const linkName = name?.trim() || "Website";
  const project = projectName?.trim();
  return project ? `${linkName} — ${project}` : linkName;
};

const ensureWebLinkWindow = async (url: string, name?: string, projectName?: string, focus = true) => {
  const isMac = process.platform === "darwin";
  const isWindows = process.platform === "win32";
  if (!isAllowedWebLinkUrl(url)) {
    throw new Error("Website URL must use http/https.");
  }

  if (!webLinkWindow || webLinkWindow.isDestroyed()) {
    webLinkWindow = new BrowserWindow({
      width: 1200,
      height: 840,
      minWidth: 720,
      minHeight: 520,
      title: formatWebLinkWindowTitle(name, projectName),
      frame: !isWindows,
      titleBarStyle: isMac ? "hiddenInset" : "default",
      titleBarOverlay: false,
      autoHideMenuBar: true,
      backgroundColor: "#0b0d10",
      ...getBrowserWindowIcon(),
      webPreferences: {
        preload: join(__dirname, "preload.js"),
        contextIsolation: true,
        sandbox: false,
        nodeIntegration: false
      }
    });

    webLinkWindow.on("closed", () => {
      webLinkWindow = null;
      webLinkCurrentUrl = null;
    });
  }

  webLinkWindow.setTitle(formatWebLinkWindowTitle(name, projectName));
  try {
    await navigateEmbeddedBrowserWindow(webLinkWindow, url);
  } catch {
    await loadEmbeddedBrowserWindow(webLinkWindow, url, false);
  }
  webLinkCurrentUrl = url;
  webLinkWindow.show();
  if (focus) {
    webLinkWindow.focus();
  }
};

const ensureGitPopout = async (projectId: string, projectName?: string) => {
  const isMac = process.platform === "darwin";
  const isWindows = process.platform === "win32";
  if (!gitPopoutWindow || gitPopoutWindow.isDestroyed()) {
    gitPopoutWindow = new BrowserWindow({
      width: 1320,
      height: 900,
      minWidth: 980,
      minHeight: 520,
      title: formatGitWindowTitle(projectName),
      frame: !isWindows,
      titleBarStyle: isMac ? "hiddenInset" : "default",
      titleBarOverlay: false,
      autoHideMenuBar: true,
      backgroundColor: "#0b0d10",
      ...getBrowserWindowIcon(),
      webPreferences: {
        preload: join(__dirname, "preload.js"),
        contextIsolation: true,
        sandbox: false,
        nodeIntegration: false
      }
    });
    gitPopoutWindow.on("closed", () => {
      gitPopoutWindow = null;
    });
  }
  gitPopoutWindow.setTitle(formatGitWindowTitle(projectName));
  const html = buildGitPopoutHtml(projectId, projectName);
  const dataUrl = `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;
  await loadPreviewUrlWithRetry(gitPopoutWindow, dataUrl);
  gitPopoutWindow.show();
  gitPopoutWindow.focus();
};

const navigateGitPopout = async (projectId: string, projectName?: string) => {
  if (!gitPopoutWindow || gitPopoutWindow.isDestroyed()) {
    await ensureGitPopout(projectId, projectName);
    return;
  }
  gitPopoutWindow.setTitle(formatGitWindowTitle(projectName));
  try {
    await gitPopoutWindow.webContents.executeJavaScript(
      `window.__codeappSetGitProject && window.__codeappSetGitProject("${escapeJsString(projectId)}", "${escapeJsString(projectName?.trim() || "Project")}");`,
      true
    );
  } catch {
    await ensureGitPopout(projectId, projectName);
    return;
  }
  gitPopoutWindow.show();
  gitPopoutWindow.focus();
};

const ensureSettingsWindow = async () => {
  const isMac = process.platform === "darwin";
  const isWindows = process.platform === "win32";
  if (!settingsWindow || settingsWindow.isDestroyed()) {
    settingsWindow = new BrowserWindow({
      width: 1040,
      height: 820,
      minWidth: 860,
      minHeight: 620,
      title: "GameraCode Settings",
      frame: !isWindows,
      titleBarStyle: isMac ? "hiddenInset" : "default",
      titleBarOverlay: false,
      backgroundColor: "#0b0d10",
      ...getBrowserWindowIcon(),
      webPreferences: {
        preload: join(__dirname, "preload.js"),
        contextIsolation: true,
        sandbox: false,
        nodeIntegration: false
      }
    });
    settingsWindow.on("closed", () => {
      settingsWindow = null;
    });
  }

  await loadRendererWindow(settingsWindow, { settingsWindow: "1" });
  settingsWindow.show();
  settingsWindow.focus();
};

const bootstrap = async () => {
  await app.whenReady();
  applyRuntimePathToProcessEnv();
  app.setName("GameraCode");
  if (process.platform === "darwin") {
    const iconPath = resolveAppIconPath();
    if (iconPath) {
      app.dock?.setIcon(iconPath);
    }
  }

  const paths = createAppPaths(app.getPath("userData"));
  const db = initializeDatabase(paths.dbPath);
  const repository = new Repository(db, paths);
  const permissionEngine = new PermissionEngine(repository, repository.getSettings().permissionMode);
  const installerManager = new InstallerManager(repository);
  const gitService = new GitService();

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
    gitService,
    gitPopout: {
      open: async (projectId: string, projectName?: string) => {
        await navigateGitPopout(projectId, projectName);
        return { ok: true };
      },
      close: async () => {
        if (gitPopoutWindow && !gitPopoutWindow.isDestroyed()) {
          gitPopoutWindow.close();
        }
        gitPopoutWindow = null;
        return { ok: true };
      }
    },
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
    },
    webLink: {
      open: async (url: string, name?: string, projectName?: string, focus = true) => {
        await ensureWebLinkWindow(url, name, projectName, focus);
        return { ok: true };
      },
      getState: async () => ({
        open: Boolean(webLinkWindow && !webLinkWindow.isDestroyed()),
        url: webLinkCurrentUrl ?? undefined
      })
    },
    settingsWindow: {
      open: async () => {
        await ensureSettingsWindow();
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
