import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import readline from "node:readline";

type UnknownRecord = Record<string, unknown>;

type JsonRpcId = number | string;

interface JsonRpcRequest {
  id: JsonRpcId;
  method: string;
  params?: unknown;
}

interface NormalizedCodexEvent {
  type: string;
  [key: string]: unknown;
}

interface PendingTurn {
  threadId: string;
  turnId: string;
  onEvent: (event: NormalizedCodexEvent) => void;
  resolve: () => void;
  reject: (error: Error) => void;
}

interface PendingAccountLogin {
  loginId: string | null;
  resolve: (result: { success: boolean; error?: string | null }) => void;
  reject: (error: Error) => void;
  timeoutId: ReturnType<typeof setTimeout> | null;
}

type InputItem =
  | { type: "text"; text: string }
  | { type: "local_image"; path: string }
  | { type: "skill"; name: string; path: string }
  | { type: "mention"; name: string; path: string };

export interface UserInputQuestionOption {
  label: string;
  description?: string;
}

export interface UserInputQuestion {
  id: string;
  header: string;
  question: string;
  options: UserInputQuestionOption[];
}

export interface CodexAppServerThreadOptions {
  model?: string;
  sandboxMode: "read-only" | "workspace-write" | "danger-full-access";
  modelReasoningEffort: "minimal" | "low" | "medium" | "high" | "xhigh";
  webSearchMode: "disabled" | "cached" | "live";
  networkAccessEnabled: boolean;
  approvalPolicy: "never" | "on-request" | "on-failure" | "untrusted";
  collaborationMode?: "coding" | "plan";
  workingDirectory: string;
}

interface CollaborationModeMaskRecord {
  name?: string;
  mode?: "default" | "plan" | null;
  model?: string | null;
  reasoning_effort?: "minimal" | "low" | "medium" | "high" | "xhigh" | null;
  developer_instructions?: string | null;
}

export interface CodexAppServerClientOptions {
  executablePath?: string;
  env: Record<string, string>;
  threadId: string;
}

export interface CodexAccountStatus {
  authenticated: boolean;
  requiresOpenaiAuth: boolean;
  accountType?: "apiKey" | "chatgpt";
  email?: string;
  planType?: string;
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

const statusToSnake = (value: string | null, fallback: string) => {
  if (!value) {
    return fallback;
  }
  return value
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/-/g, "_")
    .toLowerCase();
};

const mapKind = (kind: unknown): string => {
  const record = asRecord(kind);
  const fromObject = asString(record?.type);
  if (fromObject) {
    return fromObject.toLowerCase();
  }
  const direct = asString(kind);
  return (direct ?? "update").toLowerCase();
};

const mapThreadItem = (item: UnknownRecord): UnknownRecord | null => {
  const type = asString(item.type);
  const id = asString(item.id) ?? `item-${Date.now()}`;
  if (!type) {
    return null;
  }

  if (type === "agentMessage") {
    return {
      id,
      type: "agent_message",
      text: asString(item.text) ?? ""
    };
  }

  if (type === "reasoning") {
    const summary = Array.isArray(item.summary)
      ? item.summary.map((entry) => asString(entry)).filter((entry): entry is string => Boolean(entry))
      : [];
    const content = Array.isArray(item.content)
      ? item.content.map((entry) => asString(entry)).filter((entry): entry is string => Boolean(entry))
      : [];
    const text = [...summary, ...content].join("\n").trim();
    return {
      id,
      type: "reasoning",
      text
    };
  }

  if (type === "commandExecution") {
    return {
      id,
      type: "command_execution",
      command: asString(item.command) ?? "",
      aggregated_output: asString(item.aggregatedOutput) ?? "",
      exit_code: typeof item.exitCode === "number" ? item.exitCode : undefined,
      status: statusToSnake(asString(item.status), "in_progress")
    };
  }

  if (type === "fileChange") {
    const changes = Array.isArray(item.changes)
      ? item.changes
          .map((change) => asRecord(change))
          .filter((change): change is UnknownRecord => Boolean(change))
          .map((change) => ({
            path: asString(change.path) ?? "unknown",
            kind: mapKind(change.kind)
          }))
      : [];

    return {
      id,
      type: "file_change",
      status: statusToSnake(asString(item.status), "completed"),
      changes
    };
  }

  if (type === "mcpToolCall") {
    return {
      id,
      type: "mcp_tool_call",
      server: asString(item.server) ?? "",
      tool: asString(item.tool) ?? "",
      arguments: item.arguments,
      result: item.result,
      error: item.error,
      status: statusToSnake(asString(item.status), "in_progress")
    };
  }

  if (type === "webSearch") {
    return {
      id,
      type: "web_search",
      query: asString(item.query) ?? "web search"
    };
  }

  if (type === "plan") {
    const text = asString(item.text) ?? "";
    return {
      id,
      type: "todo_list",
      items: text
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => ({ text: line, completed: false }))
    };
  }

  return {
    id,
    type: type
  };
};

const mapSandboxPolicy = (options: CodexAppServerThreadOptions) => {
  if (options.sandboxMode === "danger-full-access") {
    return { type: "dangerFullAccess" };
  }
  if (options.sandboxMode === "read-only") {
    return {
      type: "readOnly",
      access: { type: "fullAccess" }
    };
  }
  return {
    type: "workspaceWrite",
    networkAccess: options.networkAccessEnabled,
    writableRoots: [options.workingDirectory]
  };
};

const mapCollaborationMode = (mode: CodexAppServerThreadOptions["collaborationMode"]): "default" | "plan" =>
  mode === "plan" ? "plan" : "default";

const mapPersonality = (mode: CodexAppServerThreadOptions["collaborationMode"]) =>
  mode === "plan" ? "pragmatic" : null;

const SUBTHREAD_PROPOSAL_INSTRUCTIONS = [
  "When a task is large and can be split into independent parallel workstreams, proactively emit one machine-readable proposal block.",
  "Prefer this for tasks expected to touch multiple files, multiple concerns, implementation + tests/docs, or any work that can be done concurrently.",
  "Do not emit this for clearly single-threaded or tiny tasks.",
  "Format exactly as XML-like tags with JSON content:",
  "<subthread_proposal_v1>{\"reason\":\"...\",\"parentGoal\":\"...\",\"tasks\":[{\"key\":\"...\",\"title\":\"...\",\"prompt\":\"...\",\"expectedOutput\":\"...\"}]}</subthread_proposal_v1>",
  "Use at most 8 tasks. Keep keys unique and lowercase. Do not emit this block for small tasks."
].join("\n");

export class CodexAppServerClient {
  private child: ChildProcessWithoutNullStreams | null = null;
  private readonly env: Record<string, string>;
  private readonly executablePath: string;
  private readonly localThreadId: string;
  private readonly pending = new Map<JsonRpcId, { resolve: (value: unknown) => void; reject: (error: Error) => void }>();
  private readonly pendingUserInput = new Map<
    string,
    {
      resolve: (answers: Record<string, { answers: string[] }>) => void;
      reject: (error: Error) => void;
    }
  >();
  private readonly agentMessageDrafts = new Map<string, string>();
  private readonly reasoningDrafts = new Map<string, string>();
  private collaborationModeMasks: CollaborationModeMaskRecord[] | null = null;
  private fallbackModelId: string | null = null;
  private nextId = 1;
  private closed = false;
  private pendingTurn: PendingTurn | null = null;
  private pendingAccountLogin: PendingAccountLogin | null = null;

  constructor(options: CodexAppServerClientOptions) {
    this.executablePath = options.executablePath || "codex";
    this.env = options.env;
    this.localThreadId = options.threadId;
  }

  async connect(): Promise<void> {
    if (this.child) {
      return;
    }

    this.child = spawn(this.executablePath, ["app-server", "--listen", "stdio://"], {
      env: this.env,
      stdio: "pipe"
    });

    this.child.on("error", (error) => {
      this.failAllPending(new Error(`Failed to start Codex app server: ${error.message}`));
    });
    this.child.on("exit", (code, signal) => {
      const details = signal ? `signal ${signal}` : `code ${code ?? 1}`;
      this.failAllPending(new Error(`Codex app server exited (${details}).`));
    });

    const rl = readline.createInterface({
      input: this.child.stdout,
      crlfDelay: Infinity
    });

    rl.on("line", (line) => {
      this.handleMessageLine(line);
    });

    await this.request("initialize", {
      clientInfo: {
        name: "code-app",
        version: "0.1.4"
      },
      capabilities: {
        experimentalApi: true
      }
    });
    this.notify("initialized", undefined);
  }

  async close(): Promise<void> {
    this.closed = true;
    if (!this.child) {
      return;
    }
    try {
      this.child.kill();
    } catch {
      // Ignore shutdown race.
    }
    this.child = null;
    this.pending.clear();
    if (this.pendingAccountLogin?.timeoutId) {
      clearTimeout(this.pendingAccountLogin.timeoutId);
    }
    this.pendingAccountLogin = null;
    this.pendingTurn = null;
  }

  async startOrResumeThread(
    existingProviderThreadId: string | null,
    options: CodexAppServerThreadOptions
  ): Promise<string> {
    const personality = mapPersonality(options.collaborationMode);
    const common = {
      cwd: options.workingDirectory,
      model: options.model ?? null,
      sandbox: options.sandboxMode,
      approvalPolicy: options.approvalPolicy,
      config: {
        features: {
          collaboration_modes: true
        }
      }
    };

    if (existingProviderThreadId) {
      const result = asRecord(
        await this.request("thread/resume", {
          ...common,
          threadId: existingProviderThreadId,
          personality
        })
      );
      const resumedId = asString(asRecord(result?.thread)?.id);
      if (!resumedId) {
        throw new Error("Codex app server did not return a thread id for thread/resume.");
      }
      return resumedId;
    }

    const result = asRecord(
      await this.request("thread/start", {
        ...common,
        personality,
        ephemeral: false
      })
    );
    const startedId = asString(asRecord(result?.thread)?.id);
    if (!startedId) {
      throw new Error("Codex app server did not return a thread id for thread/start.");
    }
    return startedId;
  }

  async runTurn(
    providerThreadId: string,
    input: InputItem[],
    options: CodexAppServerThreadOptions,
    onEvent: (event: NormalizedCodexEvent) => void,
    extras?: {
      outputSchema?: unknown;
    }
  ): Promise<void> {
    if (this.pendingTurn) {
      throw new Error("Cannot run a new turn while another turn is still in progress.");
    }

    const payload: Record<string, unknown> = {
      threadId: providerThreadId,
      input: input.map((entry) => {
        if (entry.type === "text") {
          return { type: "text", text: entry.text };
        }
        if (entry.type === "local_image") {
          return { type: "localImage", path: entry.path };
        }
        if (entry.type === "skill") {
          return { type: "skill", name: entry.name, path: entry.path };
        }
        return { type: "mention", name: entry.name, path: entry.path };
      }),
      approvalPolicy: options.approvalPolicy,
      model: options.model ?? null,
      effort: options.modelReasoningEffort,
      summary: "auto",
      sandboxPolicy: mapSandboxPolicy(options),
      personality: mapPersonality(options.collaborationMode),
      cwd: options.workingDirectory
    };
    const collaborationMode = await this.resolveCollaborationModePayload(options);
    if (collaborationMode) {
      payload.collaborationMode = collaborationMode;
    }
    if (typeof extras?.outputSchema !== "undefined") {
      payload.outputSchema = extras.outputSchema;
    }

    const response = asRecord(await this.request("turn/start", payload));
    const turnId = asString(asRecord(response?.turn)?.id);
    if (!turnId) {
      throw new Error("Codex app server did not return a turn id for turn/start.");
    }

    await new Promise<void>((resolve, reject) => {
      this.pendingTurn = {
        threadId: providerThreadId,
        turnId,
        onEvent,
        resolve: () => {
          this.pendingTurn = null;
          resolve();
        },
        reject: (error) => {
          this.pendingTurn = null;
          reject(error);
        }
      };
    });
  }

  async steerTurn(input: InputItem[]): Promise<void> {
    if (!this.pendingTurn) {
      throw new Error("Cannot steer: no active turn.");
    }

    await this.request("turn/steer", {
      threadId: this.pendingTurn.threadId,
      expectedTurnId: this.pendingTurn.turnId,
      input: input.map((entry) => {
        if (entry.type === "text") {
          return { type: "text", text: entry.text };
        }
        if (entry.type === "local_image") {
          return { type: "localImage", path: entry.path };
        }
        if (entry.type === "skill") {
          return { type: "skill", name: entry.name, path: entry.path };
        }
        return { type: "mention", name: entry.name, path: entry.path };
      })
    });
  }

  async submitUserInputAnswers(
    requestId: string,
    answers: Record<string, { answers: string[] }>
  ): Promise<void> {
    const pendingRequest = this.pendingUserInput.get(requestId);
    if (!pendingRequest) {
      throw new Error("Pending user-input request not found.");
    }
    this.pendingUserInput.delete(requestId);
    pendingRequest.resolve(answers);
  }

  async forkThread(providerThreadId: string, options: CodexAppServerThreadOptions): Promise<string> {
    const result = asRecord(
      await this.request("thread/fork", {
        threadId: providerThreadId,
        cwd: options.workingDirectory,
        model: options.model ?? null,
        sandbox: options.sandboxMode,
        approvalPolicy: options.approvalPolicy,
        config: {
          features: {
            collaboration_modes: true
          }
        }
      })
    );
    const forkedId = asString(asRecord(result?.thread)?.id);
    if (!forkedId) {
      throw new Error("Codex app server did not return a thread id for thread/fork.");
    }
    return forkedId;
  }

  async compactThread(providerThreadId: string): Promise<void> {
    await this.request("thread/compact/start", {
      threadId: providerThreadId
    });
  }

  async rollbackThread(providerThreadId: string, numTurns: number): Promise<void> {
    const safeNumTurns = Math.max(1, Math.floor(numTurns));
    await this.request("thread/rollback", {
      threadId: providerThreadId,
      numTurns: safeNumTurns
    });
  }

  async startReview(
    providerThreadId: string,
    target: Record<string, unknown>,
    delivery: "inline" | "detached" = "inline",
    onEvent: (event: NormalizedCodexEvent) => void
  ): Promise<{ reviewThreadId: string }> {
    if (this.pendingTurn) {
      throw new Error("Cannot start review while another turn is in progress.");
    }

    const response = asRecord(
      await this.request("review/start", {
        threadId: providerThreadId,
        target,
        delivery
      })
    );
    const reviewThreadId = asString(response?.reviewThreadId);
    const turnId = asString(asRecord(response?.turn)?.id);
    if (!turnId) {
      throw new Error("Codex app server did not return a turn id for review/start.");
    }

    await new Promise<void>((resolve, reject) => {
      this.pendingTurn = {
        threadId: reviewThreadId ?? providerThreadId,
        turnId,
        onEvent,
        resolve: () => {
          this.pendingTurn = null;
          resolve();
        },
        reject: (error) => {
          this.pendingTurn = null;
          reject(error);
        }
      };
    });

    return {
      reviewThreadId: reviewThreadId ?? providerThreadId
    };
  }

  async listSkills(cwd: string): Promise<unknown> {
    return this.request("skills/list", {
      cwds: [cwd],
      forceReload: true
    });
  }

  async setSkillEnabled(path: string, enabled: boolean): Promise<void> {
    await this.request("skills/config/write", {
      path,
      enabled
    });
  }

  async getAccountStatus(refreshToken = false): Promise<CodexAccountStatus> {
    const response = asRecord(
      await this.request("account/read", {
        refreshToken
      })
    );
    const requiresOpenaiAuth = Boolean(response?.requiresOpenaiAuth);
    const account = asRecord(response?.account);
    const accountType = asString(account?.type);

    return {
      authenticated: !requiresOpenaiAuth || Boolean(account),
      requiresOpenaiAuth,
      accountType: accountType === "apiKey" || accountType === "chatgpt" ? accountType : undefined,
      email: asString(account?.email) ?? undefined,
      planType: asString(account?.planType) ?? undefined
    };
  }

  async startChatGptLogin(): Promise<{ authUrl: string; loginId: string | null }> {
    const response = asRecord(
      await this.request("account/login/start", {
        type: "chatgpt"
      })
    );
    const authUrl = asString(response?.authUrl);
    if (!authUrl) {
      throw new Error("Codex app server did not return an auth URL for account/login/start.");
    }
    const loginId = asString(response?.loginId);
    return {
      authUrl,
      loginId
    };
  }

  async waitForLoginCompletion(loginId: string | null, timeoutMs = 180_000): Promise<{ success: boolean; error?: string | null }> {
    if (this.pendingAccountLogin) {
      throw new Error("Account login is already in progress.");
    }

    return new Promise<{ success: boolean; error?: string | null }>((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        if (!this.pendingAccountLogin) {
          return;
        }
        this.pendingAccountLogin = null;
        reject(new Error("Timed out waiting for Codex account login completion."));
      }, timeoutMs);

      this.pendingAccountLogin = {
        loginId,
        resolve,
        reject,
        timeoutId
      };
    });
  }

  private request(method: string, params: unknown): Promise<unknown> {
    const id = this.nextId++;
    const payload: JsonRpcRequest = {
      id,
      method,
      ...(params === undefined ? {} : { params })
    };

    return new Promise<unknown>((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.write(payload);
    });
  }

  private notify(method: string, params: unknown): void {
    this.write({
      method,
      ...(params === undefined ? {} : { params })
    });
  }

  private write(payload: unknown): void {
    if (!this.child?.stdin || this.closed) {
      return;
    }
    this.child.stdin.write(`${JSON.stringify(payload)}\n`);
  }

  private handleMessageLine(line: string) {
    const trimmed = line.trim();
    if (!trimmed) {
      return;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      return;
    }

    const message = asRecord(parsed);
    if (!message) {
      return;
    }

    const id = (typeof message.id === "string" || typeof message.id === "number" ? message.id : null) as JsonRpcId | null;
    const method = asString(message.method);

    if (id !== null && method) {
      void this.handleServerRequest(id, method, message.params);
      return;
    }

    if (id !== null && ("result" in message || "error" in message)) {
      const pending = this.pending.get(id);
      if (!pending) {
        return;
      }
      this.pending.delete(id);
      const error = asRecord(message.error);
      if (error) {
        pending.reject(
          new Error(
            asString(error.message) ||
              `JSON-RPC request failed (${typeof error.code === "number" ? error.code : "unknown"})`
          )
        );
        return;
      }
      pending.resolve(message.result);
      return;
    }

    if (method) {
      this.handleNotification(method, message.params);
    }
  }

  private async handleServerRequest(id: JsonRpcId, method: string, params: unknown): Promise<void> {
    const paramsRecord = asRecord(params) ?? {};
    try {
      if (method === "item/commandExecution/requestApproval" || method === "execCommandApproval") {
        this.write({
          id,
          result: {
            decision: "accept"
          }
        });
        return;
      }

      if (method === "item/fileChange/requestApproval" || method === "applyPatchApproval") {
        this.write({
          id,
          result: {
            decision: "accept"
          }
        });
        return;
      }

      if (method === "item/tool/requestUserInput" || method === "tool/requestUserInput") {
        const requestId = String(id);
        const questions = Array.isArray(paramsRecord.questions) ? paramsRecord.questions : [];
        const normalizedQuestions: UserInputQuestion[] = questions
          .map((question) => asRecord(question))
          .filter((question): question is UnknownRecord => Boolean(question))
          .map((question, index) => {
            const questionId = asString(question.id) ?? `question_${index + 1}`;
            const options = Array.isArray(question.options)
              ? question.options
                  .map((option) => asRecord(option))
                  .filter((option): option is UnknownRecord => Boolean(option))
                  .map((option) => ({
                    label: asString(option.label) ?? "Continue",
                    description: asString(option.description) ?? undefined
                  }))
              : [];
            return {
              id: questionId,
              header: asString(question.header) ?? `Question ${index + 1}`,
              question: asString(question.question) ?? "Please choose an option.",
              options
            };
          });

        const fallbackAnswers = Object.fromEntries(
          questions
            .map((question) => asRecord(question))
            .filter((question): question is UnknownRecord => Boolean(question))
            .map((question) => {
              const questionId = asString(question.id) ?? `question_${Date.now()}`;
              const options = Array.isArray(question.options) ? question.options : [];
              const firstOptionLabel =
                asString(asRecord(options[0])?.label) ?? "Continue";
              return [questionId, { answers: [firstOptionLabel] }];
            })
        );

        if (!this.pendingTurn) {
          this.write({
            id,
            result: {
              answers: fallbackAnswers
            }
          });
          return;
        }

        this.pendingTurn.onEvent({
          type: "user_input.requested",
          request_id: requestId,
          questions: normalizedQuestions
        });

        const answers = await new Promise<Record<string, { answers: string[] }>>((resolve, reject) => {
          this.pendingUserInput.set(requestId, { resolve, reject });
        }).catch(() => fallbackAnswers);

        this.write({
          id,
          result: {
            answers
          }
        });
        return;
      }

      if (method === "item/tool/call") {
        this.write({
          id,
          result: {
            success: false,
            contentItems: [
              {
                type: "inputText",
                text: "Dynamic tool calls are not supported in this desktop session."
              }
            ]
          }
        });
        return;
      }

      this.write({
        id,
        error: {
          code: -32601,
          message: `Unsupported server request method: ${method}`
        }
      });
    } catch (error) {
      this.write({
        id,
        error: {
          code: -32000,
          message: error instanceof Error ? error.message : String(error)
        }
      });
    }
  }

  private handleNotification(method: string, params: unknown): void {
    const paramsRecord = asRecord(params) ?? {};

    if (method === "account/login/completed" || method === "loginChatGptComplete") {
      const pendingLogin = this.pendingAccountLogin;
      if (!pendingLogin) {
        return;
      }

      const completedLoginId = asString(paramsRecord.loginId);
      if (pendingLogin.loginId && completedLoginId && pendingLogin.loginId !== completedLoginId) {
        return;
      }

      if (pendingLogin.timeoutId) {
        clearTimeout(pendingLogin.timeoutId);
      }
      this.pendingAccountLogin = null;

      const success = Boolean(paramsRecord.success);
      pendingLogin.resolve({
        success,
        error: asString(paramsRecord.error)
      });
      return;
    }

    const turn = this.pendingTurn;
    if (!turn) {
      return;
    }
    const notificationThreadId = asString(paramsRecord.threadId);
    if (notificationThreadId && notificationThreadId !== turn.threadId) {
      return;
    }

    if (method === "thread/started") {
      const startedId = asString(asRecord(paramsRecord.thread)?.id);
      turn.onEvent({
        type: "thread.started",
        thread_id: startedId ?? turn.threadId
      });
      return;
    }

    if (method === "turn/started") {
      const startedTurnId = asString(asRecord(paramsRecord.turn)?.id);
      if (startedTurnId && turn.turnId !== startedTurnId) {
        turn.turnId = startedTurnId;
      }
      turn.onEvent({
        type: "turn.started",
        turn_id: turn.turnId
      });
      return;
    }

    if (method === "item/started" || method === "item/completed") {
      const item = mapThreadItem(asRecord(paramsRecord.item) ?? {});
      if (!item) {
        return;
      }
      turn.onEvent({
        type: method === "item/started" ? "item.started" : "item.completed",
        item
      });
      return;
    }

    if (method === "item/agentMessage/delta") {
      const itemId = asString(paramsRecord.itemId);
      const delta = asString(paramsRecord.delta) ?? "";
      if (!itemId || !delta) {
        return;
      }
      const next = `${this.agentMessageDrafts.get(itemId) ?? ""}${delta}`;
      this.agentMessageDrafts.set(itemId, next);
      turn.onEvent({
        type: "item.updated",
        item: {
          id: itemId,
          type: "agent_message",
          text: next
        }
      });
      return;
    }

    if (
      method === "item/reasoning/textDelta" ||
      method === "item/reasoningSummary/textDelta" ||
      method === "reasoning/textDelta" ||
      method === "reasoningSummary/textDelta"
    ) {
      const itemId = asString(paramsRecord.itemId) ?? `reasoning-${Date.now()}`;
      const delta = asString(paramsRecord.delta) ?? "";
      const next = `${this.reasoningDrafts.get(itemId) ?? ""}${delta}`;
      this.reasoningDrafts.set(itemId, next);
      turn.onEvent({
        type: "item.updated",
        item: {
          id: itemId,
          type: "reasoning",
          text: next
        }
      });
      return;
    }

    if (method === "item/reasoningSummary/partAdded" || method === "reasoningSummary/partAdded") {
      const itemId = asString(paramsRecord.itemId) ?? `reasoning-summary-${Date.now()}`;
      const partText = asString(asRecord(paramsRecord.part)?.text) ?? "";
      const next = `${this.reasoningDrafts.get(itemId) ?? ""}${partText}`;
      this.reasoningDrafts.set(itemId, next);
      turn.onEvent({
        type: "item.updated",
        item: {
          id: itemId,
          type: "reasoning",
          text: next
        }
      });
      return;
    }

    if (method === "turn/completed") {
      const turnRecord = asRecord(paramsRecord.turn);
      const status = asString(turnRecord?.status);
      if (status === "failed") {
        const errorMessage = asString(asRecord(turnRecord?.error)?.message) ?? "Codex turn failed.";
        turn.onEvent({
          type: "turn.failed",
          error: { message: errorMessage }
        });
        turn.reject(new Error(errorMessage));
        return;
      }
      turn.onEvent({
        type: "turn.completed",
        usage: null
      });
      turn.resolve();
      return;
    }

    if (method === "error") {
      const errorMessage = asString(asRecord(paramsRecord.error)?.message) ?? "Codex turn failed.";
      const willRetry = Boolean(paramsRecord.willRetry);
      if (willRetry) {
        turn.onEvent({
          type: "error",
          message: errorMessage
        });
        return;
      }
      turn.onEvent({
        type: "turn.failed",
        error: { message: errorMessage }
      });
      turn.reject(new Error(errorMessage));
      return;
    }

    if (method === "turn/plan/updated") {
      const plan = Array.isArray(paramsRecord.plan) ? paramsRecord.plan : [];
      const todos = plan
        .map((entry) => asRecord(entry))
        .filter((entry): entry is UnknownRecord => Boolean(entry))
        .map((entry) => ({
          text: asString(entry.step) ?? "task",
          completed: asString(entry.status) === "completed"
        }));

      turn.onEvent({
        type: "item.updated",
        item: {
          id: `plan-${Date.now()}`,
          type: "todo_list",
          items: todos
        }
      });
    }
  }

  private async loadCollaborationModeMasks(): Promise<CollaborationModeMaskRecord[]> {
    if (this.collaborationModeMasks) {
      return this.collaborationModeMasks;
    }

    const response = asRecord(await this.request("collaborationMode/list", {}));
    const data = Array.isArray(response?.data) ? response.data : [];
    this.collaborationModeMasks = data
      .map((entry) => asRecord(entry))
      .filter((entry): entry is UnknownRecord => Boolean(entry))
      .map((entry) => ({
        name: asString(entry.name) ?? undefined,
        mode: asString(entry.mode) as CollaborationModeMaskRecord["mode"],
        model: asString(entry.model),
        reasoning_effort: asString(entry.reasoning_effort) as CollaborationModeMaskRecord["reasoning_effort"],
        developer_instructions: typeof entry.developer_instructions === "string" ? entry.developer_instructions : null
      }));
    return this.collaborationModeMasks;
  }

  private async resolveCollaborationModePayload(options: CodexAppServerThreadOptions): Promise<UnknownRecord | null> {
    const mode = mapCollaborationMode(options.collaborationMode);
    let preset: CollaborationModeMaskRecord | null = null;
    try {
      const masks = await this.loadCollaborationModeMasks();
      preset = masks.find((entry) => entry.mode === mode) ?? null;
    } catch {
      preset = null;
    }

    const model = options.model ?? preset?.model ?? (await this.resolveFallbackModelId());
    if (!model) {
      return null;
    }

    const reasoningEffort = options.modelReasoningEffort ?? preset?.reasoning_effort ?? null;
    return {
      mode,
      settings: {
        model,
        reasoning_effort: reasoningEffort,
        developer_instructions: SUBTHREAD_PROPOSAL_INSTRUCTIONS
      }
    };
  }

  private async resolveFallbackModelId(): Promise<string | null> {
    if (this.fallbackModelId) {
      return this.fallbackModelId;
    }

    try {
      const response = asRecord(await this.request("model/list", { includeHidden: false }));
      const data = Array.isArray(response?.data) ? response.data : [];
      for (const entry of data) {
        const row = asRecord(entry);
        const candidate = asString(row?.id) ?? asString(row?.model) ?? asString(row?.name);
        if (candidate) {
          this.fallbackModelId = candidate;
          return candidate;
        }
      }
    } catch {
      // Ignore lookup failures and let caller continue without collaboration mode payload.
    }

    return null;
  }

  private failAllPending(error: Error) {
    this.pending.forEach(({ reject }) => reject(error));
    this.pending.clear();
    if (this.pendingAccountLogin) {
      if (this.pendingAccountLogin.timeoutId) {
        clearTimeout(this.pendingAccountLogin.timeoutId);
      }
      this.pendingAccountLogin.reject(error);
      this.pendingAccountLogin = null;
    }
    this.pendingUserInput.forEach(({ reject }) => reject(error));
    this.pendingUserInput.clear();
    if (this.pendingTurn) {
      this.pendingTurn.reject(error);
      this.pendingTurn = null;
    }
  }
}
