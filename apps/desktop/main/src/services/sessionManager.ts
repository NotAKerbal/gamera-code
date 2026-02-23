import { createHash } from "node:crypto";
import os from "node:os";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import * as pty from "node-pty";
import type {
  CodexThreadOptions,
  PromptAttachment,
  Session,
  SessionEvent,
  SessionEventType,
  Thread
} from "@code-app/shared";
import { PROVIDER_ADAPTERS } from "./providerAdapters";
import { Repository } from "./repository";
import { PermissionEngine } from "./permissionEngine";
import { loadCodexSdk, extractCodexResponseText } from "./codexSdk";
import { sanitizePtyOutput } from "../utils/stripAnsi";
import { createCommandRunner } from "../utils/commandRunner";

type UnknownRecord = Record<string, unknown>;
const commandRunner = createCommandRunner();

interface RunningPtySession {
  kind: "pty";
  ptyProcess: pty.IPty;
  threadId: string;
  cwd: string;
}

interface RunningCodexSession {
  kind: "codex_sdk";
  threadId: string;
  sdkThread: UnknownRecord;
  runQueue: Promise<void>;
  cwd: string;
  optionsKey: string;
}

interface StoredAttachment {
  name: string;
  mimeType: string;
  size: number;
  path: string;
}

type CodexInput = string | Array<{ type: "text"; text: string } | { type: "local_image"; path: string }>;

type RunningSession = RunningPtySession | RunningCodexSession;

interface SessionManagerDeps {
  repository: Repository;
  permissionEngine: PermissionEngine;
  emit: (event: SessionEvent) => void;
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

const hasAsyncIterator = (value: unknown): value is AsyncIterable<unknown> => {
  return Boolean(value && typeof (value as AsyncIterable<unknown>)[Symbol.asyncIterator] === "function");
};

const isCodexModelReasoningEffort = (value: unknown): value is NonNullable<CodexThreadOptions["modelReasoningEffort"]> =>
  value === "minimal" || value === "low" || value === "medium" || value === "high" || value === "xhigh";

const isCodexSandboxMode = (value: unknown): value is NonNullable<CodexThreadOptions["sandboxMode"]> =>
  value === "read-only" || value === "workspace-write" || value === "danger-full-access";

const isCodexWebSearchMode = (value: unknown): value is NonNullable<CodexThreadOptions["webSearchMode"]> =>
  value === "disabled" || value === "cached" || value === "live";

const isCodexApprovalPolicy = (value: unknown): value is NonNullable<CodexThreadOptions["approvalPolicy"]> =>
  value === "never" || value === "on-request" || value === "on-failure" || value === "untrusted";

const normalizeCodexThreadOptions = (
  cwd: string,
  options?: CodexThreadOptions
): Required<Pick<CodexThreadOptions, "sandboxMode" | "modelReasoningEffort" | "webSearchMode" | "networkAccessEnabled" | "approvalPolicy">> &
  Pick<CodexThreadOptions, "model"> & {
    workingDirectory: string;
    skipGitRepoCheck: true;
  } => {
  const model = asString(options?.model) ?? undefined;
  const sandboxMode = isCodexSandboxMode(options?.sandboxMode) ? options.sandboxMode : "workspace-write";
  const modelReasoningEffort = isCodexModelReasoningEffort(options?.modelReasoningEffort)
    ? options.modelReasoningEffort
    : "medium";
  const webSearchMode = isCodexWebSearchMode(options?.webSearchMode) ? options.webSearchMode : "cached";
  const networkAccessEnabled = typeof options?.networkAccessEnabled === "boolean" ? options.networkAccessEnabled : true;
  const approvalPolicy = isCodexApprovalPolicy(options?.approvalPolicy) ? options.approvalPolicy : "on-request";

  return {
    model,
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
    sandboxMode: options.sandboxMode,
    modelReasoningEffort: options.modelReasoningEffort,
    webSearchMode: options.webSearchMode,
    networkAccessEnabled: options.networkAccessEnabled,
    approvalPolicy: options.approvalPolicy,
    workingDirectory: options.workingDirectory
  });

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

const parseDataUrlImage = (dataUrl: string): { mimeType: string; data: Buffer } | null => {
  const match = /^data:(image\/[a-zA-Z0-9.+-]+);base64,([A-Za-z0-9+/=\s]+)$/.exec(dataUrl.trim());
  if (!match?.[1] || !match[2]) {
    return null;
  }

  try {
    const decoded = Buffer.from(match[2].replace(/\s+/g, ""), "base64");
    if (decoded.length === 0) {
      return null;
    }
    return {
      mimeType: match[1].toLowerCase(),
      data: decoded
    };
  } catch {
    return null;
  }
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

const ACTIVITY_EVENT_PREFIX = "__codeapp_activity__:";

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
  const blocked = new Set(["reasoning", "assistant_draft", "turn", "thread"]);
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

export class SessionManager {
  private readonly sessions = new Map<string, RunningSession>();
  private readonly gitRepoCache = new Map<string, boolean>();

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
      if (existingRuntime.kind === "codex_sdk" && existingRuntime.optionsKey === nextOptionsKey) {
        return existing;
      }

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

    if (running.kind === "codex_sdk") {
      this.deps.repository.stopSession(threadId);
      this.deps.permissionEngine.clearThreadApprovals(threadId);
      this.sessions.delete(threadId);
      this.emitSessionEvent(threadId, "status", "Codex SDK session stopped", {
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
    attachments?: PromptAttachment[]
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

    const running = this.sessions.get(threadId) ?? (await this.startOrResumeRuntime(thread, cwd, options));
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
      ts: now
    });

    if (running.kind === "pty") {
      running.ptyProcess.write(input.endsWith("\n") ? input : `${input}\n`);
      return true;
    }

    const codexInput = this.buildCodexInput(input, savedAttachments);
    running.runQueue = running.runQueue
      .then(() => this.runCodexPrompt(running, codexInput))
      .catch((error) => {
        this.deps.repository.setThreadErrored(threadId);
        this.emitSessionEvent(
          threadId,
          "stderr",
          `Codex SDK run failed: ${error instanceof Error ? error.message : String(error)}`,
          {
            provider: "codex",
            phase: "failed"
          }
        );
      });

    return true;
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

  private formatUserMessage(input: string, attachments: StoredAttachment[]) {
    const trimmed = input.trim();
    if (attachments.length === 0) {
      return trimmed;
    }

    const imageLines = attachments.map((attachment) => `- [image] ${attachment.name}`);
    if (!trimmed) {
      return `Attached images:\n${imageLines.join("\n")}`;
    }

    return `${trimmed}\n\nAttached images:\n${imageLines.join("\n")}`;
  }

  private buildCodexInput(input: string, attachments: StoredAttachment[]): CodexInput {
    const trimmed = input.trim();
    if (attachments.length === 0) {
      return trimmed;
    }

    const parts: Array<{ type: "text"; text: string } | { type: "local_image"; path: string }> = [];
    parts.push({
      type: "text",
      text: trimmed || "Please analyze the attached image(s)."
    });
    attachments.forEach((attachment) => {
      parts.push({
        type: "local_image",
        path: attachment.path
      });
    });

    return parts;
  }

  private persistPromptAttachments(threadId: string, attachments: PromptAttachment[]): StoredAttachment[] {
    if (attachments.length === 0) {
      return [];
    }

    const { threadDir } = this.deps.repository.getThreadStoragePaths(threadId);
    const attachDir = path.join(threadDir, "attachments");
    mkdirSync(attachDir, { recursive: true });

    return attachments
      .map((attachment, index) => {
        const name = asString(attachment.name) ?? `image-${index + 1}.png`;
        const parsed = parseDataUrlImage(attachment.dataUrl);
        if (!parsed) {
          return null;
        }

        const extension = extensionFromMimeType(parsed.mimeType);
        const safeBase = name.replace(/[^a-zA-Z0-9._-]/g, "_").replace(/\.[a-zA-Z0-9]+$/, "");
        const fileName = `${Date.now()}-${index + 1}-${safeBase || "image"}.${extension}`;
        const filePath = path.join(attachDir, fileName);
        writeFileSync(filePath, parsed.data);

        return {
          name,
          mimeType: parsed.mimeType,
          size: typeof attachment.size === "number" ? attachment.size : parsed.data.length,
          path: filePath
        } satisfies StoredAttachment;
      })
      .filter((attachment): attachment is StoredAttachment => Boolean(attachment));
  }

  private buildThreadEnv(threadId: string, projectId: string, provider: Thread["provider"]) {
    const settings = this.deps.repository.getSettings();
    const projectSettings = this.deps.repository.getProjectSettings(projectId);
    const env = {
      ...process.env,
      ...projectSettings.envVars,
      FORCE_COLOR: "0",
      NO_COLOR: "1",
      CLICOLOR: "0",
      TERM: "dumb",
      CODE_APP_THREAD_ID: threadId,
      CODE_APP_PROVIDER: provider
    } as Record<string, string>;

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
    const { Codex } = await loadCodexSdk();
    const codex = new Codex({ env });

    const existingProviderThreadId = this.deps.repository.getProviderThreadId(thread.id, "codex");

    const startThread = (codex as UnknownRecord).startThread as
      | ((options?: UnknownRecord) => UnknownRecord | Promise<UnknownRecord>)
      | undefined;
    const resumeThread = (codex as UnknownRecord).resumeThread as
      | ((threadId: string, options?: UnknownRecord) => UnknownRecord | Promise<UnknownRecord>)
      | undefined;

    if (!startThread || !resumeThread) {
      throw new Error("Codex SDK methods startThread/resumeThread are unavailable.");
    }

    const threadOptions = normalizeCodexThreadOptions(projectPath, options);
    const optionsKey = codexThreadOptionsKey(threadOptions);

    const sdkThread = existingProviderThreadId
      ? await resumeThread.call(codex, existingProviderThreadId, threadOptions)
      : await startThread.call(codex, threadOptions);

    const sdkThreadRecord = asRecord(sdkThread);
    if (!sdkThreadRecord) {
      throw new Error("Codex SDK failed to create thread.");
    }

    const sdkThreadId = this.readSdkThreadId(sdkThreadRecord);
    if (sdkThreadId) {
      this.deps.repository.setProviderThreadId(thread.id, "codex", sdkThreadId);
    }

    const envHash = createHash("sha1").update(JSON.stringify(env)).digest("hex");
    const session = this.deps.repository.startSession({
      threadId: thread.id,
      ptyPid: -1,
      cwd: projectPath,
      envHash
    });

    this.sessions.set(thread.id, {
      kind: "codex_sdk",
      threadId: thread.id,
      sdkThread: sdkThreadRecord,
      runQueue: Promise.resolve(),
      cwd: projectPath,
      optionsKey
    });

    return session;
  }

  private async runCodexPrompt(session: RunningCodexSession, input: CodexInput): Promise<void> {
    const runStreamed = session.sdkThread.runStreamed as
      | ((prompt: CodexInput) => Promise<{ events: AsyncIterable<unknown> }>)
      | undefined;
    const runMethod = session.sdkThread.run as ((prompt: CodexInput) => Promise<unknown>) | undefined;

    if (runStreamed) {
      await this.runCodexPromptStreamed(session, input, runStreamed);
      return;
    }

    if (!runMethod) {
      throw new Error("Codex SDK thread does not expose run() or runStreamed().");
    }

    this.emitSessionEvent(session.threadId, "progress", "Running Codex SDK...", {
      provider: "codex",
      phase: "running"
    });

    const runResult = await runMethod.call(session.sdkThread, input);
    const providerThreadId = this.readSdkThreadId(session.sdkThread);
    if (providerThreadId) {
      this.deps.repository.setProviderThreadId(session.threadId, "codex", providerThreadId);
    }

    const content = sanitizePtyOutput(extractCodexResponseText(runResult));
    if (content) {
      this.persistAssistantChunk(session.threadId, content, {
        provider: "codex",
        category: "assistant_message",
        final: true
      });
    } else {
      this.emitSessionEvent(session.threadId, "status", "Codex SDK returned no text output.", {
        provider: "codex",
        phase: "completed"
      });
    }
  }

  private async runCodexPromptStreamed(
    session: RunningCodexSession,
    input: CodexInput,
    runStreamed: (prompt: CodexInput) => Promise<{ events: AsyncIterable<unknown> }>
  ): Promise<void> {
    this.emitSessionEvent(session.threadId, "progress", "Thinking...", {
      provider: "codex",
      phase: "running",
      category: "turn"
    });

    const streamedTurn = await runStreamed.call(session.sdkThread, input);
    const events = asRecord(streamedTurn)?.events;
    if (!hasAsyncIterator(events)) {
      throw new Error("Codex SDK runStreamed() did not return an async event stream.");
    }

    const agentDrafts = new Map<string, string>();
    for await (const rawEvent of events) {
      await this.handleCodexStreamEvent(session.threadId, rawEvent, agentDrafts);
    }
  }

  private async handleCodexStreamEvent(threadId: string, rawEvent: unknown, agentDrafts: Map<string, string>) {
    const event = asRecord(rawEvent);
    const eventType = asString(event?.type) ?? "unknown";

    switch (eventType) {
      case "thread.started": {
        const sdkThreadId = asString(event?.thread_id);
        if (sdkThreadId) {
          this.deps.repository.setProviderThreadId(threadId, "codex", sdkThreadId);
        }
        this.emitSessionEvent(threadId, "progress", "Thinking...", {
          provider: "codex",
          category: "thread",
          eventType,
          threadId: sdkThreadId ?? undefined
        });
        return;
      }
      case "turn.started": {
        // Suppress noisy turn-start updates in renderer timeline.
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
      this.emitSessionEvent(threadId, "progress", "Thinking...", {
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

  private emitSessionEvent(
    threadId: string,
    type: SessionEventType,
    payload: string,
    data?: Record<string, unknown>
  ) {
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

  private readSdkThreadId(sdkThread: UnknownRecord): string | null {
    const maybeId = sdkThread.id ?? sdkThread.threadId;
    return typeof maybeId === "string" && maybeId.trim() ? maybeId : null;
  }
}
