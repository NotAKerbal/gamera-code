import { contextBridge, ipcRenderer } from "electron";
import {
  IPC_CHANNELS,
  type DesktopApi,
  type GitSnapshot,
  type PreviewEvent,
  type ProjectTerminalEvent,
  type SessionEvent
} from "@code-app/shared";

const settingsOpenWindowChannel =
  (IPC_CHANNELS as Record<string, string>).settingsOpenWindow ?? "settings:openWindow";
const projectsListFilesChannel =
  (IPC_CHANNELS as Record<string, string>).projectsListFiles ?? "projects:listFiles";
const gitDiscardChannel =
  (IPC_CHANNELS as Record<string, string>).gitDiscard ?? "git:discard";
const gitGetOutgoingCommitsChannel =
  (IPC_CHANNELS as Record<string, string>).gitGetOutgoingCommits ?? "git:getOutgoingCommits";
const gitGetIncomingCommitsChannel =
  (IPC_CHANNELS as Record<string, string>).gitGetIncomingCommits ?? "git:getIncomingCommits";
const gitGetSnapshotChannel =
  (IPC_CHANNELS as Record<string, string>).gitGetSnapshot ?? "git:getSnapshot";
const threadsForkChannel =
  (IPC_CHANNELS as Record<string, string>).threadsFork ?? "threads:fork";
const sessionsSteerChannel =
  (IPC_CHANNELS as Record<string, string>).sessionsSteer ?? "sessions:steer";
const sessionsSubmitUserInputChannel =
  (IPC_CHANNELS as Record<string, string>).sessionsSubmitUserInput ?? "sessions:submitUserInput";
const sessionsCompactChannel =
  (IPC_CHANNELS as Record<string, string>).sessionsCompact ?? "sessions:compact";
const sessionsReviewCommitChannel =
  (IPC_CHANNELS as Record<string, string>).sessionsReviewCommit ?? "sessions:reviewCommit";
const skillsListChannel =
  (IPC_CHANNELS as Record<string, string>).skillsList ?? "skills:list";
const skillsSetEnabledChannel =
  (IPC_CHANNELS as Record<string, string>).skillsSetEnabled ?? "skills:setEnabled";
const skillsReadDocumentChannel =
  (IPC_CHANNELS as Record<string, string>).skillsReadDocument ?? "skills:readDocument";
const skillsWriteDocumentChannel =
  (IPC_CHANNELS as Record<string, string>).skillsWriteDocument ?? "skills:writeDocument";
type DesktopApiWithGitExtras = DesktopApi & {
  projects: DesktopApi["projects"] & {
    listFiles: (input: { projectId: string; limit?: number }) => Promise<Array<{ path: string; updatedAtMs: number }>>;
  };
  git: DesktopApi["git"] & {
    getSnapshot: (input: { projectId: string }) => Promise<GitSnapshot>;
    discard: (input: { projectId: string; path?: string }) => Promise<{ ok: boolean; stdout: string; stderr: string }>;
    getOutgoingCommits: (input: { projectId: string }) => Promise<Array<{ hash: string; summary: string }>>;
    getIncomingCommits: (input: { projectId: string }) => Promise<Array<{ hash: string; summary: string }>>;
  };
};

const api: DesktopApiWithGitExtras = {
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
    listSystemTerminals: (input) => ipcRenderer.invoke(IPC_CHANNELS.projectsListSystemTerminals, input),
    openFiles: (input) => ipcRenderer.invoke(IPC_CHANNELS.projectsOpenFiles, input),
    listFiles: (input: { projectId: string; limit?: number }) => ipcRenderer.invoke(projectsListFilesChannel, input),
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
    fork: (input) => ipcRenderer.invoke(threadsForkChannel, input),
    events: (input) => ipcRenderer.invoke(IPC_CHANNELS.threadsEvents, input)
  },
  sessions: {
    start: (input) => ipcRenderer.invoke(IPC_CHANNELS.sessionsStart, input),
    stop: (input) => ipcRenderer.invoke(IPC_CHANNELS.sessionsStop, input),
    sendInput: (input) => ipcRenderer.invoke(IPC_CHANNELS.sessionsSendInput, input),
    steer: (input) => ipcRenderer.invoke(sessionsSteerChannel, input),
    submitUserInput: (input) => ipcRenderer.invoke(sessionsSubmitUserInputChannel, input),
    compact: (input) => ipcRenderer.invoke(sessionsCompactChannel, input),
    reviewCommit: (input) => ipcRenderer.invoke(sessionsReviewCommitChannel, input),
    generateThreadMetadata: (input) => ipcRenderer.invoke(IPC_CHANNELS.sessionsGenerateThreadMetadata, input),
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
  windowControls: {
    minimize: () => ipcRenderer.invoke(IPC_CHANNELS.windowMinimize),
    toggleMaximize: () => ipcRenderer.invoke(IPC_CHANNELS.windowToggleMaximize),
    close: () => ipcRenderer.invoke(IPC_CHANNELS.windowClose),
    isMaximized: () => ipcRenderer.invoke(IPC_CHANNELS.windowIsMaximized)
  },
  git: {
    getState: (input) => ipcRenderer.invoke(IPC_CHANNELS.gitGetState, input),
    getSnapshot: (input: { projectId: string }) => ipcRenderer.invoke(gitGetSnapshotChannel, input),
    getDiff: (input) => ipcRenderer.invoke(IPC_CHANNELS.gitGetDiff, input),
    getOutgoingCommits: (input: { projectId: string }) => ipcRenderer.invoke(gitGetOutgoingCommitsChannel, input),
    getIncomingCommits: (input: { projectId: string }) => ipcRenderer.invoke(gitGetIncomingCommitsChannel, input),
    fetch: (input) => ipcRenderer.invoke(IPC_CHANNELS.gitFetch, input),
    pull: (input) => ipcRenderer.invoke(IPC_CHANNELS.gitPull, input),
    push: (input) => ipcRenderer.invoke(IPC_CHANNELS.gitPush, input),
    sync: (input) => ipcRenderer.invoke(IPC_CHANNELS.gitSync, input),
    stage: (input) => ipcRenderer.invoke(IPC_CHANNELS.gitStage, input),
    unstage: (input) => ipcRenderer.invoke(IPC_CHANNELS.gitUnstage, input),
    discard: (input) => ipcRenderer.invoke(gitDiscardChannel, input),
    commit: (input) => ipcRenderer.invoke(IPC_CHANNELS.gitCommit, input),
    checkoutBranch: (input) => ipcRenderer.invoke(IPC_CHANNELS.gitCheckoutBranch, input),
    createBranch: (input) => ipcRenderer.invoke(IPC_CHANNELS.gitCreateBranch, input),
    openPopout: (input) => ipcRenderer.invoke(IPC_CHANNELS.gitOpenPopout, input),
    closePopout: () => ipcRenderer.invoke(IPC_CHANNELS.gitClosePopout)
  },
  skills: {
    list: (input) => ipcRenderer.invoke(skillsListChannel, input),
    setEnabled: (input) => ipcRenderer.invoke(skillsSetEnabledChannel, input),
    readDocument: (input) => ipcRenderer.invoke(skillsReadDocumentChannel, input),
    writeDocument: (input) => ipcRenderer.invoke(skillsWriteDocumentChannel, input)
  }
};

contextBridge.exposeInMainWorld("desktopAPI", api);
