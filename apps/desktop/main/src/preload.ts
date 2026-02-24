import { contextBridge, ipcRenderer } from "electron";
import { IPC_CHANNELS, type DesktopApi, type PreviewEvent, type ProjectTerminalEvent, type SessionEvent } from "@code-app/shared";

const settingsOpenWindowChannel =
  (IPC_CHANNELS as Record<string, string>).settingsOpenWindow ?? "settings:openWindow";

const api: DesktopApi = {
  projects: {
    list: () => ipcRenderer.invoke(IPC_CHANNELS.projectsList),
    create: (input) => ipcRenderer.invoke(IPC_CHANNELS.projectsCreate, input),
    createInDirectory: (input) => ipcRenderer.invoke(IPC_CHANNELS.projectsCreateInDirectory, input),
    listGitRepositories: () => ipcRenderer.invoke(IPC_CHANNELS.projectsListGitRepositories),
    importFromPath: (input) => ipcRenderer.invoke(IPC_CHANNELS.projectsImportFromPath, input),
    cloneFromGitUrl: (input) => ipcRenderer.invoke(IPC_CHANNELS.projectsCloneFromGitUrl, input),
    update: (input) => ipcRenderer.invoke(IPC_CHANNELS.projectsUpdate, input),
    delete: (input) => ipcRenderer.invoke(IPC_CHANNELS.projectsDelete, input),
    pickPath: () => ipcRenderer.invoke(IPC_CHANNELS.projectsPickPath),
    openTerminal: (input) => ipcRenderer.invoke(IPC_CHANNELS.projectsOpenTerminal, input),
    openFiles: (input) => ipcRenderer.invoke(IPC_CHANNELS.projectsOpenFiles, input),
    openWebLink: (input) => ipcRenderer.invoke(IPC_CHANNELS.projectsOpenWebLink, input),
    getWebLinkState: () => ipcRenderer.invoke(IPC_CHANNELS.projectsGetWebLinkState)
  },
  projectSettings: {
    get: (input) => ipcRenderer.invoke(IPC_CHANNELS.projectSettingsGet, input),
    set: (input) => ipcRenderer.invoke(IPC_CHANNELS.projectSettingsSet, input)
  },
  projectTerminal: {
    setActiveProject: (input) => ipcRenderer.invoke(IPC_CHANNELS.projectTerminalSetActiveProject, input),
    start: (input) => ipcRenderer.invoke(IPC_CHANNELS.projectTerminalStart, input),
    stop: (input) => ipcRenderer.invoke(IPC_CHANNELS.projectTerminalStop, input),
    getState: (input) => ipcRenderer.invoke(IPC_CHANNELS.projectTerminalGetState, input),
    onEvent: (listener) => {
      const wrapped = (_event: Electron.IpcRendererEvent, payload: ProjectTerminalEvent) => listener(payload);
      ipcRenderer.on(IPC_CHANNELS.projectTerminalEvent, wrapped);
      return () => ipcRenderer.off(IPC_CHANNELS.projectTerminalEvent, wrapped);
    }
  },
  preview: {
    openPopout: (input) => ipcRenderer.invoke(IPC_CHANNELS.previewOpenPopout, input),
    closePopout: () => ipcRenderer.invoke(IPC_CHANNELS.previewClosePopout),
    navigate: (input) => ipcRenderer.invoke(IPC_CHANNELS.previewNavigate, input),
    openDevTools: () => ipcRenderer.invoke(IPC_CHANNELS.previewOpenDevTools),
    onEvent: (listener) => {
      const wrapped = (_event: Electron.IpcRendererEvent, payload: PreviewEvent) => listener(payload);
      ipcRenderer.on(IPC_CHANNELS.previewEvent, wrapped);
      return () => ipcRenderer.off(IPC_CHANNELS.previewEvent, wrapped);
    }
  },
  threads: {
    list: (input) => ipcRenderer.invoke(IPC_CHANNELS.threadsList, input),
    create: (input) => ipcRenderer.invoke(IPC_CHANNELS.threadsCreate, input),
    update: (input) => ipcRenderer.invoke(IPC_CHANNELS.threadsUpdate, input),
    archive: (input) => ipcRenderer.invoke(IPC_CHANNELS.threadsArchive, input),
    events: (input) => ipcRenderer.invoke(IPC_CHANNELS.threadsEvents, input)
  },
  sessions: {
    start: (input) => ipcRenderer.invoke(IPC_CHANNELS.sessionsStart, input),
    stop: (input) => ipcRenderer.invoke(IPC_CHANNELS.sessionsStop, input),
    sendInput: (input) => ipcRenderer.invoke(IPC_CHANNELS.sessionsSendInput, input),
    resize: (input) => ipcRenderer.invoke(IPC_CHANNELS.sessionsResize, input),
    onEvent: (listener) => {
      const wrapped = (_event: Electron.IpcRendererEvent, payload: SessionEvent) => listener(payload);
      ipcRenderer.on(IPC_CHANNELS.sessionsEvent, wrapped);
      return () => ipcRenderer.off(IPC_CHANNELS.sessionsEvent, wrapped);
    }
  },
  installer: {
    doctor: () => ipcRenderer.invoke(IPC_CHANNELS.installerDoctor),
    installCli: (input) => ipcRenderer.invoke(IPC_CHANNELS.installerInstallCli, input),
    installDependencies: (input) => ipcRenderer.invoke(IPC_CHANNELS.installerInstallDependencies, input),
    verify: () => ipcRenderer.invoke(IPC_CHANNELS.installerVerify),
    onInstallLog: (listener) => {
      const wrapped = (_event: Electron.IpcRendererEvent, line: string) => listener(line);
      ipcRenderer.on(IPC_CHANNELS.installerInstallLog, wrapped);
      return () => ipcRenderer.off(IPC_CHANNELS.installerInstallLog, wrapped);
    }
  },
  permissions: {
    evaluate: (input) => ipcRenderer.invoke(IPC_CHANNELS.permissionsEvaluate, input),
    setMode: (input) => ipcRenderer.invoke(IPC_CHANNELS.permissionsSetMode, input),
    getMode: () => ipcRenderer.invoke(IPC_CHANNELS.permissionsGetMode)
  },
  settings: {
    get: () => ipcRenderer.invoke(IPC_CHANNELS.settingsGet),
    set: (input) => ipcRenderer.invoke(IPC_CHANNELS.settingsSet, input),
    openWindow: () => ipcRenderer.invoke(settingsOpenWindowChannel)
  },
  updates: {
    check: () => ipcRenderer.invoke(IPC_CHANNELS.updatesCheck),
    apply: () => ipcRenderer.invoke(IPC_CHANNELS.updatesApply)
  },
  git: {
    getState: (input) => ipcRenderer.invoke(IPC_CHANNELS.gitGetState, input),
    getDiff: (input) => ipcRenderer.invoke(IPC_CHANNELS.gitGetDiff, input),
    fetch: (input) => ipcRenderer.invoke(IPC_CHANNELS.gitFetch, input),
    pull: (input) => ipcRenderer.invoke(IPC_CHANNELS.gitPull, input),
    push: (input) => ipcRenderer.invoke(IPC_CHANNELS.gitPush, input),
    sync: (input) => ipcRenderer.invoke(IPC_CHANNELS.gitSync, input),
    stage: (input) => ipcRenderer.invoke(IPC_CHANNELS.gitStage, input),
    unstage: (input) => ipcRenderer.invoke(IPC_CHANNELS.gitUnstage, input),
    commit: (input) => ipcRenderer.invoke(IPC_CHANNELS.gitCommit, input),
    checkoutBranch: (input) => ipcRenderer.invoke(IPC_CHANNELS.gitCheckoutBranch, input),
    createBranch: (input) => ipcRenderer.invoke(IPC_CHANNELS.gitCreateBranch, input),
    openPopout: (input) => ipcRenderer.invoke(IPC_CHANNELS.gitOpenPopout, input),
    closePopout: () => ipcRenderer.invoke(IPC_CHANNELS.gitClosePopout)
  }
};

contextBridge.exposeInMainWorld("desktopAPI", api);
