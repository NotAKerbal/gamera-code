import type {
  AppSettings,
  CodexThreadOptions,
  InstallStatus,
  MessageEvent,
  PermissionMode,
  Project,
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
    update: (input: { id: string; name?: string; path?: string }) => Promise<Project>;
    delete: (input: { id: string }) => Promise<{ ok: boolean }>;
    pickPath: () => Promise<string | null>;
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
}
