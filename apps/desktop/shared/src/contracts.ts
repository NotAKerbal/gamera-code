import type {
  AppSettings,
  CodexThreadOptions,
  GitCommitResult,
  GitCommandResult,
  GitDiffResult,
  GitHistoryCommit,
  GitOutgoingCommit,
  GitSnapshot,
  GitRepositoryCandidate,
  GitState,
  InstallDependenciesResult,
  InstallDependencyKey,
  InstallStatus,
  MessageEvent,
  OrchestrationChild,
  OrchestrationRun,
  ProjectFileEntry,
  PreviewEvent,
  ThreadEventsPage,
  PermissionMode,
  Project,
  ProjectSettings,
  ProjectTerminalEvent,
  ProjectTerminalState,
  PromptAttachment,
  Provider,
  RiskCheck,
  Session,
  SessionEvent,
  SubthreadPolicy,
  SystemTerminalId,
  SystemTerminalOption,
  SkillRecord,
  ThreadMetadataSuggestion,
  Thread,
  Workspace,
  UpdateCheckResult
} from "./types";

export interface DesktopApi {
  projects: {
    list: () => Promise<Project[]>;
    create: (input: { name: string; path: string }) => Promise<Project>;
    createInDirectory: (input: { name: string; parentDir: string }) => Promise<Project>;
    listGitRepositories: () => Promise<GitRepositoryCandidate[]>;
    importFromPath: (input: { path: string; name?: string }) => Promise<Project>;
    cloneFromGitUrl: (input: { url: string; name?: string }) => Promise<Project>;
    update: (input: { id: string; name?: string; path?: string; workspaceId?: string }) => Promise<Project>;
    delete: (input: { id: string }) => Promise<{ ok: boolean }>;
    pickPath: () => Promise<string | null>;
    openTerminal: (input: { projectId: string; terminalId?: SystemTerminalId }) => Promise<{ ok: boolean }>;
    listSystemTerminals: (input?: { refresh?: boolean }) => Promise<SystemTerminalOption[]>;
    openFiles: (input: { projectId: string }) => Promise<{ ok: boolean }>;
    listFiles: (input: { projectId: string; limit?: number }) => Promise<ProjectFileEntry[]>;
    openWebLink: (input: { url: string; name?: string; projectName?: string; focus?: boolean }) => Promise<{ ok: boolean }>;
    getWebLinkState: () => Promise<{ open: boolean; url?: string }>;
  };
  workspaces: {
    list: () => Promise<Workspace[]>;
    create: (input: { name: string; icon: string; color: string; moveProjectIds?: string[] }) => Promise<Workspace>;
    update: (input: { id: string; name?: string; icon?: string; color?: string }) => Promise<Workspace>;
    delete: (input: { id: string }) => Promise<{ ok: boolean }>;
  };
  projectSettings: {
    get: (input: { projectId: string }) => Promise<ProjectSettings>;
    set: (input: {
      projectId: string;
      envVars?: Record<string, string>;
      devCommands?: Array<{ id: string; name: string; command: string; autoStart?: boolean; useForPreview?: boolean }>;
      webLinks?: Array<{ id: string; name: string; url: string }>;
      browserEnabled?: boolean;
      defaultDevCommandId?: string;
      autoStartDevTerminal?: boolean;
      switchBehaviorOverride?: "start_stop" | "start_only" | "manual";
      subthreadPolicyOverride?: SubthreadPolicy;
      lastDetectedPreviewUrl?: string;
    }) => Promise<ProjectSettings>;
  };
  projectTerminal: {
    setActiveProject: (input: { projectId: string | null }) => Promise<{ ok: boolean }>;
    start: (input: { projectId: string; commandId?: string }) => Promise<ProjectTerminalState>;
    stop: (input: { projectId: string; commandId?: string }) => Promise<{ ok: boolean }>;
    getState: (input: { projectId: string }) => Promise<ProjectTerminalState>;
    onEvent: (listener: (event: ProjectTerminalEvent) => void) => () => void;
  };
  preview: {
    openPopout: (input: { url: string; projectName?: string }) => Promise<{ ok: boolean }>;
    closePopout: () => Promise<{ ok: boolean }>;
    navigate: (input: { url: string; projectName?: string }) => Promise<{ ok: boolean }>;
    openDevTools: () => Promise<{ ok: boolean }>;
    onEvent: (listener: (event: PreviewEvent) => void) => () => void;
  };
  threads: {
    list: (input?: { projectId?: string; includeArchived?: boolean }) => Promise<Thread[]>;
    create: (input: { projectId: string; title: string; provider: Provider }) => Promise<Thread>;
    update: (input: { id: string; title?: string; provider?: Provider; status?: Thread["status"] }) => Promise<Thread>;
    archive: (input: { id: string; archived: boolean }) => Promise<Thread>;
    fork: (input: { id: string; upToStreamSeq?: number }) => Promise<Thread>;
    events: (input: {
      threadId: string;
      beforeStreamSeq?: number;
      userPromptCount?: number;
    }) => Promise<ThreadEventsPage>;
  };
  orchestration: {
    listRuns: (input: { parentThreadId: string }) => Promise<OrchestrationRun[]>;
    getRun: (input: { runId: string }) => Promise<{ run: OrchestrationRun; children: OrchestrationChild[] } | null>;
    approveProposal: (input: { runId: string; selectedTaskKeys?: string[] }) => Promise<{ ok: boolean }>;
    stopChild: (input: { childThreadId: string }) => Promise<{ ok: boolean }>;
    retryChild: (input: { childRowId: string }) => Promise<{ ok: boolean }>;
  };
  sessions: {
    start: (input: { threadId: string; options?: CodexThreadOptions }) => Promise<Session>;
    stop: (input: { threadId: string }) => Promise<{ ok: boolean }>;
    sendInput: (input: {
      threadId: string;
      input: string;
      options?: CodexThreadOptions;
      attachments?: PromptAttachment[];
      skills?: Array<{ name: string; path: string }>;
    }) => Promise<{ ok: boolean }>;
    steer: (input: {
      threadId: string;
      input: string;
      attachments?: PromptAttachment[];
      skills?: Array<{ name: string; path: string }>;
    }) => Promise<{ ok: boolean }>;
    submitUserInput: (input: {
      threadId: string;
      requestId: string;
      answersByQuestionId: Record<string, string>;
    }) => Promise<{ ok: boolean }>;
    compact: (input: { threadId: string }) => Promise<{ ok: boolean }>;
    reviewCommit: (input: { threadId: string; sha: string; title?: string }) => Promise<{ ok: boolean }>;
    generateThreadMetadata: (input: {
      threadId: string;
      input: string;
      options?: CodexThreadOptions;
    }) => Promise<ThreadMetadataSuggestion | null>;
    resize: (input: { threadId: string; cols: number; rows: number }) => Promise<{ ok: boolean }>;
    onEvent: (listener: (event: SessionEvent) => void) => () => void;
  };
  installer: {
    doctor: () => Promise<InstallStatus>;
    installCli: (input: { provider: Provider }) => Promise<{ ok: boolean; logs: string[] }>;
    installDependencies: (input?: { targets?: InstallDependencyKey[] }) => Promise<InstallDependenciesResult>;
    verify: () => Promise<InstallStatus>;
    onInstallLog: (listener: (line: string) => void) => () => void;
  };
  permissions: {
    evaluate: (input: { threadId?: string; command: string; cwd: string; approve?: boolean }) => Promise<RiskCheck>;
    setMode: (input: { mode: PermissionMode }) => Promise<{ ok: boolean }>;
    getMode: () => Promise<PermissionMode>;
  };
  settings: {
    get: () => Promise<AppSettings>;
    set: (input: Partial<AppSettings>) => Promise<AppSettings>;
    onChanged: (listener: (settings: AppSettings) => void) => () => void;
    openWindow: () => Promise<{ ok: boolean }>;
  };
  updates: {
    check: () => Promise<UpdateCheckResult>;
    apply: () => Promise<{ ok: boolean }>;
  };
  windowControls: {
    minimize: () => Promise<{ ok: boolean }>;
    toggleMaximize: () => Promise<{ ok: boolean; maximized: boolean }>;
    close: () => Promise<{ ok: boolean }>;
    isMaximized: () => Promise<{ ok: boolean; maximized: boolean }>;
  };
  git: {
    getState: (input: { projectId: string }) => Promise<GitState>;
    getSnapshot: (input: { projectId: string }) => Promise<GitSnapshot>;
    getDiff: (input: { projectId: string; path?: string }) => Promise<GitDiffResult>;
    getOutgoingCommits: (input: { projectId: string }) => Promise<GitOutgoingCommit[]>;
    getIncomingCommits: (input: { projectId: string }) => Promise<GitOutgoingCommit[]>;
    getSharedHistory: (input: { projectId: string; limit?: number }) => Promise<GitHistoryCommit[]>;
    fetch: (input: { projectId: string }) => Promise<GitCommandResult>;
    pull: (input: { projectId: string }) => Promise<GitCommandResult>;
    push: (input: { projectId: string }) => Promise<GitCommandResult>;
    sync: (input: { projectId: string }) => Promise<GitCommandResult>;
    stage: (input: { projectId: string; path?: string }) => Promise<GitCommandResult>;
    unstage: (input: { projectId: string; path?: string }) => Promise<GitCommandResult>;
    discard: (input: { projectId: string; path?: string }) => Promise<GitCommandResult>;
    commit: (input: { projectId: string; message?: string }) => Promise<GitCommitResult>;
    checkoutBranch: (input: { projectId: string; branch: string }) => Promise<GitCommandResult>;
    createBranch: (input: { projectId: string; branch: string; checkout?: boolean }) => Promise<GitCommandResult>;
    openPopout: (input: { projectId: string; projectName?: string }) => Promise<{ ok: boolean }>;
    closePopout: () => Promise<{ ok: boolean }>;
  };
  skills: {
    list: (input?: { projectId?: string }) => Promise<SkillRecord[]>;
    setEnabled: (input: { projectId?: string; path: string; enabled: boolean }) => Promise<{ ok: boolean }>;
    readDocument: (input: { path: string }) => Promise<{ content: string }>;
    writeDocument: (input: { path: string; content: string }) => Promise<{ ok: boolean }>;
  };
}
