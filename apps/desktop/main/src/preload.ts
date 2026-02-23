import { contextBridge, ipcRenderer } from "electron";
import { IPC_CHANNELS, type DesktopApi, type ProjectTerminalEvent, type SessionEvent } from "@code-app/shared";

const api: DesktopApi = {
  projects: {
    list: () => ipcRenderer.invoke(IPC_CHANNELS.projectsList),
    create: (input) => ipcRenderer.invoke(IPC_CHANNELS.projectsCreate, input),
    createInDirectory: (input) => ipcRenderer.invoke(IPC_CHANNELS.projectsCreateInDirectory, input),
    update: (input) => ipcRenderer.invoke(IPC_CHANNELS.projectsUpdate, input),
    delete: (input) => ipcRenderer.invoke(IPC_CHANNELS.projectsDelete, input),
    pickPath: () => ipcRenderer.invoke(IPC_CHANNELS.projectsPickPath)
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
    navigate: (input) => ipcRenderer.invoke(IPC_CHANNELS.previewNavigate, input)
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
    verify: () => ipcRenderer.invoke(IPC_CHANNELS.installerVerify)
  },
  permissions: {
    evaluate: (input) => ipcRenderer.invoke(IPC_CHANNELS.permissionsEvaluate, input),
    setMode: (input) => ipcRenderer.invoke(IPC_CHANNELS.permissionsSetMode, input),
    getMode: () => ipcRenderer.invoke(IPC_CHANNELS.permissionsGetMode)
  },
  settings: {
    get: () => ipcRenderer.invoke(IPC_CHANNELS.settingsGet),
    set: (input) => ipcRenderer.invoke(IPC_CHANNELS.settingsSet, input)
  },
  updates: {
    check: () => ipcRenderer.invoke(IPC_CHANNELS.updatesCheck),
    apply: () => ipcRenderer.invoke(IPC_CHANNELS.updatesApply)
  }
};

contextBridge.exposeInMainWorld("desktopAPI", api);
