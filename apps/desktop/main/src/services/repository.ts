import { appendFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import type Database from "better-sqlite3";
import type { AppSettings, InstallStatus, MessageEvent, Project, Provider, Session, Thread, ThreadStatus } from "@code-app/shared";
import { getThreadDataPath, type AppPaths } from "./paths";

const DEFAULT_SETTINGS: AppSettings = {
  permissionMode: "prompt_on_risk",
  binaryOverrides: {},
  envVars: {},
  codexDefaults: {
    sandboxMode: "workspace-write",
    modelReasoningEffort: "medium",
    webSearchMode: "cached",
    networkAccessEnabled: true,
    approvalPolicy: "on-request"
  }
};

interface ProjectRow {
  id: string;
  name: string;
  path: string;
  created_at: string;
  updated_at: string;
}

interface ThreadRow {
  id: string;
  project_id: string;
  title: string;
  provider: Provider;
  status: ThreadStatus;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
}

interface SessionRow {
  thread_id: string;
  pty_pid: number;
  cwd: string;
  env_hash: string;
  started_at: string;
  stopped_at: string | null;
}

interface MessageRow {
  id: string;
  thread_id: string;
  role: MessageEvent["role"];
  content: string;
  ts: string;
  stream_seq: number;
}

interface ThreadProviderStateRow {
  thread_id: string;
  provider: Provider;
  provider_thread_id: string;
  updated_at: string;
}

const mapProject = (row: ProjectRow): Project => ({
  id: row.id,
  name: row.name,
  path: row.path,
  createdAt: row.created_at,
  updatedAt: row.updated_at
});

const mapThread = (row: ThreadRow): Thread => ({
  id: row.id,
  projectId: row.project_id,
  title: row.title,
  provider: row.provider,
  status: row.status,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  archivedAt: row.archived_at ?? undefined
});

const mapSession = (row: SessionRow): Session => ({
  threadId: row.thread_id,
  ptyPid: row.pty_pid,
  cwd: row.cwd,
  envHash: row.env_hash,
  startedAt: row.started_at,
  stoppedAt: row.stopped_at ?? undefined
});

const mapMessage = (row: MessageRow): MessageEvent => ({
  id: row.id,
  threadId: row.thread_id,
  role: row.role,
  content: row.content,
  ts: row.ts,
  streamSeq: row.stream_seq
});

export class Repository {
  constructor(
    private readonly db: Database.Database,
    private readonly paths: AppPaths
  ) {}

  listProjects(): Project[] {
    const rows = this.db.prepare("SELECT * FROM projects ORDER BY updated_at DESC").all() as ProjectRow[];
    return rows.map(mapProject);
  }

  getProject(id: string): Project | null {
    const row = this.db.prepare("SELECT * FROM projects WHERE id = ?").get(id) as ProjectRow | undefined;
    return row ? mapProject(row) : null;
  }

  createProject(input: { name: string; path: string }): Project {
    const now = new Date().toISOString();
    const project: Project = {
      id: randomUUID(),
      name: input.name,
      path: input.path,
      createdAt: now,
      updatedAt: now
    };

    this.db
      .prepare(
        "INSERT INTO projects (id, name, path, created_at, updated_at) VALUES (@id, @name, @path, @createdAt, @updatedAt)"
      )
      .run(project);

    return project;
  }

  updateProject(input: { id: string; name?: string; path?: string }): Project {
    const existing = this.getProject(input.id);
    if (!existing) {
      throw new Error("Project not found");
    }

    const updated: Project = {
      ...existing,
      name: input.name ?? existing.name,
      path: input.path ?? existing.path,
      updatedAt: new Date().toISOString()
    };

    this.db
      .prepare("UPDATE projects SET name = @name, path = @path, updated_at = @updatedAt WHERE id = @id")
      .run(updated);

    return updated;
  }

  deleteProject(id: string): void {
    this.db.prepare("DELETE FROM projects WHERE id = ?").run(id);
  }

  listThreads(input?: { projectId?: string; includeArchived?: boolean }): Thread[] {
    const includeArchived = Boolean(input?.includeArchived);

    if (input?.projectId) {
      const rows = this.db
        .prepare(
          `SELECT * FROM threads
            WHERE project_id = @projectId
              AND (@includeArchived = 1 OR archived_at IS NULL)
            ORDER BY updated_at DESC`
        )
        .all({ projectId: input.projectId, includeArchived: includeArchived ? 1 : 0 }) as ThreadRow[];

      return rows.map(mapThread);
    }

    const rows = this.db
      .prepare(
        `SELECT * FROM threads
          WHERE (@includeArchived = 1 OR archived_at IS NULL)
          ORDER BY updated_at DESC`
      )
      .all({ includeArchived: includeArchived ? 1 : 0 }) as ThreadRow[];

    return rows.map(mapThread);
  }

  getThread(id: string): Thread | null {
    const row = this.db.prepare("SELECT * FROM threads WHERE id = ?").get(id) as ThreadRow | undefined;
    return row ? mapThread(row) : null;
  }

  createThread(input: { projectId: string; title: string; provider: Provider }): Thread {
    const now = new Date().toISOString();
    const thread: Thread = {
      id: randomUUID(),
      projectId: input.projectId,
      title: input.title,
      provider: input.provider,
      status: "created",
      createdAt: now,
      updatedAt: now
    };

    this.db
      .prepare(
        `INSERT INTO threads (id, project_id, title, provider, status, created_at, updated_at)
         VALUES (@id, @projectId, @title, @provider, @status, @createdAt, @updatedAt)`
      )
      .run(thread);

    return thread;
  }

  updateThread(input: { id: string; title?: string; provider?: Provider; status?: ThreadStatus }): Thread {
    const existing = this.getThread(input.id);
    if (!existing) {
      throw new Error("Thread not found");
    }

    const updated: Thread = {
      ...existing,
      title: input.title ?? existing.title,
      provider: input.provider ?? existing.provider,
      status: input.status ?? existing.status,
      updatedAt: new Date().toISOString()
    };

    this.db
      .prepare(
        "UPDATE threads SET title = @title, provider = @provider, status = @status, updated_at = @updatedAt WHERE id = @id"
      )
      .run(updated);

    return updated;
  }

  archiveThread(id: string, archived: boolean): Thread {
    const existing = this.getThread(id);
    if (!existing) {
      throw new Error("Thread not found");
    }

    const archivedAt = archived ? new Date().toISOString() : null;
    const updatedAt = new Date().toISOString();

    this.db
      .prepare("UPDATE threads SET archived_at = ?, updated_at = ? WHERE id = ?")
      .run(archivedAt, updatedAt, id);

    return this.getThread(id)!;
  }

  startSession(input: { threadId: string; ptyPid: number; cwd: string; envHash: string }): Session {
    const now = new Date().toISOString();

    this.db
      .prepare(
        `INSERT INTO sessions (thread_id, pty_pid, cwd, env_hash, started_at, stopped_at)
         VALUES (@threadId, @ptyPid, @cwd, @envHash, @startedAt, NULL)
         ON CONFLICT(thread_id)
         DO UPDATE SET
           pty_pid = excluded.pty_pid,
           cwd = excluded.cwd,
           env_hash = excluded.env_hash,
           started_at = excluded.started_at,
           stopped_at = NULL`
      )
      .run({ ...input, startedAt: now });

    this.updateThread({ id: input.threadId, status: "running" });

    return this.getSession(input.threadId)!;
  }

  stopSession(threadId: string): void {
    this.db.prepare("UPDATE sessions SET stopped_at = ? WHERE thread_id = ?").run(new Date().toISOString(), threadId);
    this.updateThread({ id: threadId, status: "stopped" });
  }

  setThreadExited(threadId: string): void {
    this.updateThread({ id: threadId, status: "exited" });
  }

  setThreadErrored(threadId: string): void {
    this.updateThread({ id: threadId, status: "error" });
  }

  getSession(threadId: string): Session | null {
    const row = this.db.prepare("SELECT * FROM sessions WHERE thread_id = ?").get(threadId) as SessionRow | undefined;
    return row ? mapSession(row) : null;
  }

  appendMessage(input: Omit<MessageEvent, "id" | "streamSeq" | "ts"> & { ts?: string; streamSeq?: number }): MessageEvent {
    const ts = input.ts ?? new Date().toISOString();
    const nextStreamSeq = input.streamSeq ?? this.nextStreamSequence(input.threadId);

    const event: MessageEvent = {
      id: randomUUID(),
      threadId: input.threadId,
      role: input.role,
      content: input.content,
      ts,
      streamSeq: nextStreamSeq
    };

    this.db
      .prepare(
        `INSERT INTO message_events (id, thread_id, role, content, ts, stream_seq)
         VALUES (@id, @threadId, @role, @content, @ts, @streamSeq)`
      )
      .run(event);

    const filePath = getThreadDataPath(this.paths.threadsDir, event.threadId).eventsPath;
    appendFileSync(filePath, `${JSON.stringify(event)}\n`, "utf8");

    return event;
  }

  listMessages(threadId: string): MessageEvent[] {
    const rows = this.db
      .prepare("SELECT * FROM message_events WHERE thread_id = ? ORDER BY stream_seq ASC")
      .all(threadId) as MessageRow[];

    return rows.map(mapMessage);
  }

  appendPtyLog(threadId: string, text: string): void {
    const filePath = getThreadDataPath(this.paths.threadsDir, threadId).ptyLogPath;
    appendFileSync(filePath, text, "utf8");
  }

  getThreadStoragePaths(threadId: string) {
    return getThreadDataPath(this.paths.threadsDir, threadId);
  }

  nextStreamSequence(threadId: string): number {
    const row = this.db
      .prepare("SELECT COALESCE(MAX(stream_seq), 0) AS max_seq FROM message_events WHERE thread_id = ?")
      .get(threadId) as { max_seq: number };

    return row.max_seq + 1;
  }

  getSettings(): AppSettings {
    const row = this.db.prepare("SELECT value FROM settings WHERE key = ?").get("app_settings") as { value: string } | undefined;
    if (!row) {
      return DEFAULT_SETTINGS;
    }

    try {
      const parsed = JSON.parse(row.value) as Partial<AppSettings>;
      return {
        ...DEFAULT_SETTINGS,
        ...parsed,
        binaryOverrides: {
          ...DEFAULT_SETTINGS.binaryOverrides,
          ...parsed.binaryOverrides
        },
        envVars: {
          ...DEFAULT_SETTINGS.envVars,
          ...parsed.envVars
        },
        codexDefaults: {
          ...DEFAULT_SETTINGS.codexDefaults,
          ...parsed.codexDefaults
        }
      };
    } catch {
      return DEFAULT_SETTINGS;
    }
  }

  setSettings(input: Partial<AppSettings>): AppSettings {
    const current = this.getSettings();
    const merged: AppSettings = {
      ...current,
      ...input,
      binaryOverrides: {
        ...current.binaryOverrides,
        ...input.binaryOverrides
      },
      envVars: {
        ...current.envVars,
        ...input.envVars
      },
      codexDefaults: {
        ...current.codexDefaults,
        ...input.codexDefaults
      }
    };

    this.db
      .prepare(
        `INSERT INTO settings (key, value, updated_at)
         VALUES (?, ?, ?)
         ON CONFLICT(key)
         DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
      )
      .run("app_settings", JSON.stringify(merged), new Date().toISOString());

    return merged;
  }

  saveInstallCheck(status: InstallStatus): void {
    this.db
      .prepare(
        `INSERT INTO install_checks (id, ts, node_ok, npm_ok, codex_ok, gemini_ok, payload)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        randomUUID(),
        new Date().toISOString(),
        status.nodeOk ? 1 : 0,
        status.npmOk ? 1 : 0,
        status.codexOk ? 1 : 0,
        status.geminiOk ? 1 : 0,
        JSON.stringify(status)
      );
  }

  savePermissionDecision(input: {
    threadId?: string;
    commandHash: string;
    riskLevel: "low" | "medium" | "high";
    approved: boolean;
  }): void {
    this.db
      .prepare(
        `INSERT INTO permission_decisions (id, thread_id, command_hash, risk_level, approved, ts)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(
        randomUUID(),
        input.threadId ?? null,
        input.commandHash,
        input.riskLevel,
        input.approved ? 1 : 0,
        new Date().toISOString()
      );
  }

  getProviderThreadId(threadId: string, provider: Provider): string | null {
    const row = this.db
      .prepare(
        "SELECT provider_thread_id FROM thread_provider_state WHERE thread_id = ? AND provider = ?"
      )
      .get(threadId, provider) as Pick<ThreadProviderStateRow, "provider_thread_id"> | undefined;

    return row?.provider_thread_id ?? null;
  }

  setProviderThreadId(threadId: string, provider: Provider, providerThreadId: string): void {
    this.db
      .prepare(
        `INSERT INTO thread_provider_state (thread_id, provider, provider_thread_id, updated_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(thread_id, provider)
         DO UPDATE SET provider_thread_id = excluded.provider_thread_id, updated_at = excluded.updated_at`
      )
      .run(threadId, provider, providerThreadId, new Date().toISOString());
  }

  clearProviderThreadId(threadId: string, provider: Provider): void {
    this.db
      .prepare("DELETE FROM thread_provider_state WHERE thread_id = ? AND provider = ?")
      .run(threadId, provider);
  }
}
