export type Provider = "codex" | "gemini";

export type PermissionMode = "prompt_on_risk" | "always_ask" | "auto_allow";

export type ThreadStatus = "created" | "running" | "stopped" | "exited" | "error";

export type CodexApprovalMode = "never" | "on-request" | "on-failure" | "untrusted";

export type CodexSandboxMode = "read-only" | "workspace-write" | "danger-full-access";

export type CodexModelReasoningEffort = "minimal" | "low" | "medium" | "high" | "xhigh";

export type CodexWebSearchMode = "disabled" | "cached" | "live";

export interface CodexThreadOptions {
  model?: string;
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
  createdAt: string;
  updatedAt: string;
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
  ts: string;
  streamSeq: number;
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
  key: "node" | "npm" | "codex" | "gemini";
  ok: boolean;
  message: string;
  version?: string;
}

export interface InstallStatus {
  nodeOk: boolean;
  npmOk: boolean;
  codexOk: boolean;
  geminiOk: boolean;
  details: InstallDetail[];
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

export interface AppSettings {
  permissionMode: PermissionMode;
  binaryOverrides: Partial<Record<Provider, string>>;
  envVars: Record<string, string>;
  codexDefaults: CodexThreadOptions;
  defaultProjectDirectory?: string;
  autoRenameThreadTitles?: boolean;
}

export interface UpdateCheckResult {
  available: boolean;
  version?: string;
  notes?: string;
}
