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

type InputItem = { type: "text"; text: string } | { type: "local_image"; path: string };

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

export interface CodexAppServerClientOptions {
  executablePath?: string;
  env: Record<string, string>;
  threadId: string;
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

export class CodexAppServerClient {
  private child: ChildProcessWithoutNullStreams | null = null;
  private readonly env: Record<string, string>;
  private readonly executablePath: string;
  private readonly localThreadId: string;
  private readonly pending = new Map<JsonRpcId, { resolve: (value: unknown) => void; reject: (error: Error) => void }>();
  private readonly agentMessageDrafts = new Map<string, string>();
  private nextId = 1;
  private closed = false;
  private pendingTurn: PendingTurn | null = null;

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
    this.pendingTurn = null;
  }

  async startOrResumeThread(
    existingProviderThreadId: string | null,
    options: CodexAppServerThreadOptions
  ): Promise<string> {
    const common = {
      cwd: options.workingDirectory,
      model: options.model ?? null,
      sandbox: options.sandboxMode,
      approvalPolicy: options.approvalPolicy
    };

    if (existingProviderThreadId) {
      const result = asRecord(
        await this.request("thread/resume", {
          ...common,
          threadId: existingProviderThreadId,
          personality: options.collaborationMode === "plan" ? "pragmatic" : null
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
        personality: options.collaborationMode === "plan" ? "pragmatic" : null,
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
    onEvent: (event: NormalizedCodexEvent) => void
  ): Promise<void> {
    if (this.pendingTurn) {
      throw new Error("Cannot run a new turn while another turn is still in progress.");
    }

    const response = asRecord(
      await this.request("turn/start", {
        threadId: providerThreadId,
        input: input.map((entry) => {
          if (entry.type === "text") {
            return { type: "text", text: entry.text };
          }
          return { type: "localImage", path: entry.path };
        }),
        approvalPolicy: options.approvalPolicy,
        model: options.model ?? null,
        effort: options.modelReasoningEffort,
        summary: "auto",
        sandboxPolicy: mapSandboxPolicy(options),
        cwd: options.workingDirectory
      })
    );
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

      if (method === "item/tool/requestUserInput") {
        const questions = Array.isArray(paramsRecord.questions) ? paramsRecord.questions : [];
        const answers = Object.fromEntries(
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
    const turn = this.pendingTurn;
    if (!turn) {
      return;
    }

    const paramsRecord = asRecord(params) ?? {};
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
      turn.onEvent({
        type: "turn.started"
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

    if (method === "item/reasoning/textDelta") {
      const itemId = asString(paramsRecord.itemId) ?? `reasoning-${Date.now()}`;
      const delta = asString(paramsRecord.delta) ?? "";
      turn.onEvent({
        type: "item.updated",
        item: {
          id: itemId,
          type: "reasoning",
          text: delta
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

  private failAllPending(error: Error) {
    this.pending.forEach(({ reject }) => reject(error));
    this.pending.clear();
    if (this.pendingTurn) {
      this.pendingTurn.reject(error);
      this.pendingTurn = null;
    }
  }
}
