export type Provider = "codex" | "gemini";

export type PermissionMode = "prompt_on_risk" | "always_ask" | "auto_allow";

export type ThreadStatus = "created" | "running" | "stopped" | "exited" | "error";

export type CodexApprovalMode = "never" | "on-request" | "on-failure" | "untrusted";

export type CodexSandboxMode = "read-only" | "workspace-write" | "danger-full-access";

export type CodexModelReasoningEffort = "minimal" | "low" | "medium" | "high" | "xhigh";

export type CodexWebSearchMode = "disabled" | "cached" | "live";

export type CodexCollaborationMode = "coding" | "plan";

export interface CodexThreadOptions {
  model?: string;
  collaborationMode?: CodexCollaborationMode;
  sandboxMode?: CodexSandboxMode;
  modelReasoningEffort?: CodexModelReasoningEffort;
  networkAccessEnabled?: boolean;
  webSearchMode?: CodexWebSearchMode;
  approvalPolicy?: CodexApprovalMode;
}

export interface PromptAttachment {
  name: string;
  mimeType: string;
  dataUrl: string;
  size: number;
}

export interface Project {
  id: string;
  name: string;
  path: string;
  settings?: ProjectSettings;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectDevCommand {
  id: string;
  name: string;
  command: string;
  autoStart?: boolean;
  useForPreview?: boolean;
}

export interface ProjectWebLink {
  id: string;
  name: string;
  url: string;
}

export type ProjectTerminalSwitchBehavior = "start_stop" | "start_only" | "manual";

export interface ProjectSettings {
  projectId: string;
  envVars: Record<string, string>;
  devCommands: ProjectDevCommand[];
  webLinks: ProjectWebLink[];
  browserEnabled: boolean;
  defaultDevCommandId?: string;
  autoStartDevTerminal: boolean;
  switchBehaviorOverride?: ProjectTerminalSwitchBehavior;
  lastDetectedPreviewUrl?: string;
  createdAt: string;
  updatedAt: string;
}

export type ProjectTerminalEventType = "status" | "stdout" | "stderr" | "exit" | "preview_url_detected";

export interface ProjectTerminalEvent {
  projectId: string;
  type: ProjectTerminalEventType;
  payload: string;
  ts: string;
  data?: Record<string, unknown>;
}

export interface ProjectTerminalState {
  projectId: string;
  running: boolean;
  terminals: Array<{
    commandId: string;
    name: string;
    command: string;
    running: boolean;
    outputTail: string;
    pid?: number;
    lastExitCode?: number;
    updatedAt: string;
    autoStart: boolean;
    useForPreview: boolean;
  }>;
  commandId?: string;
  command?: string;
  outputTail: string;
  pid?: number;
  lastExitCode?: number;
  updatedAt: string;
}

export interface ProjectPreviewState {
  projectId: string;
  url?: string;
}

export type PreviewEventType = "popout_closed";

export interface PreviewEvent {
  type: PreviewEventType;
}

export interface Thread {
  id: string;
  projectId: string;
  title: string;
  provider: Provider;
  status: ThreadStatus;
  createdAt: string;
  updatedAt: string;
  archivedAt?: string;
}

export interface Session {
  threadId: string;
  ptyPid: number;
  cwd: string;
  envHash: string;
  startedAt: string;
  stoppedAt?: string;
}

export interface MessageEvent {
  id: string;
  threadId: string;
  role: "system" | "user" | "assistant";
  content: string;
  attachments?: PromptAttachment[];
  ts: string;
  streamSeq: number;
}

export interface ThreadEventsPage {
  events: MessageEvent[];
  hasMore: boolean;
  nextBeforeStreamSeq?: number;
}

export type RiskLevel = "low" | "medium" | "high";

export interface RiskCheck {
  command: string;
  cwd: string;
  riskLevel: RiskLevel;
  requiresPrompt: boolean;
  reason: string[];
  approved?: boolean;
}

export interface InstallDetail {
  key: "node" | "npm" | "git" | "rg" | "codex" | "gemini";
  ok: boolean;
  message: string;
  version?: string;
}

export interface InstallStatus {
  nodeOk: boolean;
  npmOk: boolean;
  gitOk: boolean;
  rgOk: boolean;
  codexOk: boolean;
  geminiOk: boolean;
  details: InstallDetail[];
}

export type InstallDependencyKey = "node" | "npm" | "git" | "rg" | "codex";

export interface InstallDependenciesResult {
  ok: boolean;
  logs: string[];
  status: InstallStatus;
}

export interface ProviderInstallCommand {
  command: string;
  args: string[];
}

export type SessionEventType = "status" | "stdout" | "stderr" | "exit" | "progress";

export interface SessionEvent {
  threadId: string;
  type: SessionEventType;
  payload: string;
  ts: string;
  data?: Record<string, unknown>;
}

export interface ThreadMetadataSuggestion {
  title: string;
  description: string;
}

export interface AppSettings {
  permissionMode: PermissionMode;
  binaryOverrides: Partial<Record<Provider, string>>;
  envVars: Record<string, string>;
  codexDefaults: CodexThreadOptions;
  defaultProjectDirectory?: string;
  autoRenameThreadTitles?: boolean;
  showThreadSummaries?: boolean;
  projectTerminalSwitchBehaviorDefault?: ProjectTerminalSwitchBehavior;
}

export interface UpdateCheckResult {
  available: boolean;
  version?: string;
  notes?: string;
}

export interface GitBranchInfo {
  name: string;
  isCurrent: boolean;
  upstream?: string;
  isLocal: boolean;
  isOnOrigin: boolean;
}

export interface GitFileStatus {
  path: string;
  indexStatus: string;
  workTreeStatus: string;
  staged: boolean;
  unstaged: boolean;
  untracked: boolean;
}

export interface GitState {
  insideRepo: boolean;
  branch?: string;
  upstream?: string;
  ahead: number;
  behind: number;
  clean: boolean;
  addedLines?: number;
  removedLines?: number;
  stagedCount: number;
  unstagedCount: number;
  untrackedCount: number;
  files: GitFileStatus[];
  branches: GitBranchInfo[];
}

export interface GitDiffResult {
  ok: boolean;
  diff: string;
  stderr?: string;
  truncated: boolean;
}

export interface GitCommandResult {
  ok: boolean;
  stdout: string;
  stderr: string;
}

export interface GitOutgoingCommit {
  hash: string;
  summary: string;
}

export interface GitCommitResult extends GitCommandResult {
  message: string;
  autoGenerated: boolean;
  autoStaged: boolean;
}

export interface GitRepositoryCandidate {
  name: string;
  path: string;
  remoteUrl?: string;
}
