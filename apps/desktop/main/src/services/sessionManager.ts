import { createHash } from "node:crypto";
import os from "node:os";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import * as pty from "node-pty";
import type {
  CodexThreadOptions,
  OrchestrationChild,
  OrchestrationRun,
  OrchestrationStatus,
  PromptAttachment,
  Session,
  SessionEvent,
  SessionEventType,
  SkillRecord,
  SubthreadPolicy,
  SubthreadProposal,
  Thread,
  ThreadMetadataSuggestion
} from "@code-app/shared";
import { PROVIDER_ADAPTERS } from "./providerAdapters";
import { Repository } from "./repository";
import { PermissionEngine } from "./permissionEngine";
import { CodexAppServerClient } from "./codexAppServer";
import { sanitizePtyOutput } from "../utils/stripAnsi";
import { createCommandRunner } from "../utils/commandRunner";
import { withRuntimePath } from "../utils/runtimeEnv";
import { resolveCodexBinaryPath } from "../utils/codexBinary";
import { withBundledRipgrepInPath } from "../utils/ripgrepBinary";

type UnknownRecord = Record<string, unknown>;
const commandRunner = createCommandRunner();

interface RunningPtySession {
  kind: "pty";
  ptyProcess: pty.IPty;
  threadId: string;
  cwd: string;
}

interface RunningCodexSession {
  kind: "codex_app_server";
  threadId: string;
  appServer: CodexAppServerClient;
  providerThreadId: string;
  runQueue: Promise<void>;
  cwd: string;
  threadOptions: ReturnType<typeof normalizeCodexThreadOptions>;
  optionsKey: string;
}

interface StoredAttachment {
  kind: "image" | "text";
  name: string;
  mimeType: string;
  size: number;
  path: string;
}

type CodexInputItem =
  | { type: "text"; text: string }
  | { type: "local_image"; path: string }
  | { type: "skill"; name: string; path: string }
  | { type: "mention"; name: string; path: string };
type CodexInput = string | CodexInputItem[];

type RunningSession = RunningPtySession | RunningCodexSession;

interface SessionManagerDeps {
  repository: Repository;
  permissionEngine: PermissionEngine;
  emit: (event: SessionEvent) => void;
}

interface SubthreadFeedbackUpdate {
  childThreadId: string;
  feedback: string;
}

const asRecord = (value: unknown): UnknownRecord | null => {
  if (!value || typeof value !== "object") {
    return null;
  }

  return value as UnknownRecord;
};

const asString = (value: unknown): string | null => {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const isCodexModelReasoningEffort = (value: unknown): value is NonNullable<CodexThreadOptions["modelReasoningEffort"]> =>
  value === "minimal" || value === "low" || value === "medium" || value === "high" || value === "xhigh";

const isCodexSandboxMode = (value: unknown): value is NonNullable<CodexThreadOptions["sandboxMode"]> =>
  value === "read-only" || value === "workspace-write" || value === "danger-full-access";

const isCodexWebSearchMode = (value: unknown): value is NonNullable<CodexThreadOptions["webSearchMode"]> =>
  value === "disabled" || value === "cached" || value === "live";

const isCodexApprovalPolicy = (value: unknown): value is NonNullable<CodexThreadOptions["approvalPolicy"]> =>
  value === "never" || value === "on-request" || value === "on-failure" || value === "untrusted";

const isCodexCollaborationMode = (value: unknown): value is NonNullable<CodexThreadOptions["collaborationMode"]> =>
  value === "coding" || value === "plan";

const normalizeCodexModel = (value: string | null): string | undefined => {
  if (!value) {
    return undefined;
  }

  const normalized = value.toLowerCase();
  if (normalized === "codex-5.3") {
    return "gpt-5.3-codex";
  }
  if (normalized === "codex-5.3-spark") {
    return "gpt-5.3-codex-spark";
  }

  return value;
};

const normalizeCodexThreadOptions = (
  cwd: string,
  options?: CodexThreadOptions
): Required<Pick<CodexThreadOptions, "sandboxMode" | "modelReasoningEffort" | "webSearchMode" | "networkAccessEnabled" | "approvalPolicy">> &
  Pick<CodexThreadOptions, "model" | "collaborationMode"> & {
    workingDirectory: string;
    skipGitRepoCheck: true;
  } => {
  const model = normalizeCodexModel(asString(options?.model));
  const collaborationMode = isCodexCollaborationMode(options?.collaborationMode) ? options.collaborationMode : "plan";
  const sandboxMode = isCodexSandboxMode(options?.sandboxMode) ? options.sandboxMode : "workspace-write";
  const modelReasoningEffort = isCodexModelReasoningEffort(options?.modelReasoningEffort)
    ? options.modelReasoningEffort
    : "medium";
  const webSearchMode = isCodexWebSearchMode(options?.webSearchMode) ? options.webSearchMode : "cached";
  const networkAccessEnabled = typeof options?.networkAccessEnabled === "boolean" ? options.networkAccessEnabled : true;
  const approvalPolicy = isCodexApprovalPolicy(options?.approvalPolicy) ? options.approvalPolicy : "on-request";

  return {
    model,
    collaborationMode,
    sandboxMode,
    modelReasoningEffort,
    webSearchMode,
    networkAccessEnabled,
    approvalPolicy,
    workingDirectory: cwd,
    skipGitRepoCheck: true
  };
};

const codexThreadOptionsKey = (options: ReturnType<typeof normalizeCodexThreadOptions>) =>
  JSON.stringify({
    model: options.model ?? "",
    collaborationMode: options.collaborationMode ?? "",
    sandboxMode: options.sandboxMode,
    modelReasoningEffort: options.modelReasoningEffort,
    webSearchMode: options.webSearchMode,
    networkAccessEnabled: options.networkAccessEnabled,
    approvalPolicy: options.approvalPolicy,
    workingDirectory: options.workingDirectory
  });

const THREAD_METADATA_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    title: { type: "string" },
    description: { type: "string" }
  },
  required: ["title", "description"]
} as const;

const MERGE_RESOLUTION_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    summary: { type: "string" },
    files: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          path: { type: "string" },
          content: { type: "string" }
        },
        required: ["path", "content"]
      }
    }
  },
  required: ["summary", "files"]
} as const;

const normalizeMetadataField = (value: string, maxLength: number, maxWords?: number) =>
  value
    .replace(/\s+/g, " ")
    .replace(/^["'`]+|["'`]+$/g, "")
    .trim()
    .split(" ")
    .slice(0, typeof maxWords === "number" ? maxWords : Number.MAX_SAFE_INTEGER)
    .join(" ")
    .slice(0, maxLength);

const normalizeThreadTitle = (value: string) => {
  const compact = normalizeMetadataField(value, 40, 4);
  if (!compact) {
    return "";
  }
  const words = compact.split(" ").filter(Boolean).slice(0, 4);
  return words.join(" ").slice(0, 36).trim();
};

const extensionFromMimeType = (mimeType: string): string => {
  const normalized = mimeType.toLowerCase().trim();
  if (normalized === "image/png") return "png";
  if (normalized === "image/jpeg") return "jpg";
  if (normalized === "image/webp") return "webp";
  if (normalized === "image/gif") return "gif";
  if (normalized === "image/bmp") return "bmp";
  if (normalized === "image/tiff") return "tiff";
  if (normalized === "image/heic") return "heic";
  if (normalized === "image/heif") return "heif";
  return "png";
};

const DEFAULT_TEXT_ATTACHMENT_MIME = "text/plain";

const parseDataUrlPayload = (dataUrl: string): { mimeType: string; data: Buffer } | null => {
  const match = /^data:([^;,]+)?(;base64)?,([\s\S]*)$/i.exec(dataUrl.trim());
  if (!match) {
    return null;
  }
  const mimeType = (match[1] ?? DEFAULT_TEXT_ATTACHMENT_MIME).toLowerCase().trim();
  const isBase64 = Boolean(match[2]);
  const rawPayload = match[3] ?? "";

  try {
    const decoded = isBase64
      ? Buffer.from(rawPayload.replace(/\s+/g, ""), "base64")
      : Buffer.from(decodeURIComponent(rawPayload), "utf8");
    if (decoded.length === 0) {
      return null;
    }
    return {
      mimeType,
      data: decoded
    };
  } catch {
    return null;
  }
};

const inferAttachmentKind = (mimeType: string): "image" | "text" => {
  return mimeType.startsWith("image/") ? "image" : "text";
};

const lastLinePreview = (text: string): string | undefined => {
  const lines = text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  return lines.length > 0 ? lines[lines.length - 1] : undefined;
};

const countLabel = (count: number, singular: string, plural: string) => `${count} ${count === 1 ? singular : plural}`;

const truncate = (text: string, max = 1400) => (text.length <= max ? text : `${text.slice(0, max - 1)}…`);
const truncateWithFlag = (text: string, max = 6000) =>
  text.length <= max ? { text, truncated: false } : { text: `${text.slice(0, max - 1)}…`, truncated: true };

const outputTail = (text: string, maxLines = 8) => {
  const lines = text
    .split("\n")
    .map((line) => line.replace(/\r/g, ""))
    .filter((line) => line.trim().length > 0);

  if (lines.length === 0) {
    return undefined;
  }

  return truncate(lines.slice(-maxLines).join("\n"));
};

const describeRuntimeError = (error: unknown) => {
  if (!(error instanceof Error)) {
    return String(error);
  }

  const details: string[] = [];
  const record = error as Error & { code?: string; path?: string; syscall?: string; cwd?: string };
  if (record.code) {
    details.push(`code=${record.code}`);
  }
  if (record.path) {
    details.push(`path=${record.path}`);
  }
  if (record.syscall) {
    details.push(`syscall=${record.syscall}`);
  }
  if (record.cwd) {
    details.push(`cwd=${record.cwd}`);
  }

  if (details.length === 0) {
    return error.message;
  }

  return `${error.message} (${details.join(", ")})`;
};

const isRecoverableCodexResumeError = (error: unknown): boolean => {
  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  return (
    message.includes("no rollout found for thread id") ||
    message.includes("failed to load rollout") ||
    message.includes("empty session file") ||
    message.includes("session file")
  );
};

const extractCommandText = (item: UnknownRecord): string => {
  const direct = asString(item.command);
  if (direct) {
    return direct;
  }

  if (Array.isArray(item.command)) {
    const joined = item.command
      .map((part) => (typeof part === "string" ? part.trim() : ""))
      .filter(Boolean)
      .join(" ");
    if (joined) {
      return joined;
    }
  }

  const commandRecord = asRecord(item.command);
  if (commandRecord) {
    const bin = asString(commandRecord.bin) ?? asString(commandRecord.executable) ?? asString(commandRecord.program);
    const args = Array.isArray(commandRecord.args)
      ? commandRecord.args.map((arg) => (typeof arg === "string" ? arg.trim() : "")).filter(Boolean)
      : [];
    const combined = [bin, ...args].filter(Boolean).join(" ").trim();
    if (combined) {
      return combined;
    }
  }

  const line =
    asString(item.commandLine) ??
    asString(item.command_line) ??
    asString(item.cmd) ??
    asString(item.program) ??
    asString(item.executable);
  if (line) {
    return line;
  }

  return "(command)";
};

const stripOuterQuotes = (value: string) => {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith("'") && trimmed.endsWith("'")) ||
    (trimmed.startsWith("\"") && trimmed.endsWith("\""))
  ) {
    return trimmed.slice(1, -1).trim();
  }

  return trimmed;
};

const unwrapShellCommand = (command: string): string => {
  let current = stripOuterQuotes(command);
  let previous = "";
  const wrappers: RegExp[] = [
    /^\/bin\/(?:bash|zsh|sh)\s+-lc\s+([\s\S]+)$/i,
    /^(?:bash|zsh|sh)\s+-lc\s+([\s\S]+)$/i,
    /^cmd(?:\.exe)?\s+\/d\s+\/s\s+\/c\s+([\s\S]+)$/i,
    /^powershell(?:\.exe)?\s+-command\s+([\s\S]+)$/i
  ];

  while (current !== previous) {
    previous = current;

    for (const wrapper of wrappers) {
      const match = wrapper.exec(current);
      if (!match?.[1]) {
        continue;
      }

      current = stripOuterQuotes(match[1]);
      break;
    }

    current = current.replace(/\\'/g, "'").replace(/\\"/g, "\"");
  }

  return current;
};

const classifyCommandIntent = (command: string): "read" | "write" | "other" => {
  const normalized = unwrapShellCommand(command).trim().toLowerCase();
  if (!normalized) {
    return "other";
  }

  const readPatterns = [
    /^cat\s+/,
    /^less\s+/,
    /^head\s+/,
    /^tail\s+/,
    /^rg\s+/,
    /^grep\s+/,
    /^find\s+/,
    /^ls(?:\s|$)/,
    /^tree(?:\s|$)/,
    /^pwd(?:\s|$)/,
    /^stat\s+/,
    /^fd(?:\s|$)/,
    /^git\s+status(?:\s|$)/,
    /^git\s+diff(?:\s|$)/,
    /^git\s+show(?:\s|$)/,
    /^npm\s+view(?:\s|$)/
  ];

  if (readPatterns.some((pattern) => pattern.test(normalized))) {
    return "read";
  }

  const writePatterns = [
    /^apply_patch(?:\s|$)/,
    /^sed\s+-i(?:\s|$)/,
    /^perl\s+-pi(?:\s|$)/,
    /^mv\s+/,
    /^cp\s+/,
    /^mkdir\s+/,
    /^touch\s+/,
    /^git\s+commit(?:\s|$)/
  ];

  if (writePatterns.some((pattern) => pattern.test(normalized))) {
    return "write";
  }

  return "other";
};

const classifyToolIntent = (tool: string): "read" | "write" | "other" => {
  const normalized = tool.trim().toLowerCase();
  if (!normalized) {
    return "other";
  }

  const readTools = ["read", "open", "search", "find", "glob", "list", "grep"];
  if (readTools.some((token) => normalized.includes(token))) {
    return "read";
  }

  const writeTools = ["edit", "write", "patch", "replace", "create", "delete"];
  if (writeTools.some((token) => normalized.includes(token))) {
    return "write";
  }

  return "other";
};

const isUserInputRequestTool = (tool: string | null) => {
  if (!tool) {
    return false;
  }
  const normalized = tool.trim().toLowerCase();
  return normalized === "request_user_input" || normalized.endsWith(".request_user_input");
};

const ACTIVITY_EVENT_PREFIX = "__codeapp_activity__:";
const SUBTHREAD_PROPOSAL_TAG = "subthread_proposal_v1";
const SUBTHREAD_PROPOSAL_PATTERN = new RegExp(
  String.raw`<${SUBTHREAD_PROPOSAL_TAG}>\s*([\s\S]*?)\s*<\/${SUBTHREAD_PROPOSAL_TAG}>`,
  "i"
);
const SUBTHREAD_FEEDBACK_TAG = "subthread_feedback_v1";
const SUBTHREAD_FEEDBACK_PATTERN = new RegExp(
  String.raw`<${SUBTHREAD_FEEDBACK_TAG}>\s*([\s\S]*?)\s*<\/${SUBTHREAD_FEEDBACK_TAG}>`,
  "i"
);
const ORCHESTRATION_MAX_TASKS = 8;
const ORCHESTRATION_MAX_ACTIVE_CHILDREN = 3;
const ORCHESTRATION_HEARTBEAT_MS = 90_000;

const shouldPersistActivityEvent = (type: SessionEventType, data?: Record<string, unknown>) => {
  if (type === "stdout") {
    return false;
  }

  if (type === "stderr" || type === "exit" || type === "status") {
    return true;
  }

  if (type !== "progress") {
    return false;
  }

  const category = typeof data?.category === "string" ? data.category : "";
  const blocked = new Set(["assistant_draft", "turn", "thread"]);
  return !blocked.has(category);
};

const diffStatsFromText = (diffText: string) => {
  let added = 0;
  let removed = 0;

  diffText.split("\n").forEach((line) => {
    if (line.startsWith("+++") || line.startsWith("---")) {
      return;
    }
    if (line.startsWith("+")) {
      added += 1;
      return;
    }
    if (line.startsWith("-")) {
      removed += 1;
    }
  });

  return { added, removed };
};

interface DiffData {
  diff?: string;
  diffSource?: string;
  diffStats?: { added: number; removed: number };
  diffTruncated?: boolean;
  diffError?: string;
}

interface ChangedFile extends DiffData {
  path: string;
  kind: string;
}

interface UserInputOption {
  label: string;
  description?: string;
}

interface UserInputQuestion {
  id: string;
  header: string;
  question: string;
  options: UserInputOption[];
}

const parseJsonRecord = (value: string): UnknownRecord | null => {
  const trimmed = value.trim();
  if (!trimmed.startsWith("{") || !trimmed.endsWith("}")) {
    return null;
  }
  try {
    const parsed = JSON.parse(trimmed);
    return asRecord(parsed);
  } catch {
    return null;
  }
};

const readToolInputRecord = (item: UnknownRecord): UnknownRecord | null => {
  const candidates = [item.input, item.arguments, item.params, item.parameters];
  for (const candidate of candidates) {
    const fromRecord = asRecord(candidate);
    if (fromRecord) {
      return fromRecord;
    }

    const fromString = asString(candidate);
    if (!fromString) {
      continue;
    }
    const parsed = parseJsonRecord(fromString);
    if (parsed) {
      return parsed;
    }
  }

  return null;
};

const extractUserInputQuestions = (item: UnknownRecord): UserInputQuestion[] => {
  const input = readToolInputRecord(item);
  const itemIdPrefix = asString(item.id) ?? "request";
  const questionsRaw = Array.isArray(input?.questions)
    ? input.questions
    : Array.isArray(item.questions)
      ? item.questions
      : [];
  const questions: UserInputQuestion[] = [];

  questionsRaw.forEach((question, index) => {
    const row = asRecord(question);
    if (!row) {
      return;
    }

    const prompt = asString(row.question);
    if (!prompt) {
      return;
    }

    const header = asString(row.header) ?? `Question ${index + 1}`;
    const id = asString(row.id) ?? `${itemIdPrefix}_question_${index + 1}`;
    const optionsRaw = Array.isArray(row.options) ? row.options : [];
    const options: UserInputOption[] = [];

    optionsRaw.forEach((option) => {
      const optionRow = asRecord(option);
      if (!optionRow) {
        return;
      }
      const label = asString(optionRow.label);
      if (!label) {
        return;
      }
      options.push({
        label,
        description: asString(optionRow.description) ?? undefined
      });
    });

    questions.push({
      id,
      header,
      question: prompt,
      options
    });
  });

  return questions;
};

export class SessionManager {
  private readonly sessions = new Map<string, RunningSession>();
  private readonly gitRepoCache = new Map<string, boolean>();
  private readonly childToRunId = new Map<string, string>();
  private readonly runHeartbeatTimerById = new Map<string, ReturnType<typeof setInterval>>();
  private readonly runSpawnQueue = new Map<string, Promise<void>>();
  private readonly childProgressDebounceById = new Map<string, number>();
  private readonly runParentResumeTriggered = new Set<string>();

  constructor(private readonly deps: SessionManagerDeps) {}

  async start(thread: Thread, projectPath: string, options?: CodexThreadOptions): Promise<Session> {
    const existing = this.deps.repository.getSession(thread.id);
    const existingRuntime = this.sessions.get(thread.id);
    if (existing && existingRuntime) {
      if (thread.provider !== "codex") {
        return existing;
      }

      const normalizedOptions = normalizeCodexThreadOptions(projectPath, options ?? this.deps.repository.getSettings().codexDefaults);
      const nextOptionsKey = codexThreadOptionsKey(normalizedOptions);
      if (existingRuntime.kind === "codex_app_server" && existingRuntime.optionsKey === nextOptionsKey) {
        return existing;
      }

      if (existingRuntime.kind === "codex_app_server") {
        void existingRuntime.appServer.close();
      }
      this.deps.repository.stopSession(thread.id);
      this.deps.permissionEngine.clearThreadApprovals(thread.id);
      this.sessions.delete(thread.id);
    }

    if (thread.provider === "codex") {
      const settings = this.deps.repository.getSettings();
      const mergedOptions: CodexThreadOptions = {
        ...settings.codexDefaults,
        ...options
      };
      return this.startCodexSession(thread, projectPath, mergedOptions);
    }

    return this.startPtySession(thread, projectPath);
  }

  stop(threadId: string): boolean {
    const running = this.sessions.get(threadId);
    if (!running) {
      return false;
    }

    if (running.kind === "codex_app_server") {
      void running.appServer.close();
      this.deps.repository.stopSession(threadId);
      this.deps.permissionEngine.clearThreadApprovals(threadId);
      this.sessions.delete(threadId);
      this.emitSessionEvent(threadId, "status", "Codex app server session stopped", {
        provider: "codex",
        phase: "stopped"
      });
      return true;
    }

    try {
      running.ptyProcess.kill();
      this.deps.repository.stopSession(threadId);
      this.deps.permissionEngine.clearThreadApprovals(threadId);
      this.sessions.delete(threadId);

      this.emitSessionEvent(threadId, "status", "Session stopped", { phase: "stopped" });
      return true;
    } catch {
      this.deps.repository.setThreadErrored(threadId);
      this.emitSessionEvent(threadId, "stderr", "Failed to stop session", { phase: "failed" });
      return false;
    }
  }

  resize(threadId: string, cols: number, rows: number): boolean {
    const running = this.sessions.get(threadId);
    if (!running) {
      return false;
    }

    if (running.kind === "pty") {
      running.ptyProcess.resize(cols, rows);
    }

    return true;
  }

  async sendInput(
    threadId: string,
    input: string,
    options?: CodexThreadOptions,
    attachments?: PromptAttachment[],
    skills?: Array<{ name: string; path: string }>
  ): Promise<boolean> {
    const thread = this.deps.repository.getThread(threadId);
    if (!thread) {
      return false;
    }

    const sessionRecord = this.deps.repository.getSession(threadId);
    const project = this.deps.repository.getProject(thread.projectId);
    const cwd = this.sessions.get(threadId)?.cwd ?? sessionRecord?.cwd ?? project?.path;
    if (!cwd) {
      return false;
    }

    let running = this.sessions.get(threadId);
    if (thread.provider === "codex") {
      await this.start(thread, cwd, options);
      running = this.sessions.get(threadId);
    } else {
      running = running ?? ((await this.startOrResumeRuntime(thread, cwd, options)) ?? undefined);
    }
    if (!running) {
      return false;
    }

    const savedAttachments = this.persistPromptAttachments(threadId, attachments ?? []);
    const userContent = this.formatUserMessage(input, savedAttachments);
    const now = new Date().toISOString();
    this.deps.repository.appendMessage({
      threadId,
      role: "user",
      content: userContent,
      attachments: this.normalizePromptAttachmentsForMessage(attachments ?? []),
      ts: now
    });

    if (running.kind === "pty") {
      running.ptyProcess.write(input.endsWith("\n") ? input : `${input}\n`);
      return true;
    }

    const codexInput = this.buildCodexInput(input, savedAttachments, skills ?? []);
    running.runQueue = running.runQueue
      .then(() => this.runCodexPromptWithRecovery(running, codexInput))
      .catch((error) => {
        this.deps.repository.setThreadErrored(threadId);
        this.emitSessionEvent(
          threadId,
          "stderr",
          `Codex run failed: ${describeRuntimeError(error)}`,
          {
            provider: "codex",
            phase: "failed"
          }
        );
      });

    return true;
  }

  async steerInput(
    threadId: string,
    input: string,
    attachments?: PromptAttachment[],
    skills?: Array<{ name: string; path: string }>
  ): Promise<boolean> {
    const thread = this.deps.repository.getThread(threadId);
    if (!thread || thread.provider !== "codex") {
      return false;
    }

    const running = this.sessions.get(threadId);
    if (!running || running.kind !== "codex_app_server") {
      return false;
    }

    const savedAttachments = this.persistPromptAttachments(threadId, attachments ?? []);
    const codexInput = this.buildCodexInput(input, savedAttachments, skills ?? []);
    const inputItems: CodexInputItem[] =
      typeof codexInput === "string" ? [{ type: "text", text: codexInput }] : codexInput;
    await running.appServer.steerTurn(inputItems);

    this.deps.repository.appendMessage({
      threadId,
      role: "user",
      content: input.trim(),
      attachments: this.normalizePromptAttachmentsForMessage(attachments ?? []),
      ts: new Date().toISOString()
    });
    this.emitSessionEvent(threadId, "progress", "Steering active turn...", {
      provider: "codex",
      phase: "running",
      category: "turn"
    });

    return true;
  }

  async submitUserInputAnswers(
    threadId: string,
    requestId: string,
    answersByQuestionId: Record<string, string>
  ): Promise<boolean> {
    const running = this.sessions.get(threadId);
    if (!running || running.kind !== "codex_app_server") {
      return false;
    }

    const answers = Object.fromEntries(
      Object.entries(answersByQuestionId).map(([questionId, answer]) => [questionId, { answers: [answer] }])
    );
    await running.appServer.submitUserInputAnswers(requestId, answers);
    return true;
  }

  async compactThread(threadId: string): Promise<boolean> {
    const thread = this.deps.repository.getThread(threadId);
    if (!thread || thread.provider !== "codex") {
      return false;
    }

    const providerThreadId = this.deps.repository.getProviderThreadId(threadId, "codex");
    if (!providerThreadId) {
      return false;
    }

    const running = this.sessions.get(threadId);
    if (running && running.kind === "codex_app_server") {
      await running.appServer.compactThread(providerThreadId);
    } else {
      const { env } = this.buildThreadEnv(thread.id, thread.projectId, thread.provider);
      const appServer = new CodexAppServerClient({
        executablePath: resolveCodexBinaryPath(),
        env,
        threadId: thread.id
      });
      await appServer.connect();
      try {
        await appServer.compactThread(providerThreadId);
      } finally {
        await appServer.close();
      }
    }

    this.emitSessionEvent(threadId, "progress", "Context compaction started", {
      provider: "codex",
      phase: "running",
      category: "context_compaction"
    });
    return true;
  }

  async forkThread(threadId: string, upToStreamSeq?: number): Promise<Thread | null> {
    const sourceThread = this.deps.repository.getThread(threadId);
    if (!sourceThread) {
      return null;
    }

    const forkSourceMessages = this.deps.repository.listMessagesForFork({
      threadId: sourceThread.id,
      upToStreamSeq
    });
    const userTurnsAfterCutoff =
      typeof upToStreamSeq === "number" && Number.isFinite(upToStreamSeq)
        ? this.deps.repository
            .listMessagesForFork({ threadId: sourceThread.id })
            .filter((event) => event.role === "user" && event.streamSeq > upToStreamSeq).length
        : 0;

    const forked = this.deps.repository.createThread({
      projectId: sourceThread.projectId,
      title: `${sourceThread.title} (fork)`,
      provider: sourceThread.provider,
      parentThreadId: sourceThread.id
    });

    forkSourceMessages.forEach((event) => {
      this.deps.repository.appendMessage({
        threadId: forked.id,
        role: event.role,
        content: event.content,
        attachments: event.attachments,
        ts: event.ts
      });
    });

    if (sourceThread.provider !== "codex") {
      return forked;
    }

    const sourceProviderThreadId = this.deps.repository.getProviderThreadId(sourceThread.id, "codex");
    if (!sourceProviderThreadId) {
      return forked;
    }

    const project = this.deps.repository.getProject(sourceThread.projectId);
    if (!project) {
      return forked;
    }

    const options = normalizeCodexThreadOptions(project.path, this.deps.repository.getSettings().codexDefaults);
    const { env } = this.buildThreadEnv(forked.id, sourceThread.projectId, sourceThread.provider);
    const appServer = new CodexAppServerClient({
      executablePath: resolveCodexBinaryPath(),
      env,
      threadId: forked.id
    });
    await appServer.connect();
    try {
      const forkedProviderThreadId = await appServer.forkThread(sourceProviderThreadId, options);
      if (userTurnsAfterCutoff > 0) {
        await appServer.rollbackThread(forkedProviderThreadId, userTurnsAfterCutoff);
      }
      this.deps.repository.setProviderThreadId(forked.id, "codex", forkedProviderThreadId);
    } finally {
      await appServer.close();
    }

    return forked;
  }

  listOrchestrationRuns(parentThreadId: string): OrchestrationRun[] {
    return this.deps.repository.listOrchestrationRuns(parentThreadId);
  }

  getOrchestrationRun(runId: string): { run: OrchestrationRun; children: OrchestrationChild[] } | null {
    const run = this.deps.repository.getOrchestrationRun(runId);
    if (!run) {
      return null;
    }
    return {
      run,
      children: this.deps.repository.listOrchestrationChildren(runId)
    };
  }

  async approveOrchestrationProposal(runId: string, selectedTaskKeys?: string[]): Promise<boolean> {
    const run = this.deps.repository.getOrchestrationRun(runId);
    if (!run) {
      return false;
    }
    const children = this.deps.repository.listOrchestrationChildren(runId);
    const allowed = selectedTaskKeys?.length
      ? new Set(selectedTaskKeys.map((key) => key.trim()).filter(Boolean))
      : null;
    children.forEach((child) => {
      if (child.status !== "proposed") {
        return;
      }
      if (allowed && !allowed.has(child.taskKey)) {
        this.deps.repository.updateOrchestrationChild({
          id: child.id,
          status: "canceled",
          lastCheckinAt: new Date().toISOString()
        });
        return;
      }
      this.deps.repository.updateOrchestrationChild({
        id: child.id,
        status: "queued",
        lastCheckinAt: new Date().toISOString()
      });
    });
    this.deps.repository.updateOrchestrationRunStatus(runId, "queued");
    await this.scheduleRunSpawns(runId);
    return true;
  }

  async stopOrchestrationChild(childThreadId: string): Promise<boolean> {
    const child = this.deps.repository.getOrchestrationChildByThreadId(childThreadId);
    if (!child) {
      return false;
    }
    this.stop(childThreadId);
    this.deps.repository.updateOrchestrationChild({
      id: child.id,
      status: "stopped",
      lastCheckinAt: new Date().toISOString()
    });
    await this.scheduleRunSpawns(child.runId);
    await this.refreshRunStatus(child.runId);
    return true;
  }

  async retryOrchestrationChild(childRowId: string): Promise<boolean> {
    const child = this.deps.repository.getOrchestrationChildById(childRowId);
    if (!child) {
      return false;
    }
    const retry = this.deps.repository.createOrchestrationChild({
      runId: child.runId,
      taskKey: child.taskKey,
      title: child.title,
      prompt: child.prompt,
      status: "queued",
      retryOfChildId: child.id
    });
    this.emitOrchestrationMilestone(child.runId, `Retry queued: ${retry.title}`, "orchestration_retry", {
      childId: retry.id,
      retryOfChildId: child.id
    });
    await this.scheduleRunSpawns(child.runId);
    return true;
  }

  async reviewCommit(threadId: string, sha: string, title?: string): Promise<boolean> {
    const thread = this.deps.repository.getThread(threadId);
    if (!thread || thread.provider !== "codex") {
      return false;
    }

    const sessionRecord = this.deps.repository.getSession(threadId);
    const project = this.deps.repository.getProject(thread.projectId);
    const cwd = this.sessions.get(threadId)?.cwd ?? sessionRecord?.cwd ?? project?.path;
    if (!cwd) {
      return false;
    }

    const running = this.sessions.get(threadId) ?? (await this.startOrResumeRuntime(thread, cwd, undefined));
    if (!running || running.kind !== "codex_app_server") {
      return false;
    }

    running.runQueue = running.runQueue
      .then(() =>
        this.runCodexReview(
          running,
          {
            type: "commit",
            sha,
            title: title ?? null
          },
          "inline"
        )
      )
      .catch((error) => {
        this.deps.repository.setThreadErrored(threadId);
        this.emitSessionEvent(threadId, "stderr", `Codex review failed: ${describeRuntimeError(error)}`, {
          provider: "codex",
          phase: "failed"
        });
      });

    return true;
  }

  async reviewThread(threadId: string, instructions?: string): Promise<boolean> {
    const thread = this.deps.repository.getThread(threadId);
    if (!thread || thread.provider !== "codex") {
      return false;
    }

    const sessionRecord = this.deps.repository.getSession(threadId);
    const project = this.deps.repository.getProject(thread.projectId);
    const cwd = this.sessions.get(threadId)?.cwd ?? sessionRecord?.cwd ?? project?.path;
    if (!cwd) {
      return false;
    }

    const running = this.sessions.get(threadId) ?? (await this.startOrResumeRuntime(thread, cwd, undefined));
    if (!running || running.kind !== "codex_app_server") {
      return false;
    }

    const cleanedInstructions = instructions?.trim();
    running.runQueue = running.runQueue
      .then(() =>
        this.runCodexReview(
          running,
          {
            type: "custom",
            instructions:
              cleanedInstructions && cleanedInstructions.length > 0
                ? cleanedInstructions
                : "Review this thread and provide key findings."
          },
          "inline"
        )
      )
      .catch((error) => {
        this.deps.repository.setThreadErrored(threadId);
        this.emitSessionEvent(threadId, "stderr", `Codex review failed: ${describeRuntimeError(error)}`, {
          provider: "codex",
          phase: "failed"
        });
      });

    return true;
  }

  async listSkills(projectId?: string): Promise<SkillRecord[]> {
    const project = projectId ? this.deps.repository.getProject(projectId) : null;
    const cwd = project?.path ?? process.cwd();
    const env = Object.fromEntries(
      Object.entries(
        withBundledRipgrepInPath(
          withRuntimePath({
            ...process.env,
            ...this.deps.repository.getSettings().envVars,
            FORCE_COLOR: "0",
            NO_COLOR: "1",
            CLICOLOR: "0",
            TERM: "dumb",
            CODE_APP_PROVIDER: "codex"
          })
        )
      ).filter((entry): entry is [string, string] => typeof entry[1] === "string")
    );

    const appServer = new CodexAppServerClient({
      executablePath: resolveCodexBinaryPath(),
      env,
      threadId: `skills-${Date.now()}`
    });
    await appServer.connect();
    try {
      const response = asRecord(await appServer.listSkills(cwd));
      const entries = Array.isArray(response?.data) ? response.data : [];
      const records: SkillRecord[] = [];
      entries.forEach((entry) => {
        const row = asRecord(entry);
        const skills = Array.isArray(row?.skills) ? row.skills : [];
        skills.forEach((skill) => {
          const skillRow = asRecord(skill);
          const name = asString(skillRow?.name);
          const path = asString(skillRow?.path);
          const description = asString(skillRow?.description) ?? "";
          const scope = asString(skillRow?.scope);
          if (!name || !path || !scope) {
            return;
          }
          records.push({
            name,
            path,
            description,
            enabled: Boolean(skillRow?.enabled),
            scope: scope as SkillRecord["scope"]
          });
        });
      });
      return records;
    } finally {
      await appServer.close();
    }
  }

  async setSkillEnabled(projectId: string | undefined, path: string, enabled: boolean): Promise<boolean> {
    const project = projectId ? this.deps.repository.getProject(projectId) : null;
    const cwd = project?.path ?? process.cwd();
    const env = Object.fromEntries(
      Object.entries(
        withBundledRipgrepInPath(
          withRuntimePath({
            ...process.env,
            ...this.deps.repository.getSettings().envVars,
            FORCE_COLOR: "0",
            NO_COLOR: "1",
            CLICOLOR: "0",
            TERM: "dumb",
            CODE_APP_PROVIDER: "codex"
          })
        )
      ).filter((entry): entry is [string, string] => typeof entry[1] === "string")
    );

    const appServer = new CodexAppServerClient({
      executablePath: resolveCodexBinaryPath(),
      env,
      threadId: `skills-write-${Date.now()}`
    });
    await appServer.connect();
    try {
      await appServer.setSkillEnabled(path, enabled);
      void cwd;
      return true;
    } finally {
      await appServer.close();
    }
  }

  async generateThreadMetadata(
    threadId: string,
    input: string,
    options?: CodexThreadOptions
  ): Promise<ThreadMetadataSuggestion | null> {
    const prompt = input.trim();
    if (!prompt) {
      return null;
    }

    const thread = this.deps.repository.getThread(threadId);
    if (!thread || thread.provider !== "codex") {
      return null;
    }

    const project = this.deps.repository.getProject(thread.projectId);
    if (!project) {
      return null;
    }

    const { env } = this.buildThreadEnv(thread.id, thread.projectId, thread.provider);
    const codexPathOverride = resolveCodexBinaryPath();
    const mergedOptions: CodexThreadOptions = {
      ...this.deps.repository.getSettings().codexDefaults,
      ...options,
      collaborationMode: "plan"
    };
    const threadOptions = normalizeCodexThreadOptions(project.path, mergedOptions);
    const appServer = new CodexAppServerClient({
      executablePath: codexPathOverride,
      env,
      threadId
    });
    await appServer.connect();

    const metadataPrompt = [
      "Generate metadata for a new chat thread based on this first user prompt.",
      "Return concise plain-English strings.",
      "Title: 2-4 words, very short and specific.",
      "Description: 2-6 words summarizing intent.",
      "Avoid filler words and avoid repeating the exact user text.",
      "",
      "User prompt:",
      prompt
    ].join("\n");

    const providerThreadId = await appServer.startOrResumeThread(null, threadOptions);
    let latestDraft = "";
    let finalText = "";
    await appServer.runTurn(
      providerThreadId,
      [{ type: "text", text: metadataPrompt }],
      threadOptions,
      (event) => {
        const eventType = asString((event as UnknownRecord).type) ?? "";
        if (eventType !== "item.updated" && eventType !== "item.completed") {
          return;
        }
        const item = asRecord((event as UnknownRecord).item);
        if (!item || asString(item.type) !== "agent_message") {
          return;
        }
        const text = sanitizePtyOutput(asString(item.text) ?? "");
        if (!text) {
          return;
        }
        if (eventType === "item.completed") {
          finalText = text;
        } else {
          latestDraft = text;
        }
      },
      {
        outputSchema: THREAD_METADATA_SCHEMA
      }
    );
    await appServer.close();

    const text = (finalText || latestDraft).trim();
    if (!text) {
      return null;
    }
    try {
      const parsed = JSON.parse(text) as unknown;
      return this.readThreadMetadataSuggestion(parsed);
    } catch {
      const match = /\{[\s\S]*\}/.exec(text);
      if (!match) {
        return null;
      }
      try {
        return this.readThreadMetadataSuggestion(JSON.parse(match[0]));
      } catch {
        return null;
      }
    }
  }

  async suggestCommitMessage(cwd: string, files: string[], diff: string): Promise<string | null> {
    const cleanFiles = files.map((file) => file.trim()).filter(Boolean);
    if (cleanFiles.length === 0) {
      return null;
    }

    const settings = this.deps.repository.getSettings();
    const env = Object.fromEntries(
      Object.entries(
        withRuntimePath({
          ...process.env,
          ...settings.envVars,
          FORCE_COLOR: "0",
          NO_COLOR: "1",
          CLICOLOR: "0",
          TERM: "dumb",
          CODE_APP_PROVIDER: "codex"
        })
      ).filter((entry): entry is [string, string] => typeof entry[1] === "string")
    );

    const threadOptions = normalizeCodexThreadOptions(cwd, {
      ...settings.codexDefaults,
      collaborationMode: "coding"
    });
    const prompt = [
      "Write a single git commit subject line for the staged changes.",
      "Rules:",
      "- Return exactly one line.",
      "- Use imperative mood.",
      "- Keep it under 72 characters if possible.",
      "- No trailing period, no quotes, no markdown.",
      "",
      "Staged files:",
      ...cleanFiles.map((file) => `- ${file}`),
      "",
      "Staged diff (may be truncated):",
      diff.trim() || "(no diff text available)"
    ].join("\n");

    const appServer = new CodexAppServerClient({
      executablePath: resolveCodexBinaryPath(),
      env,
      threadId: `commit-message-${Date.now()}`
    });
    await appServer.connect();

    try {
      const providerThreadId = await appServer.startOrResumeThread(null, threadOptions);
      let latestDraft = "";
      let finalText = "";
      await appServer.runTurn(
        providerThreadId,
        [{ type: "text", text: prompt }],
        threadOptions,
        (event) => {
          const eventType = asString((event as UnknownRecord).type) ?? "";
          if (eventType !== "item.updated" && eventType !== "item.completed") {
            return;
          }
          const item = asRecord((event as UnknownRecord).item);
          if (!item || asString(item.type) !== "agent_message") {
            return;
          }
          const text = sanitizePtyOutput(asString(item.text) ?? "");
          if (!text) {
            return;
          }
          if (eventType === "item.completed") {
            finalText = text;
          } else {
            latestDraft = text;
          }
        }
      );

      const text = sanitizePtyOutput((finalText || latestDraft).trim());
      if (!text) {
        return null;
      }

      const firstLine = text
        .split(/\r?\n/u)
        .map((line) => line.trim())
        .find(Boolean);
      if (!firstLine) {
        return null;
      }

      const normalized = firstLine.replace(/^["'`]+|["'`]+$/g, "").trim();
      return normalized ? normalized.slice(0, 120) : null;
    } catch {
      return null;
    } finally {
      await appServer.close().catch(() => undefined);
    }
  }

  private async startOrResumeRuntime(
    thread: Thread,
    cwd: string,
    options?: CodexThreadOptions
  ): Promise<RunningSession | null> {
    if (thread.provider === "codex") {
      await this.start(thread, cwd, options);
      const runtime = this.sessions.get(thread.id);
      return runtime ?? null;
    }

    await this.start(thread, cwd);
    const runtime = this.sessions.get(thread.id);
    return runtime ?? null;
  }

  private readThreadMetadataSuggestion(runResult: unknown): ThreadMetadataSuggestion | null {
    const parsed = this.extractMetadataObject(runResult);
    if (!parsed) {
      return null;
    }

    const title = normalizeThreadTitle(parsed.title);
    const description = normalizeMetadataField(parsed.description, 56, 6);
    if (!title || !description) {
      return null;
    }

    return { title, description };
  }

  private extractMetadataObject(runResult: unknown): ThreadMetadataSuggestion | null {
    const queue: unknown[] = [runResult];
    const visited = new Set<unknown>();

    while (queue.length > 0) {
      const current = queue.shift();
      if (!current || visited.has(current)) {
        continue;
      }
      visited.add(current);

      const record = asRecord(current);
      if (!record) {
        continue;
      }

      const title = asString(record.title);
      const description = asString(record.description) ?? asString(record.summary);
      if (title && description) {
        return { title, description };
      }

      Object.values(record).forEach((value) => {
        if (!value) {
          return;
        }
        if (typeof value === "string") {
          const trimmed = value.trim();
          if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
            try {
              queue.push(JSON.parse(trimmed));
            } catch {
              // Ignore non-JSON strings.
            }
          }
          return;
        }
        if (Array.isArray(value)) {
          value.forEach((item) => queue.push(item));
          return;
        }
        if (typeof value === "object") {
          queue.push(value);
        }
      });
    }

    return null;
  }

  private formatUserMessage(input: string, attachments: StoredAttachment[]) {
    const trimmed = input.trim();
    if (attachments.length === 0) {
      return trimmed;
    }
    return trimmed;
  }

  private buildCodexInput(
    input: string,
    attachments: StoredAttachment[],
    skills: Array<{ name: string; path: string }>
  ): CodexInput {
    const trimmed = input.trim();
    if (attachments.length === 0 && skills.length === 0) {
      return trimmed;
    }

    const parts: CodexInputItem[] = [];
    skills.forEach((skill) => {
      const name = asString(skill.name);
      const skillPath = asString(skill.path);
      if (!name || !skillPath) {
        return;
      }
      parts.push({
        type: "skill",
        name,
        path: skillPath
      });
    });
    const attachmentManifest =
      attachments.length > 0
        ? [
            "Attached file references:",
            ...attachments.map((attachment, index) => {
              const typeLabel = attachment.kind === "image" ? "image" : "text/code";
              return `${index + 1}. [${typeLabel}] ${attachment.name} (${attachment.path})`;
            }),
            "Use these attached file references directly when answering."
          ].join("\n")
        : "";
    parts.push({
      type: "text",
      text: [trimmed || "Please analyze the attached files.", attachmentManifest].filter(Boolean).join("\n\n")
    });
    attachments.forEach((attachment) => {
      if (attachment.kind === "image") {
        parts.push({
          type: "local_image",
          path: attachment.path
        });
        return;
      }

      parts.push({
        type: "mention",
        name: attachment.name,
        path: attachment.path
      });
    });

    return parts;
  }

  async resolveMergeConflicts(
    cwd: string,
    files: Array<{ path: string; content: string }>
  ): Promise<{ files: Array<{ path: string; content: string }>; summary?: string } | null> {
    const normalizedFiles = files
      .map((file) => {
        const pathValue = asString(file.path);
        if (!pathValue) {
          return null;
        }
        const contentValue = typeof file.content === "string" ? file.content : "";
        if (!contentValue.includes("<<<<<<<") || !contentValue.includes(">>>>>>>")) {
          return null;
        }
        return {
          path: pathValue,
          content: contentValue
        };
      })
      .filter((entry): entry is { path: string; content: string } => Boolean(entry));

    if (normalizedFiles.length === 0) {
      return null;
    }

    const settings = this.deps.repository.getSettings();
    const env = Object.fromEntries(
      Object.entries(
        withRuntimePath({
          ...process.env,
          ...settings.envVars,
          FORCE_COLOR: "0",
          NO_COLOR: "1",
          CLICOLOR: "0",
          TERM: "dumb",
          CODE_APP_PROVIDER: "codex"
        })
      ).filter((entry): entry is [string, string] => typeof entry[1] === "string")
    );

    const threadOptions = normalizeCodexThreadOptions(cwd, {
      ...settings.codexDefaults,
      collaborationMode: "coding",
      sandboxMode: "read-only"
    });
    const prompt = [
      "You are resolving git merge conflicts.",
      "For each provided file, remove all conflict markers and return a complete resolved file content.",
      "Rules:",
      "- Keep the output compileable and internally consistent.",
      "- Preserve intended behavior from both sides when possible.",
      "- Do not add extra commentary inside file contents.",
      "- Every input path must appear once in the output files array.",
      "",
      "Conflicted files:",
      ...normalizedFiles.flatMap((file) => [`<file path=\"${file.path}\">`, file.content, "</file>"])
    ].join("\n");

    const appServer = new CodexAppServerClient({
      executablePath: resolveCodexBinaryPath(),
      env,
      threadId: `merge-conflicts-${Date.now()}`
    });
    await appServer.connect();

    try {
      const providerThreadId = await appServer.startOrResumeThread(null, threadOptions);
      let latestDraft = "";
      let finalText = "";
      await appServer.runTurn(
        providerThreadId,
        [{ type: "text", text: prompt }],
        threadOptions,
        (event) => {
          const eventType = asString((event as UnknownRecord).type) ?? "";
          if (eventType !== "item.updated" && eventType !== "item.completed") {
            return;
          }
          const item = asRecord((event as UnknownRecord).item);
          if (!item || asString(item.type) !== "agent_message") {
            return;
          }
          const text = sanitizePtyOutput(asString(item.text) ?? "");
          if (!text) {
            return;
          }
          if (eventType === "item.completed") {
            finalText = text;
          } else {
            latestDraft = text;
          }
        },
        {
          outputSchema: MERGE_RESOLUTION_SCHEMA
        }
      );

      const payload = (finalText || latestDraft).trim();
      if (!payload) {
        return null;
      }

      let parsed: unknown;
      try {
        parsed = JSON.parse(payload);
      } catch {
        const match = /\{[\s\S]*\}/.exec(payload);
        if (!match) {
          return null;
        }
        parsed = JSON.parse(match[0]);
      }
      const record = asRecord(parsed);
      if (!record) {
        return null;
      }
      const summary = asString(record.summary) ?? undefined;
      const filesRaw = Array.isArray(record.files) ? record.files : [];
      const resolvedFiles = filesRaw
        .map((entry) => {
          const row = asRecord(entry);
          const pathValue = asString(row?.path);
          const contentValue = typeof row?.content === "string" ? row.content : null;
          if (!pathValue || contentValue === null) {
            return null;
          }
          return {
            path: pathValue,
            content: contentValue
          };
        })
        .filter((entry): entry is { path: string; content: string } => Boolean(entry));

      if (resolvedFiles.length === 0) {
        return null;
      }
      return {
        files: resolvedFiles,
        summary
      };
    } catch {
      return null;
    } finally {
      await appServer.close().catch(() => undefined);
    }
  }

  private persistPromptAttachments(threadId: string, attachments: PromptAttachment[]): StoredAttachment[] {
    if (attachments.length === 0) {
      return [];
    }

    const thread = this.deps.repository.getThread(threadId);
    const project = thread ? this.deps.repository.getProject(thread.projectId) : null;
    const attachDir = project
      ? path.join(project.path, ".code-app", "attachments", threadId)
      : path.join(this.deps.repository.getThreadStoragePaths(threadId).threadDir, "attachments");
    mkdirSync(attachDir, { recursive: true });

    const stored: StoredAttachment[] = [];
    attachments.forEach((attachment, index) => {
      const name = asString(attachment.name) ?? `attachment-${index + 1}`;
      const parsed = parseDataUrlPayload(attachment.dataUrl);
      if (!parsed) {
        return;
      }
      const kind = inferAttachmentKind(parsed.mimeType);

      if (kind === "text") {
        const safeBase = name.replace(/[^a-zA-Z0-9._-]/g, "_");
        const extension = safeBase.includes(".") ? "" : ".txt";
        const fileName = `${Date.now()}-${index + 1}-${safeBase || "attachment"}${extension}`;
        const filePath = path.join(attachDir, fileName);
        writeFileSync(filePath, parsed.data);
        stored.push({
          kind: "text",
          name,
          mimeType: parsed.mimeType || DEFAULT_TEXT_ATTACHMENT_MIME,
          size: typeof attachment.size === "number" ? attachment.size : parsed.data.length,
          path: filePath
        });
        return;
      }

      const extension = extensionFromMimeType(parsed.mimeType);
      const safeBase = name.replace(/[^a-zA-Z0-9._-]/g, "_").replace(/\.[a-zA-Z0-9]+$/, "");
      const fileName = `${Date.now()}-${index + 1}-${safeBase || "image"}.${extension}`;
      const filePath = path.join(attachDir, fileName);
      writeFileSync(filePath, parsed.data);
      stored.push({
        kind: "image",
        name,
        mimeType: parsed.mimeType,
        size: typeof attachment.size === "number" ? attachment.size : parsed.data.length,
        path: filePath
      });
    });

    return stored;
  }

  private normalizePromptAttachmentsForMessage(attachments: PromptAttachment[]): PromptAttachment[] | undefined {
    const normalized: PromptAttachment[] = [];
    attachments.forEach((attachment, index) => {
      const parsed = parseDataUrlPayload(attachment.dataUrl);
      if (!parsed) {
        return;
      }
      normalized.push({
        name: asString(attachment.name) ?? `attachment-${index + 1}`,
        mimeType: parsed.mimeType,
        dataUrl: attachment.dataUrl.trim(),
        size: typeof attachment.size === "number" && Number.isFinite(attachment.size) ? attachment.size : parsed.data.length
      });
    });

    return normalized.length > 0 ? normalized : undefined;
  }

  private buildThreadEnv(threadId: string, projectId: string, provider: Thread["provider"]) {
    const settings = this.deps.repository.getSettings();
    const projectSettings = this.deps.repository.getProjectSettings(projectId);
    const merged = withBundledRipgrepInPath(
      withRuntimePath({
        ...process.env,
        ...projectSettings.envVars,
        FORCE_COLOR: "0",
        NO_COLOR: "1",
        CLICOLOR: "0",
        TERM: "dumb",
        CODE_APP_THREAD_ID: threadId,
        CODE_APP_PROVIDER: provider
      })
    );
    const env = Object.fromEntries(
      Object.entries(merged).filter((entry): entry is [string, string] => typeof entry[1] === "string")
    );

    return { settings, env };
  }

  private startPtySession(thread: Thread, projectPath: string): Session {
    const { settings, env } = this.buildThreadEnv(thread.id, thread.projectId, thread.provider);
    const adapter = PROVIDER_ADAPTERS[thread.provider];
    const binaryOverride = settings.binaryOverrides[thread.provider];
    const run = adapter.getRunCommand({ cwd: projectPath, binaryOverride });

    const ptyProcess = pty.spawn(run.command, run.args, {
      name: "xterm-256color",
      cols: 120,
      rows: 40,
      cwd: projectPath,
      env: env,
      useConpty: process.platform === "win32"
    });

    const envHash = createHash("sha1").update(JSON.stringify(env)).digest("hex");
    const session = this.deps.repository.startSession({
      threadId: thread.id,
      ptyPid: ptyProcess.pid,
      cwd: projectPath,
      envHash
    });

    this.sessions.set(thread.id, {
      kind: "pty",
      ptyProcess,
      threadId: thread.id,
      cwd: projectPath
    });

    this.emitSessionEvent(thread.id, "status", `Session started (${run.command}) on ${os.platform()}`);

    ptyProcess.onData((data) => {
      const parsed = adapter.parseOutputChunk(data);
      const cleaned = sanitizePtyOutput(parsed);
      if (!cleaned) {
        return;
      }

      this.persistAssistantChunk(thread.id, cleaned);
    });

    ptyProcess.onExit(({ exitCode, signal }) => {
      this.deps.repository.stopSession(thread.id);
      this.deps.repository.setThreadExited(thread.id);
      this.deps.permissionEngine.clearThreadApprovals(thread.id);
      this.sessions.delete(thread.id);

      this.emitSessionEvent(thread.id, "exit", `Process exited with code ${exitCode}${signal ? ` signal ${signal}` : ""}`);
    });

    return session;
  }

  private async startCodexSession(
    thread: Thread,
    projectPath: string,
    options?: CodexThreadOptions
  ): Promise<Session> {
    const { env } = this.buildThreadEnv(thread.id, thread.projectId, thread.provider);
    const codexPathOverride = resolveCodexBinaryPath();
    const appServer = new CodexAppServerClient({
      executablePath: codexPathOverride,
      env,
      threadId: thread.id
    });
    await appServer.connect();

    const existingProviderThreadId = this.deps.repository.getProviderThreadId(thread.id, "codex");
    const threadOptions = normalizeCodexThreadOptions(projectPath, options);
    const optionsKey = codexThreadOptionsKey(threadOptions);
    let providerThreadId: string;
    try {
      providerThreadId = await appServer.startOrResumeThread(existingProviderThreadId, threadOptions);
    } catch (error) {
      const resumeFailed = Boolean(existingProviderThreadId) && isRecoverableCodexResumeError(error);
      if (!resumeFailed) {
        throw error;
      }
      this.deps.repository.clearProviderThreadId(thread.id, "codex");
      providerThreadId = await appServer.startOrResumeThread(null, threadOptions);
    }
    this.deps.repository.setProviderThreadId(thread.id, "codex", providerThreadId);

    const envHash = createHash("sha1").update(JSON.stringify(env)).digest("hex");
    const session = this.deps.repository.startSession({
      threadId: thread.id,
      ptyPid: -1,
      cwd: projectPath,
      envHash
    });

    this.sessions.set(thread.id, {
      kind: "codex_app_server",
      threadId: thread.id,
      appServer,
      providerThreadId,
      runQueue: Promise.resolve(),
      cwd: projectPath,
      threadOptions,
      optionsKey
    });

    return session;
  }

  private async runCodexPromptWithRecovery(session: RunningCodexSession, input: CodexInput): Promise<void> {
    try {
      await this.runCodexPrompt(session, input);
      return;
    } catch (error) {
      const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
      const likelyContextOverflow =
        message.includes("context window") || message.includes("context length") || message.includes("too long");
      if (!likelyContextOverflow) {
        throw error;
      }
    }

    await session.appServer.compactThread(session.providerThreadId);
    this.emitSessionEvent(session.threadId, "progress", "Context compacted, retrying your prompt...", {
      provider: "codex",
      phase: "running",
      category: "context_compaction"
    });
    await this.runCodexPrompt(session, input);
  }

  private async runCodexPrompt(session: RunningCodexSession, input: CodexInput): Promise<void> {
    this.emitSessionEvent(session.threadId, "progress", "Thinking...", {
      provider: "codex",
      phase: "running",
      category: "turn"
    });

    const inputItems: CodexInputItem[] = typeof input === "string" ? [{ type: "text", text: input }] : input;
    const agentDrafts = new Map<string, string>();

    await session.appServer.runTurn(session.providerThreadId, inputItems, session.threadOptions, async (event) => {
      await this.handleCodexStreamEvent(session.threadId, event, agentDrafts);
    });
  }

  private async runCodexReview(
    session: RunningCodexSession,
    target: Record<string, unknown>,
    delivery: "inline" | "detached"
  ): Promise<void> {
    this.emitSessionEvent(session.threadId, "progress", "Starting code review...", {
      provider: "codex",
      phase: "running",
      category: "review"
    });
    const agentDrafts = new Map<string, string>();
    await session.appServer.startReview(session.providerThreadId, target, delivery, async (event) => {
      await this.handleCodexStreamEvent(session.threadId, event, agentDrafts);
    });
  }

  private async handleCodexStreamEvent(threadId: string, rawEvent: unknown, agentDrafts: Map<string, string>) {
    const event = asRecord(rawEvent);
    const eventType = asString(event?.type) ?? "unknown";

    switch (eventType) {
      case "thread.started": {
        const sdkThreadId = asString(event?.thread_id);
        this.emitSessionEvent(threadId, "progress", "Thinking...", {
          provider: "codex",
          category: "thread",
          eventType,
          threadId: sdkThreadId ?? undefined
        });
        return;
      }
      case "turn.started": {
        this.emitSessionEvent(threadId, "progress", "Turn started", {
          provider: "codex",
          category: "turn",
          eventType,
          turnId: asString(event?.turn_id) ?? undefined
        });
        return;
      }
      case "turn.completed": {
        const usage = asRecord(event?.usage);
        this.emitSessionEvent(threadId, "progress", "Turn completed", {
          provider: "codex",
          category: "turn",
          eventType,
          phase: "completed",
          usage: usage ?? undefined
        });
        return;
      }
      case "turn.failed": {
        const errorMessage =
          asString(asRecord(event?.error)?.message) ||
          asString(event?.message) ||
          "Codex turn failed.";
        throw new Error(errorMessage);
      }
      case "error": {
        const errorMessage = asString(event?.message) || "Codex stream error.";
        throw new Error(errorMessage);
      }
      case "item.started":
      case "item.updated":
      case "item.completed": {
        const item = asRecord(event?.item);
        if (!item) {
          return;
        }

        await this.handleCodexItemEvent(threadId, eventType, item, agentDrafts);
        return;
      }
      case "user_input.requested": {
        const requestId = asString(event?.request_id) ?? "";
        const questions = Array.isArray(event?.questions) ? (event.questions as unknown[]) : [];
        this.emitSessionEvent(threadId, "progress", "Waiting for your input", {
          provider: "codex",
          category: "user_input_request",
          phase: "awaiting_user_input",
          requestId: requestId || undefined,
          questions
        });
        return;
      }
      default: {
        this.emitSessionEvent(threadId, "progress", `Codex event: ${eventType}`, {
          provider: "codex",
          category: "event",
          eventType
        });
      }
    }
  }

  private async handleCodexItemEvent(
    threadId: string,
    eventType: "item.started" | "item.updated" | "item.completed",
    item: UnknownRecord,
    agentDrafts: Map<string, string>
  ) {
    const itemType = asString(item.type) ?? "unknown";
    const itemId = asString(item.id) ?? `${itemType}-${Date.now()}`;

    if (itemType === "user_message" || itemType === "userMessage") {
      return;
    }

    if (itemType === "agent_message") {
      const text = sanitizePtyOutput(asString(item.text) ?? "");
      if (!text) {
        return;
      }

      if (eventType === "item.completed") {
        agentDrafts.delete(itemId);
        this.persistAssistantChunk(threadId, text, {
          provider: "codex",
          category: "assistant_message",
          itemType,
          itemId,
          eventType,
          final: true
        });
        await this.maybeCreateSubthreadOrchestration(threadId, text);
      } else {
        const previous = agentDrafts.get(itemId);
        if (previous !== text) {
          agentDrafts.set(itemId, text);
          this.emitSessionEvent(threadId, "progress", "Drafting response...", {
            provider: "codex",
            category: "assistant_draft",
            itemType,
            itemId,
            eventType,
            text
          });
        }
      }
      return;
    }

    if (itemType === "command_execution") {
      const rawCommand = extractCommandText(item);
      const command = unwrapShellCommand(rawCommand);
      const commandIntent = classifyCommandIntent(command);
      const status = asString(item.status) ?? "in_progress";
      const output = asString(item.aggregated_output) ?? "";
      const outputPreview = output ? lastLinePreview(output) : undefined;
      const outputTailText = output ? outputTail(output) : undefined;
      const exitCode = typeof item.exit_code === "number" ? item.exit_code : undefined;
      const category = commandIntent === "read" ? "file_read" : "command";
      const payload =
        status === "completed" ? `Command completed: ${command}` : status === "failed" ? `Command failed: ${command}` : `Running command: ${command}`;

      this.emitSessionEvent(threadId, "progress", payload, {
        provider: "codex",
        category,
        itemType,
        itemId,
        eventType,
        status,
        command,
        commandIntent,
        outputPreview,
        outputTail: outputTailText,
        exitCode
      });
      return;
    }

    if (itemType === "file_change") {
      const rawChanges = Array.isArray(item.changes) ? item.changes : [];
      const changes: ChangedFile[] = rawChanges
        .map((change) => asRecord(change))
        .filter((change): change is UnknownRecord => Boolean(change))
        .map((change) => ({
          path: asString(change.path) ?? "unknown",
          kind: asString(change.kind) ?? "update"
        }));
      const status = asString(item.status) ?? "completed";
      const enrichedChanges = status === "completed" ? await this.enrichFileChangesWithDiffs(threadId, changes) : changes;
      const payload =
        enrichedChanges.length > 0
          ? `Updated ${countLabel(enrichedChanges.length, "file", "files")}`
          : status === "failed"
            ? "File patch failed"
            : "Applying file changes";

      this.emitSessionEvent(threadId, "progress", payload, {
        provider: "codex",
        category: "file_change",
        itemType,
        itemId,
        eventType,
        status,
        files: enrichedChanges
      });
      return;
    }

    if (itemType === "reasoning") {
      const text = sanitizePtyOutput(asString(item.text) ?? "");
      this.emitSessionEvent(threadId, "progress", text || "Thinking...", {
        provider: "codex",
        category: "reasoning",
        itemType,
        itemId,
        eventType,
        text
      });
      return;
    }

    if (itemType === "mcp_tool_call") {
      const server = asString(item.server);
      const tool = asString(item.tool);
      if (isUserInputRequestTool(tool)) {
        const status = asString(item.status) ?? "in_progress";
        const isWaiting = status !== "completed" && status !== "failed";
        const questions = extractUserInputQuestions(item);
        const payload = isWaiting
          ? `Waiting for your input${questions.length > 0 ? ` (${countLabel(questions.length, "question", "questions")})` : ""}`
          : "User input received";

        this.emitSessionEvent(threadId, "progress", payload, {
          provider: "codex",
          category: "user_input_request",
          itemType,
          itemId,
          eventType,
          status,
          phase: isWaiting ? "awaiting_user_input" : "completed",
          server: server ?? undefined,
          tool,
          command: tool,
          questions: questions.length > 0 ? questions : undefined,
          allowCustomOption: true
        });
        return;
      }

      const intent = tool ? classifyToolIntent(tool) : "other";
      const status = asString(item.status) ?? "in_progress";
      const payload = `${status === "completed" ? "Tool completed" : "Tool call"}${tool ? `: ${tool}` : ""}`;
      const category = intent === "read" ? "file_read" : intent === "write" ? "file_change" : "tool_call";

      this.emitSessionEvent(threadId, "progress", payload, {
        provider: "codex",
        category,
        itemType,
        itemId,
        eventType,
        status,
        server: server ?? undefined,
        tool: tool ?? undefined,
        command: tool ?? undefined,
        commandIntent: intent
      });
      return;
    }

    if (itemType === "web_search") {
      const query = asString(item.query) ?? "web search";
      this.emitSessionEvent(threadId, "progress", `Web search: ${query}`, {
        provider: "codex",
        category: "web_search",
        itemType,
        itemId,
        eventType,
        query
      });
      return;
    }

    if (itemType === "todo_list") {
      const todos = Array.isArray(item.items)
        ? item.items
            .map((todo) => asRecord(todo))
            .filter((todo): todo is UnknownRecord => Boolean(todo))
            .map((todo) => ({
              text: asString(todo.text) ?? "task",
              completed: Boolean(todo.completed)
            }))
        : [];

      const completed = todos.filter((todo) => todo.completed).length;
      const payload = `Plan updated (${completed}/${todos.length})`;

      this.emitSessionEvent(threadId, "progress", payload, {
        provider: "codex",
        category: "plan",
        itemType,
        itemId,
        eventType,
        todos
      });
      return;
    }

    if (itemType === "error") {
      const message = asString(item.message) ?? "Codex reported an item error.";
      this.emitSessionEvent(threadId, "stderr", message, {
        provider: "codex",
        category: "item_error",
        itemType,
        itemId,
        eventType
      });
      return;
    }

    this.emitSessionEvent(threadId, "progress", `Item update: ${itemType}`, {
      provider: "codex",
      category: "item",
      itemType,
      itemId,
      eventType
    });
  }

  private async enrichFileChangesWithDiffs(threadId: string, changes: ChangedFile[]): Promise<ChangedFile[]> {
    if (changes.length === 0) {
      return changes;
    }

    const session = this.sessions.get(threadId);
    const fallbackSession = this.deps.repository.getSession(threadId);
    const cwd = session?.cwd ?? fallbackSession?.cwd;
    if (!cwd) {
      return changes;
    }

    const insideGit = await this.isGitRepo(cwd);
    const enriched = await Promise.all(
      changes.map(async (change) => {
        const diffData = await this.getDiffForChange(cwd, change, insideGit);
        return {
          ...change,
          ...diffData
        };
      })
    );

    return enriched;
  }

  private async isGitRepo(cwd: string): Promise<boolean> {
    const cached = this.gitRepoCache.get(cwd);
    if (cached !== undefined) {
      return cached;
    }

    const result = await commandRunner.run("git", ["rev-parse", "--is-inside-work-tree"], cwd);
    const inside = result.code === 0 && result.stdout.trim() === "true";
    this.gitRepoCache.set(cwd, inside);
    return inside;
  }

  private async getDiffForChange(cwd: string, change: ChangedFile, insideGit: boolean): Promise<DiffData> {
    const normalizedPath = change.path.replace(/\\/g, "/");
    const diffTarget = path.isAbsolute(normalizedPath) ? path.relative(cwd, normalizedPath) : normalizedPath;
    const absolutePath = path.isAbsolute(normalizedPath) ? normalizedPath : path.join(cwd, normalizedPath);

    if (insideGit) {
      const attempts: Array<{ source: string; args: string[] }> = [
        { source: "git_diff_worktree", args: ["diff", "--no-ext-diff", "--", diffTarget] },
        { source: "git_diff_cached", args: ["diff", "--cached", "--no-ext-diff", "--", diffTarget] },
        { source: "git_diff_head", args: ["diff", "HEAD", "--no-ext-diff", "--", diffTarget] }
      ];

      if (change.kind === "add") {
        attempts.push({
          source: "git_diff_no_index",
          args: ["diff", "--no-index", "--no-ext-diff", "--", process.platform === "win32" ? "NUL" : "/dev/null", diffTarget]
        });
      }

      for (const attempt of attempts) {
        const result = await commandRunner.run("git", attempt.args, cwd);
        if (!result.stdout.trim()) {
          continue;
        }

        const trimmed = truncateWithFlag(result.stdout, 12000);
        return {
          diff: trimmed.text,
          diffSource: attempt.source,
          diffStats: diffStatsFromText(result.stdout),
          diffTruncated: trimmed.truncated
        };
      }
    }

    if (change.kind === "add" && existsSync(absolutePath)) {
      try {
        const raw = readFileSync(absolutePath, "utf8");
        const snippet = raw
          .split("\n")
          .slice(0, 180)
          .map((line) => `+${line}`)
          .join("\n");
        const syntheticDiff = `--- /dev/null\n+++ b/${normalizedPath}\n@@ -0,0 +1,${snippet.split("\n").length} @@\n${snippet}`;
        const trimmed = truncateWithFlag(syntheticDiff, 12000);
        return {
          diff: trimmed.text,
          diffSource: "file_snapshot",
          diffStats: diffStatsFromText(syntheticDiff),
          diffTruncated: trimmed.truncated
        };
      } catch (error) {
        return {
          diffError: `Snapshot read failed: ${error instanceof Error ? error.message : String(error)}`
        };
      }
    }

    return {
      diffError: insideGit ? "No git diff output for this change." : "Project is not a git repository."
    };
  }

  private parseSubthreadProposal(content: string): SubthreadProposal | null {
    const match = SUBTHREAD_PROPOSAL_PATTERN.exec(content);
    if (!match?.[1]) {
      return null;
    }
    try {
      const parsed = JSON.parse(match[1]) as Record<string, unknown>;
      const reason = asString(parsed.reason) ?? "";
      const parentGoal = asString(parsed.parentGoal) ?? "";
      const rawTasks = Array.isArray(parsed.tasks) ? parsed.tasks : [];
      if (!reason || !parentGoal || rawTasks.length === 0 || rawTasks.length > ORCHESTRATION_MAX_TASKS) {
        return null;
      }
      const seen = new Set<string>();
      const tasks: SubthreadProposal["tasks"] = [];
      for (const rawTask of rawTasks) {
        const row = asRecord(rawTask);
        if (!row) {
          return null;
        }
        const key = asString(row.key)?.toLowerCase() ?? "";
        const title = asString(row.title) ?? "";
        const prompt = asString(row.prompt) ?? "";
        const expectedOutput = asString(row.expectedOutput) ?? undefined;
        if (!key || !title || !prompt || seen.has(key)) {
          return null;
        }
        seen.add(key);
        tasks.push({ key, title, prompt, expectedOutput });
      }
      return { reason, parentGoal, tasks };
    } catch {
      return null;
    }
  }

  private parseSubthreadFeedback(content: string): SubthreadFeedbackUpdate[] {
    const match = SUBTHREAD_FEEDBACK_PATTERN.exec(content);
    if (!match?.[1]) {
      return [];
    }
    try {
      const parsed = JSON.parse(match[1]) as Record<string, unknown>;
      const rawUpdates = Array.isArray(parsed.updates) ? parsed.updates : [];
      const updates: SubthreadFeedbackUpdate[] = [];
      for (const raw of rawUpdates) {
        const row = asRecord(raw);
        if (!row) {
          continue;
        }
        const childThreadId = asString(row.childThreadId)?.trim() ?? "";
        const feedback = asString(row.feedback)?.trim() ?? "";
        if (!childThreadId || !feedback) {
          continue;
        }
        updates.push({ childThreadId, feedback });
      }
      return updates;
    } catch {
      return [];
    }
  }

  private async maybeProcessSubthreadFeedback(parentThreadId: string, assistantMessage: string): Promise<void> {
    const updates = this.parseSubthreadFeedback(assistantMessage);
    if (updates.length === 0) {
      return;
    }
    const runs = this.deps.repository.listOrchestrationRuns(parentThreadId);
    if (runs.length === 0) {
      return;
    }
    const allowedChildThreadIds = new Set<string>();
    for (const run of runs) {
      for (const child of this.deps.repository.listOrchestrationChildren(run.id)) {
        if (child.childThreadId) {
          allowedChildThreadIds.add(child.childThreadId);
        }
      }
    }
    for (const update of updates) {
      if (!allowedChildThreadIds.has(update.childThreadId)) {
        continue;
      }
      const ok = await this.sendInput(
        update.childThreadId,
        `Feedback from parent orchestration:\n${update.feedback}`
      );
      if (!ok) {
        this.emitSessionEvent(parentThreadId, "progress", `Failed to send feedback to child ${update.childThreadId}`, {
          category: "orchestration_feedback_failed",
          childThreadId: update.childThreadId
        });
      } else {
        this.emitSessionEvent(parentThreadId, "progress", `Sent follow-up feedback to child ${update.childThreadId}`, {
          category: "orchestration_feedback_sent",
          childThreadId: update.childThreadId
        });
      }
    }
  }

  private getEffectiveSubthreadPolicy(thread: Thread): SubthreadPolicy {
    const projectSettings = this.deps.repository.getProjectSettings(thread.projectId);
    if (projectSettings.subthreadPolicyOverride) {
      return projectSettings.subthreadPolicyOverride;
    }
    return this.deps.repository.getSettings().subthreadPolicyDefault ?? "ask";
  }

  private async maybeCreateSubthreadOrchestration(parentThreadId: string, assistantMessage: string): Promise<void> {
    const thread = this.deps.repository.getThread(parentThreadId);
    if (!thread || thread.provider !== "codex") {
      return;
    }
    await this.maybeProcessSubthreadFeedback(parentThreadId, assistantMessage);
    const proposal = this.parseSubthreadProposal(assistantMessage);
    if (!proposal) {
      return;
    }
    const policy = this.getEffectiveSubthreadPolicy(thread);
    const run = this.deps.repository.createOrchestrationRun({
      parentThreadId,
      proposal,
      policy,
      status: policy === "auto" ? "queued" : "proposed"
    });
    for (const task of proposal.tasks) {
      this.deps.repository.createOrchestrationChild({
        runId: run.id,
        taskKey: task.key,
        title: task.title,
        prompt: task.prompt,
        status: policy === "auto" ? "queued" : "proposed"
      });
    }
    this.emitOrchestrationMilestone(
      run.id,
      policy === "auto"
        ? `Auto-spawning ${proposal.tasks.length} sub-threads`
        : `Sub-thread proposal created (${proposal.tasks.length} tasks)`,
      "orchestration_proposal",
      { policy, taskCount: proposal.tasks.length, runId: run.id }
    );
    if (policy === "auto") {
      await this.scheduleRunSpawns(run.id);
    }
  }

  private async scheduleRunSpawns(runId: string): Promise<void> {
    const previous = this.runSpawnQueue.get(runId) ?? Promise.resolve();
    const next = previous
      .catch(() => undefined)
      .then(async () => {
        while (true) {
          const children = this.deps.repository.listOrchestrationChildren(runId);
          const runningCount = children.filter((child) => child.status === "running").length;
          if (runningCount >= ORCHESTRATION_MAX_ACTIVE_CHILDREN) {
            break;
          }
          const nextChild = children.find((child) => child.status === "queued");
          if (!nextChild) {
            break;
          }
          await this.spawnOrchestrationChild(nextChild);
        }
        await this.refreshRunStatus(runId);
      });
    this.runSpawnQueue.set(runId, next);
    await next;
  }

  private async spawnOrchestrationChild(child: OrchestrationChild): Promise<void> {
    const run = this.deps.repository.getOrchestrationRun(child.runId);
    if (!run) {
      return;
    }
    const parentThread = this.deps.repository.getThread(run.parentThreadId);
    if (!parentThread) {
      this.deps.repository.updateOrchestrationChild({
        id: child.id,
        status: "failed",
        lastError: "Parent thread not found",
        lastCheckinAt: new Date().toISOString()
      });
      return;
    }
    const createdThread =
      child.childThreadId && this.deps.repository.getThread(child.childThreadId)
        ? this.deps.repository.getThread(child.childThreadId)!
        : this.deps.repository.createThread({
            projectId: parentThread.projectId,
            title: child.title,
            provider: parentThread.provider,
            parentThreadId: parentThread.id
          });
    const project = this.deps.repository.getProject(parentThread.projectId);
    if (!project) {
      this.deps.repository.updateOrchestrationChild({
        id: child.id,
        status: "failed",
        childThreadId: createdThread.id,
        lastError: "Project not found",
        lastCheckinAt: new Date().toISOString()
      });
      return;
    }
    this.deps.repository.updateOrchestrationChild({
      id: child.id,
      childThreadId: createdThread.id,
      status: "running",
      lastCheckinAt: new Date().toISOString(),
      lastError: ""
    });
    this.childToRunId.set(createdThread.id, run.id);
    const parentSession = this.sessions.get(parentThread.id);
    const options = parentSession && parentSession.kind === "codex_app_server" ? parentSession.threadOptions : undefined;
    this.emitOrchestrationMilestone(run.id, `Child started: ${child.title}`, "orchestration_child_started", {
      childThreadId: createdThread.id,
      childId: child.id
    });
    try {
      await this.start(createdThread, project.path, options);
      await this.sendInput(createdThread.id, child.prompt, options);
      this.startOrRefreshRunHeartbeat(run.id);
    } catch (error) {
      this.deps.repository.updateOrchestrationChild({
        id: child.id,
        childThreadId: createdThread.id,
        status: "failed",
        lastCheckinAt: new Date().toISOString(),
        lastError: error instanceof Error ? error.message : String(error)
      });
      this.emitOrchestrationMilestone(run.id, `Child failed to start: ${child.title}`, "orchestration_child_failed", {
        childThreadId: createdThread.id,
        childId: child.id
      });
    }
  }

  private startOrRefreshRunHeartbeat(runId: string) {
    const existing = this.runHeartbeatTimerById.get(runId);
    if (existing) {
      clearInterval(existing);
    }
    const timer = setInterval(() => {
      const children = this.deps.repository.listOrchestrationChildren(runId);
      const running = children.filter((child) => child.status === "running");
      if (running.length === 0) {
        const registered = this.runHeartbeatTimerById.get(runId);
        if (registered) {
          clearInterval(registered);
        }
        this.runHeartbeatTimerById.delete(runId);
        return;
      }
      const nowMs = Date.now();
      const stale = running.filter((child) => {
        const ts = child.lastCheckinAt ? Date.parse(child.lastCheckinAt) : 0;
        return !ts || nowMs - ts >= ORCHESTRATION_HEARTBEAT_MS;
      });
      if (stale.length === 0) {
        return;
      }
      stale.forEach((child) => {
        this.deps.repository.updateOrchestrationChild({
          id: child.id,
          lastCheckinAt: new Date().toISOString()
        });
      });
      this.emitOrchestrationMilestone(
        runId,
        `Heartbeat: ${stale.length} sub-thread${stale.length === 1 ? "" : "s"} still running`,
        "orchestration_heartbeat",
        { runningCount: running.length }
      );
    }, ORCHESTRATION_HEARTBEAT_MS);
    this.runHeartbeatTimerById.set(runId, timer);
  }

  private async refreshRunStatus(runId: string): Promise<void> {
    const run = this.deps.repository.getOrchestrationRun(runId);
    if (!run) {
      return;
    }
    const children = this.deps.repository.listOrchestrationChildren(runId);
    if (children.length === 0) {
      return;
    }
    const statuses = new Set(children.map((child) => child.status));
    let status: OrchestrationStatus = run.status;
    if (statuses.has("running")) {
      status = "running";
    } else if (statuses.has("queued")) {
      status = "queued";
    } else if (statuses.has("failed")) {
      status = "failed";
    } else if (statuses.has("stopped")) {
      status = "stopped";
    } else if (statuses.has("completed")) {
      status = "completed";
    } else if (statuses.has("canceled")) {
      status = "canceled";
    } else if (statuses.has("proposed")) {
      status = "proposed";
    }
    if (status !== run.status) {
      this.deps.repository.updateOrchestrationRunStatus(runId, status);
      this.emitOrchestrationMilestone(runId, `Orchestration ${status}`, "orchestration_status", { status });
      if (status === "running" || status === "queued" || status === "proposed") {
        this.runParentResumeTriggered.delete(runId);
      }
      if (status === "completed" || status === "failed" || status === "stopped" || status === "canceled") {
        await this.maybeResumeParentAfterOrchestration(runId, status);
      }
    }
  }

  private async maybeResumeParentAfterOrchestration(runId: string, status: OrchestrationStatus): Promise<void> {
    if (this.runParentResumeTriggered.has(runId)) {
      return;
    }
    const run = this.deps.repository.getOrchestrationRun(runId);
    if (!run) {
      return;
    }
    this.runParentResumeTriggered.add(runId);
    try {
      const summaryPrompt = this.buildParentResumePrompt(run, status);
      const resumed = await this.sendInput(run.parentThreadId, summaryPrompt);
      if (!resumed) {
        this.emitOrchestrationMilestone(
          runId,
          "Sub-threads finished but parent resume could not be started",
          "orchestration_resume_failed",
          { status }
        );
      } else {
        this.emitOrchestrationMilestone(
          runId,
          "Sub-threads finished, resuming parent synthesis",
          "orchestration_resume_parent",
          { status }
        );
      }
    } catch (error) {
      this.emitOrchestrationMilestone(
        runId,
        `Parent resume failed: ${error instanceof Error ? error.message : String(error)}`,
        "orchestration_resume_failed",
        { status }
      );
    }
  }

  private buildParentResumePrompt(run: OrchestrationRun, status: OrchestrationStatus): string {
    const children = this.deps.repository.listOrchestrationChildren(run.id);
    const lines = children.map((child) => {
      const threadId = child.childThreadId;
      let assistantSummary = "No assistant output captured.";
      if (threadId) {
        const page = this.deps.repository.listMessages({ threadId, userPromptCount: 1 });
        for (let i = page.events.length - 1; i >= 0; i -= 1) {
          const event = page.events[i];
          if (!event) {
            continue;
          }
          if (event.role === "assistant" && event.content.trim()) {
            const singleLine = event.content.replace(/\s+/g, " ").trim();
            assistantSummary = singleLine.length > 280 ? `${singleLine.slice(0, 280)}...` : singleLine;
            break;
          }
        }
      }
      const childIdNote = threadId ? ` | childThreadId: ${threadId}` : "";
      const errorNote = child.lastError ? ` | error: ${child.lastError.replace(/\s+/g, " ").trim()}` : "";
      return `- ${child.title} [${child.status}]${childIdNote}: ${assistantSummary}${errorNote}`;
    });
    return [
      "Sub-thread orchestration has finished. Continue the parent task now.",
      `Run status: ${status}.`,
      `Goal: ${run.proposal.parentGoal}`,
      "Sub-thread outcomes:",
      ...lines,
      "Please synthesize these outcomes and continue with the next concrete implementation steps.",
      "If the remaining work is still large, you may propose and spawn a new sub-thread orchestration run.",
      `If a child needs additional direction, emit <${SUBTHREAD_FEEDBACK_TAG}> JSON with this shape:`,
      '<subthread_feedback_v1>{"updates":[{"childThreadId":"<child-id>","feedback":"<what to do next>"}]}</subthread_feedback_v1>',
      "Only include childThreadId values listed above."
    ].join("\n");
  }

  private emitOrchestrationMilestone(runId: string, payload: string, category: string, data?: Record<string, unknown>) {
    const run = this.deps.repository.getOrchestrationRun(runId);
    if (!run) {
      return;
    }
    this.emitSessionEvent(run.parentThreadId, "progress", payload, {
      category,
      runId,
      ...(data ?? {})
    });
  }

  private handleOrchestrationChildSessionEvent(
    threadId: string,
    type: SessionEventType,
    payload: string,
    data?: Record<string, unknown>
  ) {
    const runId = this.childToRunId.get(threadId);
    if (!runId) {
      return;
    }
    const child = this.deps.repository.getOrchestrationChildByThreadId(threadId);
    if (!child) {
      return;
    }
    const now = new Date().toISOString();
    if (type === "progress") {
      const category = asString(data?.category) ?? "";
      const phase = asString(data?.phase) ?? "";
      if (category === "turn" && phase === "completed") {
        this.deps.repository.updateOrchestrationChild({
          id: child.id,
          status: "completed",
          lastCheckinAt: now,
          lastError: ""
        });
        this.emitOrchestrationMilestone(runId, `Child completed: ${child.title}`, "orchestration_child_completed", {
          childThreadId: threadId,
          childId: child.id
        });
        void this.scheduleRunSpawns(runId);
        void this.refreshRunStatus(runId);
        return;
      }
      this.deps.repository.updateOrchestrationChild({
        id: child.id,
        status: child.status === "queued" ? "running" : child.status,
        lastCheckinAt: now
      });
      const nowMs = Date.now();
      const last = this.childProgressDebounceById.get(child.id) ?? 0;
      if (nowMs - last > 20_000) {
        this.childProgressDebounceById.set(child.id, nowMs);
        this.emitOrchestrationMilestone(runId, `Progress: ${child.title}`, "orchestration_child_progress", {
          childThreadId: threadId,
          childId: child.id
        });
      }
      return;
    }
    if (type === "stderr") {
      this.deps.repository.updateOrchestrationChild({
        id: child.id,
        lastCheckinAt: now,
        lastError: payload
      });
      return;
    }
    if (type === "status" && payload.toLowerCase().includes("stopped")) {
      this.deps.repository.updateOrchestrationChild({
        id: child.id,
        status: "stopped",
        lastCheckinAt: now
      });
      this.emitOrchestrationMilestone(runId, `Child stopped: ${child.title}`, "orchestration_child_stopped", {
        childThreadId: threadId,
        childId: child.id
      });
      void this.scheduleRunSpawns(runId);
      void this.refreshRunStatus(runId);
      return;
    }
    if (type === "exit") {
      const lower = payload.toLowerCase();
      const failed = lower.includes("code") && !lower.includes("code 0");
      this.deps.repository.updateOrchestrationChild({
        id: child.id,
        status: failed ? "failed" : "completed",
        lastCheckinAt: now,
        lastError: failed ? payload : ""
      });
      this.emitOrchestrationMilestone(
        runId,
        failed ? `Child failed: ${child.title}` : `Child completed: ${child.title}`,
        failed ? "orchestration_child_failed" : "orchestration_child_completed",
        { childThreadId: threadId, childId: child.id }
      );
      void this.scheduleRunSpawns(runId);
      void this.refreshRunStatus(runId);
    }
  }

  private emitSessionEvent(
    threadId: string,
    type: SessionEventType,
    payload: string,
    data?: Record<string, unknown>
  ) {
    this.handleOrchestrationChildSessionEvent(threadId, type, payload, data);
    const ts = new Date().toISOString();
    this.deps.emit({
      threadId,
      type,
      payload,
      ts,
      data
    });

    if (!shouldPersistActivityEvent(type, data)) {
      return;
    }

    this.deps.repository.appendMessage({
      threadId,
      role: "system",
      content: `${ACTIVITY_EVENT_PREFIX}${JSON.stringify({ type, payload, ts, data: data ?? null })}`,
      ts
    });
  }

  private persistAssistantChunk(threadId: string, chunk: string, data?: Record<string, unknown>) {
    this.deps.repository.appendPtyLog(threadId, chunk);
    this.deps.repository.appendMessage({
      threadId,
      role: "assistant",
      content: chunk,
      ts: new Date().toISOString()
    });

    this.emitSessionEvent(threadId, "stdout", chunk, data);
  }
}
