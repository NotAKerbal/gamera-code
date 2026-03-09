export interface HarnessDefaultsById {
  codex: CodexThreadOptions;
  opencode: CodexThreadOptions;
}

export interface HarnessCapabilityMap {
  codex:
    | "streaming"
    | "attachments"
    | "reasoning_effort"
    | "sandbox"
    | "web_search"
    | "approval_policy"
    | "collaboration_mode"
    | "thread_compact"
    | "thread_fork"
    | "review"
    | "steer"
    | "subthreads"
    | "user_input";
  opencode:
    | "streaming"
    | "attachments"
    | "reasoning_effort"
    | "sandbox"
    | "web_search"
    | "approval_policy"
    | "collaboration_mode";
}

export interface HarnessModelGroupMap {
  codex: "flagship" | "codex" | "spark";
  opencode: "openai" | "anthropic" | "google" | "xai" | "deepseek" | "glm" | "kimi" | "vertex_oss" | "minimax";
}

export type HarnessId = keyof HarnessDefaultsById;
export type Provider = HarnessId;
export type HarnessCapability<T extends HarnessId = HarnessId> = HarnessCapabilityMap[T];
export type HarnessModelGroupId<T extends HarnessId = HarnessId> = HarnessModelGroupMap[T];
export type HarnessAvailableModels = Partial<Record<HarnessId, string[]>>;

export interface HarnessSettingsEntry<TDefaults = Record<string, never>> {
  binaryOverride?: string;
  defaults?: Partial<TDefaults>;
}

export type HarnessSettings = {
  [K in HarnessId]?: HarnessSettingsEntry<HarnessDefaultsById[K]>;
};

export interface HarnessModelGroup<T extends HarnessId = HarnessId> {
  id: HarnessModelGroupId<T>;
  harnessId: T;
  label: string;
  models: string[];
  defaultModel?: string;
}

export interface HarnessDescriptor<T extends HarnessId = HarnessId> {
  id: T;
  label: string;
  capabilities: HarnessCapability<T>[];
  modelGroups: HarnessModelGroup<T>[];
}

export type PermissionMode = "prompt_on_risk" | "always_ask" | "auto_allow";
export type AppTheme = "midnight" | "graphite" | "dawn" | "linen" | "orange-cat";

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
  kind?: "image" | "text";
  name: string;
  mimeType: string;
  dataUrl: string;
  size: number;
}

export type ProjectTemplateId = "nextjs" | "electron";

export interface Project {
  id: string;
  workspaceId: string;
  name: string;
  path: string;
  settings?: ProjectSettings;
  createdAt: string;
  updatedAt: string;
}

export interface Workspace {
  id: string;
  name: string;
  icon: string;
  color: string;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectFileEntry {
  path: string;
  updatedAtMs: number;
}

export interface ProjectDirectoryEntry {
  name: string;
  path: string;
  kind: "file" | "folder";
}

export interface ProjectFileContent {
  path: string;
  content: string;
  mtimeMs: number;
}

export interface ProjectDevCommand {
  id: string;
  name: string;
  command: string;
  autoStart?: boolean;
  stayRunning?: boolean;
  hotkey?: string;
}

export interface ProjectWebLink {
  id: string;
  name: string;
  url: string;
}

export type SystemTerminalId = string;

export interface SystemTerminalOption {
  id: SystemTerminalId;
  label: string;
  command: string;
  available: boolean;
  isDefault: boolean;
}

export type ProjectTerminalSwitchBehavior = "start_stop" | "start_only" | "manual";
export type SubthreadPolicy = "manual" | "ask" | "auto";

export interface ProjectSettings {
  projectId: string;
  envVars: Record<string, string>;
  devCommands: ProjectDevCommand[];
  webLinks: ProjectWebLink[];
  browserEnabled: boolean;
  defaultDevCommandId?: string;
  autoStartDevTerminal: boolean;
  subthreadPolicyOverride?: SubthreadPolicy;
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
    stayRunning: boolean;
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

export type ProjectSetupPhase =
  | "creating_folder"
  | "setting_up_files"
  | "installing_dependencies"
  | "running_setup_scripts"
  | "ready"
  | "failed";

export interface ProjectSetupEvent {
  projectId: string;
  phase: ProjectSetupPhase;
  status: "running" | "completed" | "failed";
  message: string;
  ts: string;
}

export type PreviewEventType = "popout_closed";

export interface PreviewEvent {
  type: PreviewEventType;
}

export type CodePanelEventType = "popout_closed";

export interface CodePanelEvent {
  type: CodePanelEventType;
}

export interface Thread {
  id: string;
  projectId: string;
  parentThreadId?: string;
  title: string;
  color?: string;
  harnessId: HarnessId;
  provider: Provider;
  status: ThreadStatus;
  createdAt: string;
  updatedAt: string;
  archivedAt?: string;
  pinnedAt?: string;
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

export interface AudioTranscriptionResult {
  text: string;
  model: string;
  language?: string;
  durationSeconds?: number;
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
  key: "node" | "npm" | "git" | "rg" | "codex" | "opencode" | "gemini";
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
  opencodeOk: boolean;
  geminiOk: boolean;
  readyHarnessIds: HarnessId[];
  details: InstallDetail[];
}

export type InstallDependencyKey = "node" | "npm" | "git" | "rg" | "codex" | "opencode";

export interface InstallDependenciesResult {
  ok: boolean;
  logs: string[];
  status: InstallStatus;
}

export interface CodexAuthStatus {
  authenticated: boolean;
  requiresOpenaiAuth: boolean;
  accountType?: "apiKey" | "chatgpt";
  email?: string;
  planType?: string;
  message?: string;
}

export interface CodexLoginResult {
  ok: boolean;
  authUrl?: string;
  alreadyAuthenticated?: boolean;
  message: string;
}

export interface CodexLogoutResult {
  ok: boolean;
  alreadyLoggedOut?: boolean;
  message: string;
}

export interface OpenCodeAuthMethod {
  id: string;
  source: "credential" | "environment";
  providerLabel: string;
  authKind?: string;
  envVarName?: string;
  removable: boolean;
  rawLabel: string;
}

export interface OpenCodeAuthStatus {
  authenticated: boolean;
  hasStoredCredentials: boolean;
  methods: OpenCodeAuthMethod[];
  credentialMethods: OpenCodeAuthMethod[];
  environmentMethods: OpenCodeAuthMethod[];
  credentialProviders: string[];
  environmentProviders: string[];
  message?: string;
}

export interface OpenCodeAuthCommandResult {
  ok: boolean;
  launched?: boolean;
  message: string;
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
  theme?: AppTheme;
  defaultHarnessId?: HarnessId;
  harnessSettings: HarnessSettings;
  binaryOverrides: Partial<Record<Provider, string>>;
  envVars: Record<string, string>;
  codexDefaults: CodexThreadOptions;
  defaultProjectDirectory?: string;
  autoRenameThreadTitles?: boolean;
  showThreadSummaries?: boolean;
  useTurtleSpinners?: boolean;
  condenseActivityTimeline?: boolean;
  projectTerminalSwitchBehaviorDefault?: ProjectTerminalSwitchBehavior;
  preferredSystemTerminalId?: SystemTerminalId;
  subthreadPolicyDefault?: SubthreadPolicy;
}

export type OrchestrationStatus =
  | "proposed"
  | "queued"
  | "running"
  | "completed"
  | "failed"
  | "stopped"
  | "canceled";

export interface SubthreadProposalTask {
  key: string;
  title: string;
  prompt: string;
  expectedOutput?: string;
}

export interface SubthreadProposal {
  reason: string;
  parentGoal: string;
  tasks: SubthreadProposalTask[];
}

export interface OrchestrationRun {
  id: string;
  parentThreadId: string;
  proposal: SubthreadProposal;
  policy: SubthreadPolicy;
  status: OrchestrationStatus;
  createdAt: string;
  updatedAt: string;
}

export interface OrchestrationChild {
  id: string;
  runId: string;
  taskKey: string;
  childThreadId?: string;
  title: string;
  prompt: string;
  status: OrchestrationStatus;
  lastCheckinAt?: string;
  lastError?: string;
  retryOfChildId?: string;
  createdAt: string;
  updatedAt: string;
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

export interface GitHistoryCommit {
  hash: string;
  summary: string;
  date: string;
  refs?: string;
}

export interface GitSnapshot {
  state: GitState;
  outgoingCommits: GitOutgoingCommit[];
  incomingCommits: GitOutgoingCommit[];
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

export type SkillScope = "user" | "repo" | "system" | "admin";

export interface SkillRecord {
  name: string;
  path: string;
  description: string;
  enabled: boolean;
  scope: SkillScope;
}
