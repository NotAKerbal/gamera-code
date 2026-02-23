import type {
  AppSettings,
  CodexThreadOptions,
  GitCommitResult,
  GitCommandResult,
  GitDiffResult,
  GitRepositoryCandidate,
  GitState,
  InstallStatus,
  MessageEvent,
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
  Thread,
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
    update: (input: { id: string; name?: string; path?: string }) => Promise<Project>;
    delete: (input: { id: string }) => Promise<{ ok: boolean }>;
    pickPath: () => Promise<string | null>;
  };
  projectSettings: {
    get: (input: { projectId: string }) => Promise<ProjectSettings>;
    set: (input: {
      projectId: string;
      envVars?: Record<string, string>;
      devCommands?: Array<{ id: string; name: string; command: string; autoStart?: boolean; useForPreview?: boolean }>;
      defaultDevCommandId?: string;
      autoStartDevTerminal?: boolean;
      switchBehaviorOverride?: "start_stop" | "start_only" | "manual";
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
  };
  threads: {
    list: (input?: { projectId?: string; includeArchived?: boolean }) => Promise<Thread[]>;
    create: (input: { projectId: string; title: string; provider: Provider }) => Promise<Thread>;
    update: (input: { id: string; title?: string; provider?: Provider; status?: Thread["status"] }) => Promise<Thread>;
    archive: (input: { id: string; archived: boolean }) => Promise<Thread>;
    events: (input: { threadId: string }) => Promise<MessageEvent[]>;
  };
  sessions: {
    start: (input: { threadId: string; options?: CodexThreadOptions }) => Promise<Session>;
    stop: (input: { threadId: string }) => Promise<{ ok: boolean }>;
    sendInput: (input: {
      threadId: string;
      input: string;
      options?: CodexThreadOptions;
      attachments?: PromptAttachment[];
    }) => Promise<{ ok: boolean }>;
    resize: (input: { threadId: string; cols: number; rows: number }) => Promise<{ ok: boolean }>;
    onEvent: (listener: (event: SessionEvent) => void) => () => void;
  };
  installer: {
    doctor: () => Promise<InstallStatus>;
    installCli: (input: { provider: Provider }) => Promise<{ ok: boolean; logs: string[] }>;
    verify: () => Promise<InstallStatus>;
  };
  permissions: {
    evaluate: (input: { threadId?: string; command: string; cwd: string; approve?: boolean }) => Promise<RiskCheck>;
    setMode: (input: { mode: PermissionMode }) => Promise<{ ok: boolean }>;
    getMode: () => Promise<PermissionMode>;
  };
  settings: {
    get: () => Promise<AppSettings>;
    set: (input: Partial<AppSettings>) => Promise<AppSettings>;
  };
  updates: {
    check: () => Promise<UpdateCheckResult>;
    apply: () => Promise<{ ok: boolean }>;
  };
  git: {
    getState: (input: { projectId: string }) => Promise<GitState>;
    getDiff: (input: { projectId: string; path?: string }) => Promise<GitDiffResult>;
    fetch: (input: { projectId: string }) => Promise<GitCommandResult>;
    pull: (input: { projectId: string }) => Promise<GitCommandResult>;
    push: (input: { projectId: string }) => Promise<GitCommandResult>;
    sync: (input: { projectId: string }) => Promise<GitCommandResult>;
    stage: (input: { projectId: string; path?: string }) => Promise<GitCommandResult>;
    unstage: (input: { projectId: string; path?: string }) => Promise<GitCommandResult>;
    commit: (input: { projectId: string; message?: string }) => Promise<GitCommitResult>;
    checkoutBranch: (input: { projectId: string; branch: string }) => Promise<GitCommandResult>;
    createBranch: (input: { projectId: string; branch: string; checkout?: boolean }) => Promise<GitCommandResult>;
    openPopout: (input: { projectId: string; projectName?: string }) => Promise<{ ok: boolean }>;
    closePopout: () => Promise<{ ok: boolean }>;
  };
}
