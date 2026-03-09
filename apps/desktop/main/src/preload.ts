import { contextBridge, ipcRenderer } from "electron";
import {
  IPC_CHANNELS,
  type CodePanelEvent,
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
const projectsListDirectoryChannel =
  (IPC_CHANNELS as Record<string, string>).projectsListDirectory ?? "projects:listDirectory";
const projectsCreateFolderChannel =
  (IPC_CHANNELS as Record<string, string>).projectsCreateFolder ?? "projects:createFolder";
const projectsRenamePathChannel =
  (IPC_CHANNELS as Record<string, string>).projectsRenamePath ?? "projects:renamePath";
const projectsDeletePathChannel =
  (IPC_CHANNELS as Record<string, string>).projectsDeletePath ?? "projects:deletePath";
const projectsReadFileChannel =
  (IPC_CHANNELS as Record<string, string>).projectsReadFile ?? "projects:readFile";
const projectsWriteFileChannel =
  (IPC_CHANNELS as Record<string, string>).projectsWriteFile ?? "projects:writeFile";
const codePanelOpenPopoutChannel =
  (IPC_CHANNELS as Record<string, string>).codePanelOpenPopout ?? "codePanel:openPopout";
const codePanelClosePopoutChannel =
  (IPC_CHANNELS as Record<string, string>).codePanelClosePopout ?? "codePanel:closePopout";
const codePanelEventChannel =
  (IPC_CHANNELS as Record<string, string>).codePanelEvent ?? "codePanel:event";
const projectsSetupEventChannel =
  (IPC_CHANNELS as Record<string, string>).projectsSetupEvent ?? "projects:setupEvent";
const gitDiscardChannel =
  (IPC_CHANNELS as Record<string, string>).gitDiscard ?? "git:discard";
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
const threadsForkChannel =
  (IPC_CHANNELS as Record<string, string>).threadsFork ?? "threads:fork";
const threadsDeleteChannel =
  (IPC_CHANNELS as Record<string, string>).threadsDelete ?? "threads:delete";
const sessionsSteerChannel =
  (IPC_CHANNELS as Record<string, string>).sessionsSteer ?? "sessions:steer";
const sessionsSubmitUserInputChannel =
  (IPC_CHANNELS as Record<string, string>).sessionsSubmitUserInput ?? "sessions:submitUserInput";
const sessionsCompactChannel =
  (IPC_CHANNELS as Record<string, string>).sessionsCompact ?? "sessions:compact";
const sessionsReviewThreadChannel =
  (IPC_CHANNELS as Record<string, string>).sessionsReviewThread ?? "sessions:reviewThread";
const sessionsReviewCommitChannel =
  (IPC_CHANNELS as Record<string, string>).sessionsReviewCommit ?? "sessions:reviewCommit";
const audioTranscribeChannel =
  (IPC_CHANNELS as Record<string, string>).audioTranscribe ?? "audio:transcribe";
const installerGetCodexAuthStatusChannel =
  (IPC_CHANNELS as Record<string, string>).installerGetCodexAuthStatus ?? "installer:getCodexAuthStatus";
const installerGetAvailableModelsChannel =
  (IPC_CHANNELS as Record<string, string>).installerGetAvailableModels ?? "installer:getAvailableModels";
const installerLoginCodexChannel =
  (IPC_CHANNELS as Record<string, string>).installerLoginCodex ?? "installer:loginCodex";
const installerLogoutCodexChannel =
  (IPC_CHANNELS as Record<string, string>).installerLogoutCodex ?? "installer:logoutCodex";
const installerGetOpenCodeAuthStatusChannel =
  (IPC_CHANNELS as Record<string, string>).installerGetOpenCodeAuthStatus ?? "installer:getOpenCodeAuthStatus";
const installerLoginOpenCodeChannel =
  (IPC_CHANNELS as Record<string, string>).installerLoginOpenCode ?? "installer:loginOpenCode";
const installerLogoutOpenCodeChannel =
  (IPC_CHANNELS as Record<string, string>).installerLogoutOpenCode ?? "installer:logoutOpenCode";
const skillsListChannel =
  (IPC_CHANNELS as Record<string, string>).skillsList ?? "skills:list";
const skillsSetEnabledChannel =
  (IPC_CHANNELS as Record<string, string>).skillsSetEnabled ?? "skills:setEnabled";
const skillsReadDocumentChannel =
  (IPC_CHANNELS as Record<string, string>).skillsReadDocument ?? "skills:readDocument";
const skillsWriteDocumentChannel =
  (IPC_CHANNELS as Record<string, string>).skillsWriteDocument ?? "skills:writeDocument";
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
type ProjectSetupProgressEvent = {
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
type DesktopApiWithGitExtras = DesktopApi & {
  projects: DesktopApi["projects"] & {
    listFiles: (input: { projectId: string; limit?: number }) => Promise<Array<{ path: string; updatedAtMs: number }>>;
    listDirectory: (input: { projectId: string; relativePath?: string }) => Promise<Array<{
      name: string;
      path: string;
      kind: "file" | "folder";
    }>>;
    createFolder: (input: { projectId: string; relativePath: string }) => Promise<{ ok: boolean }>;
    renamePath: (input: { projectId: string; fromRelativePath: string; toRelativePath: string }) => Promise<{ ok: boolean }>;
    deletePath: (input: { projectId: string; relativePath: string }) => Promise<{ ok: boolean }>;
    readFile: (input: { projectId: string; relativePath: string }) => Promise<{ path: string; content: string; mtimeMs: number }>;
    writeFile: (input: {
      projectId: string;
      relativePath: string;
      content: string;
    }) => Promise<{ ok: boolean; mtimeMs: number }>;
    onSetupEvent: (listener: (event: ProjectSetupProgressEvent) => void) => () => void;
  };
  threads: DesktopApi["threads"] & {
    delete: (input: { id: string }) => Promise<{ ok: boolean }>;
  };
  sessions: DesktopApi["sessions"] & {
    reviewThread: (input: { threadId: string; instructions?: string }) => Promise<{ ok: boolean }>;
  };
  audio: {
    transcribe: (input: {
      audioDataUrl: string;
      projectId?: string;
      model?: string;
      language?: string;
      prompt?: string;
    }) => Promise<{ text: string; model: string; language?: string; durationSeconds?: number }>;
  };
  git: DesktopApi["git"] & {
    init: (input: { projectId: string }) => Promise<{ ok: boolean; stdout: string; stderr: string }>;
    getSnapshot: (input: { projectId: string }) => Promise<GitSnapshot>;
    discard: (input: { projectId: string; path?: string }) => Promise<{ ok: boolean; stdout: string; stderr: string }>;
    resolveConflictsAi: (input: { projectId: string }) => Promise<{ ok: boolean; stdout: string; stderr: string }>;
    getOutgoingCommits: (input: { projectId: string }) => Promise<Array<{ hash: string; summary: string }>>;
    getIncomingCommits: (input: { projectId: string }) => Promise<Array<{ hash: string; summary: string }>>;
    getSharedHistory: (
      input: { projectId: string; limit?: number }
    ) => Promise<Array<{ hash: string; summary: string; date: string; refs?: string }>>;
  };
  workspaces: {
    list: () => Promise<Array<{ id: string; name: string; icon: string; color: string; createdAt: string; updatedAt: string }>>;
    create: (input: { name: string; icon: string; color: string; moveProjectIds?: string[] }) =>
      Promise<{ id: string; name: string; icon: string; color: string; createdAt: string; updatedAt: string }>;
    update: (input: { id: string; name?: string; icon?: string; color?: string }) =>
      Promise<{ id: string; name: string; icon: string; color: string; createdAt: string; updatedAt: string }>;
    delete: (input: { id: string }) => Promise<{ ok: boolean }>;
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
    listDirectory: (input: { projectId: string; relativePath?: string }) =>
      ipcRenderer.invoke(projectsListDirectoryChannel, input),
    createFolder: (input: { projectId: string; relativePath: string }) =>
      ipcRenderer.invoke(projectsCreateFolderChannel, input),
    renamePath: (input: { projectId: string; fromRelativePath: string; toRelativePath: string }) =>
      ipcRenderer.invoke(projectsRenamePathChannel, input),
    deletePath: (input: { projectId: string; relativePath: string }) =>
      ipcRenderer.invoke(projectsDeletePathChannel, input),
    readFile: (input: { projectId: string; relativePath: string }) =>
      ipcRenderer.invoke(projectsReadFileChannel, input),
    writeFile: (input: { projectId: string; relativePath: string; content: string }) =>
      ipcRenderer.invoke(projectsWriteFileChannel, input),
    onSetupEvent: (listener: (event: ProjectSetupProgressEvent) => void) => {
      const wrapped = (_event: Electron.IpcRendererEvent, payload: ProjectSetupProgressEvent) => listener(payload);
      ipcRenderer.on(projectsSetupEventChannel, wrapped);
      return () => ipcRenderer.off(projectsSetupEventChannel, wrapped);
    },
    openWebLink: (input) => ipcRenderer.invoke(IPC_CHANNELS.projectsOpenWebLink, input),
    getWebLinkState: () => ipcRenderer.invoke(IPC_CHANNELS.projectsGetWebLinkState)
  },
  workspaces: {
    list: () => ipcRenderer.invoke(workspacesListChannel),
    create: (input: { name: string; icon: string; color: string; moveProjectIds?: string[] }) =>
      ipcRenderer.invoke(workspacesCreateChannel, input),
    update: (input: { id: string; name?: string; icon?: string; color?: string }) =>
      ipcRenderer.invoke(workspacesUpdateChannel, input),
    delete: (input: { id: string }) => ipcRenderer.invoke(workspacesDeleteChannel, input)
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
  codePanel: {
    openPopout: (input?: { projectName?: string }) => ipcRenderer.invoke(codePanelOpenPopoutChannel, input),
    closePopout: () => ipcRenderer.invoke(codePanelClosePopoutChannel),
    onEvent: (listener: (event: CodePanelEvent) => void) => {
      const wrapped = (_event: Electron.IpcRendererEvent, payload: CodePanelEvent) => listener(payload);
      ipcRenderer.on(codePanelEventChannel, wrapped);
      return () => ipcRenderer.off(codePanelEventChannel, wrapped);
    }
  },
  threads: {
    list: (input) => ipcRenderer.invoke(IPC_CHANNELS.threadsList, input),
    create: (input) => ipcRenderer.invoke(IPC_CHANNELS.threadsCreate, input),
    update: (input) => ipcRenderer.invoke(IPC_CHANNELS.threadsUpdate, input),
    archive: (input) => ipcRenderer.invoke(IPC_CHANNELS.threadsArchive, input),
    delete: (input: { id: string }) => ipcRenderer.invoke(threadsDeleteChannel, input),
    fork: (input) => ipcRenderer.invoke(threadsForkChannel, input),
    events: (input) => ipcRenderer.invoke(IPC_CHANNELS.threadsEvents, input)
  },
  orchestration: {
    listRuns: (input) => ipcRenderer.invoke(orchestrationListRunsChannel, input),
    getRun: (input) => ipcRenderer.invoke(orchestrationGetRunChannel, input),
    approveProposal: (input) => ipcRenderer.invoke(orchestrationApproveProposalChannel, input),
    stopChild: (input) => ipcRenderer.invoke(orchestrationStopChildChannel, input),
    retryChild: (input) => ipcRenderer.invoke(orchestrationRetryChildChannel, input)
  },
  sessions: {
    start: (input) => ipcRenderer.invoke(IPC_CHANNELS.sessionsStart, input),
    stop: (input) => ipcRenderer.invoke(IPC_CHANNELS.sessionsStop, input),
    sendInput: (input) => ipcRenderer.invoke(IPC_CHANNELS.sessionsSendInput, input),
    steer: (input) => ipcRenderer.invoke(sessionsSteerChannel, input),
    submitUserInput: (input) => ipcRenderer.invoke(sessionsSubmitUserInputChannel, input),
    compact: (input) => ipcRenderer.invoke(sessionsCompactChannel, input),
    reviewThread: (input) => ipcRenderer.invoke(sessionsReviewThreadChannel, input),
    reviewCommit: (input) => ipcRenderer.invoke(sessionsReviewCommitChannel, input),
    generateThreadMetadata: (input) => ipcRenderer.invoke(IPC_CHANNELS.sessionsGenerateThreadMetadata, input),
    resize: (input) => ipcRenderer.invoke(IPC_CHANNELS.sessionsResize, input),
    onEvent: (listener) => {
      const wrapped = (_event: Electron.IpcRendererEvent, payload: SessionEvent) => listener(payload);
      ipcRenderer.on(IPC_CHANNELS.sessionsEvent, wrapped);
      return () => ipcRenderer.off(IPC_CHANNELS.sessionsEvent, wrapped);
    }
  },
  audio: {
    transcribe: (input: { audioDataUrl: string; projectId?: string; model?: string; language?: string; prompt?: string }) =>
      ipcRenderer.invoke(audioTranscribeChannel, input)
  },
  installer: {
    doctor: () => ipcRenderer.invoke(IPC_CHANNELS.installerDoctor),
    installCli: (input) => ipcRenderer.invoke(IPC_CHANNELS.installerInstallCli, input),
    installDependencies: (input) => ipcRenderer.invoke(IPC_CHANNELS.installerInstallDependencies, input),
    getCodexAuthStatus: () => ipcRenderer.invoke(installerGetCodexAuthStatusChannel),
    getAvailableModels: (input?: { opencodeBinaryOverride?: string }) => ipcRenderer.invoke(installerGetAvailableModelsChannel, input),
    loginCodex: () => ipcRenderer.invoke(installerLoginCodexChannel),
    logoutCodex: () => ipcRenderer.invoke(installerLogoutCodexChannel),
    getOpenCodeAuthStatus: (input?: { binaryOverride?: string }) => ipcRenderer.invoke(installerGetOpenCodeAuthStatusChannel, input),
    loginOpenCode: (input?: { cwd?: string; binaryOverride?: string }) => ipcRenderer.invoke(installerLoginOpenCodeChannel, input),
    logoutOpenCode: (input?: { cwd?: string; binaryOverride?: string; providerLabel?: string }) =>
      ipcRenderer.invoke(installerLogoutOpenCodeChannel, input),
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
    onChanged: (listener) => {
      const wrapped = (_event: Electron.IpcRendererEvent, settings: Awaited<ReturnType<DesktopApi["settings"]["get"]>>) =>
        listener(settings);
      ipcRenderer.on(IPC_CHANNELS.settingsChanged, wrapped);
      return () => ipcRenderer.off(IPC_CHANNELS.settingsChanged, wrapped);
    },
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
    getSharedHistory: (input: { projectId: string; limit?: number }) => ipcRenderer.invoke(gitGetSharedHistoryChannel, input),
    fetch: (input) => ipcRenderer.invoke(IPC_CHANNELS.gitFetch, input),
    pull: (input) => ipcRenderer.invoke(IPC_CHANNELS.gitPull, input),
    push: (input) => ipcRenderer.invoke(IPC_CHANNELS.gitPush, input),
    sync: (input) => ipcRenderer.invoke(IPC_CHANNELS.gitSync, input),
    stage: (input) => ipcRenderer.invoke(IPC_CHANNELS.gitStage, input),
    unstage: (input) => ipcRenderer.invoke(IPC_CHANNELS.gitUnstage, input),
    discard: (input) => ipcRenderer.invoke(gitDiscardChannel, input),
    commit: (input) => ipcRenderer.invoke(IPC_CHANNELS.gitCommit, input),
    resolveConflictsAi: (input: { projectId: string }) => ipcRenderer.invoke(gitResolveConflictsAiChannel, input),
    init: (input: { projectId: string }) => ipcRenderer.invoke(gitInitChannel, input),
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
