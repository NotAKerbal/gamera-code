import { appendFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import type Database from "better-sqlite3";
import { DEFAULT_HARNESS_OPTIONS } from "@code-app/shared";
import type {
  AppSettings,
  HarnessId,
  HarnessSettings,
  InstallStatus,
  MessageEvent,
  OrchestrationChild,
  OrchestrationRun,
  OrchestrationStatus,
  Project,
  ProjectDevCommand,
  ProjectSettings,
  ProjectWebLink,
  Provider,
  Session,
  SubthreadPolicy,
  SubthreadProposal,
  ThreadEventsPage,
  Thread,
  ThreadStatus
} from "@code-app/shared";
import { getThreadDataPath, type AppPaths } from "./paths";

const DEFAULT_DEV_COMMAND: ProjectDevCommand = {
  id: "default",
  name: "Dev Server",
  command: "npm run dev",
  autoStart: true
};

const DEFAULT_SETTINGS = {
  permissionMode: "prompt_on_risk",
  theme: "midnight",
  defaultHarnessId: "codex",
  harnessSettings: {
    codex: {
      defaults: DEFAULT_HARNESS_OPTIONS.codex
    },
    opencode: {
      defaults: DEFAULT_HARNESS_OPTIONS.opencode
    }
  },
  binaryOverrides: {},
  envVars: {},
  defaultProjectDirectory: "",
  autoRenameThreadTitles: true,
  showThreadSummaries: true,
  useTurtleSpinners: false,
  preferredSystemTerminalId: "",
  projectTerminalSwitchBehaviorDefault: "start_stop",
  subthreadPolicyDefault: "auto",
  codexDefaults: {
    model: "gpt-5.4",
    collaborationMode: "plan",
    sandboxMode: "workspace-write",
    modelReasoningEffort: "medium",
    webSearchMode: "cached",
    networkAccessEnabled: true,
    approvalPolicy: "on-request"
  }
} as AppSettings;

interface ProjectRow {
  id: string;
  workspace_id: string | null;
  name: string;
  path: string;
  created_at: string;
  updated_at: string;
}

interface WorkspaceRow {
  id: string;
  name: string;
  icon: string;
  color: string;
  created_at: string;
  updated_at: string;
}

interface WorkspaceModel {
  id: string;
  name: string;
  icon: string;
  color: string;
  createdAt: string;
  updatedAt: string;
}

type ProjectModel = Project & { workspaceId: string };
type ThreadWithMetadata = Thread & { color?: string; pinnedAt?: string };

const asProjectModel = (project: Project): ProjectModel => project as ProjectModel;

interface ThreadRow {
  id: string;
  project_id: string;
  parent_thread_id: string | null;
  title: string;
  color: string | null;
  provider: Provider;
  status: ThreadStatus;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
  pinned_at: string | null;
  last_message_ts?: string | null;
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
  attachments_json: string | null;
  ts: string;
  stream_seq: number;
}

interface ThreadProviderStateRow {
  thread_id: string;
  provider: Provider;
  provider_thread_id: string;
  updated_at: string;
}

interface ProjectSettingsRow {
  project_id: string;
  env_vars_json: string;
  dev_commands_json: string;
  web_links_json: string;
  browser_enabled: number;
  stay_running_actions: number;
  default_dev_command_id: string | null;
  auto_start_dev_terminal: number;
  subthread_policy_override: string | null;
  last_detected_preview_url: string | null;
  created_at: string;
  updated_at: string;
}

interface OrchestrationRunRow {
  id: string;
  parent_thread_id: string;
  proposal_json: string;
  policy: SubthreadPolicy;
  status: OrchestrationStatus;
  created_at: string;
  updated_at: string;
}

interface OrchestrationChildRow {
  id: string;
  run_id: string;
  task_key: string;
  child_thread_id: string | null;
  title: string;
  prompt: string;
  status: OrchestrationStatus;
  last_checkin_at: string | null;
  last_error: string | null;
  retry_of_child_id: string | null;
  created_at: string;
  updated_at: string;
}

const mapProject = (row: ProjectRow): Project => {
  const mapped: ProjectModel = {
    id: row.id,
    workspaceId: row.workspace_id ?? "",
    name: row.name,
    path: row.path,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
  return mapped as Project;
};

const mapWorkspace = (row: WorkspaceRow): WorkspaceModel => ({
  id: row.id,
  name: row.name,
  icon: row.icon,
  color: row.color,
  createdAt: row.created_at,
  updatedAt: row.updated_at
});

const mapThread = (row: ThreadRow): Thread => {
  const mapped: ThreadWithMetadata = {
    id: row.id,
    projectId: row.project_id,
    parentThreadId: row.parent_thread_id ?? undefined,
    title: row.title,
    harnessId: row.provider,
    provider: row.provider,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.last_message_ts ?? row.updated_at,
    archivedAt: row.archived_at ?? undefined
  };
  if (row.color) {
    mapped.color = row.color;
  }
  if (row.pinned_at) {
    mapped.pinnedAt = row.pinned_at;
  }
  return mapped as Thread;
};

const normalizeHarnessSettings = (partial: Partial<AppSettings> | null | undefined): HarnessSettings => {
  const input = partial ?? {};
  const next: HarnessSettings = {
    ...DEFAULT_SETTINGS.harnessSettings,
    ...input.harnessSettings
  };
  const codexCurrent = next.codex ?? {};
  const opencodeCurrent = next.opencode ?? {};

  next.codex = {
    ...(input.binaryOverrides?.codex ? { binaryOverride: input.binaryOverrides.codex } : {}),
    ...codexCurrent,
    defaults: {
      ...DEFAULT_SETTINGS.codexDefaults,
      ...(input.codexDefaults ?? {}),
      ...(codexCurrent.defaults ?? {})
    }
  };
    next.opencode = {
      ...(input.binaryOverrides?.opencode ? { binaryOverride: input.binaryOverrides.opencode } : {}),
      ...opencodeCurrent,
      defaults: {
        ...DEFAULT_HARNESS_OPTIONS.opencode,
        ...(opencodeCurrent.defaults ?? {})
      }
    };

  return next;
};

const deriveLegacyBinaryOverrides = (harnessSettings: HarnessSettings): AppSettings["binaryOverrides"] => ({
  ...DEFAULT_SETTINGS.binaryOverrides,
  codex: harnessSettings.codex?.binaryOverride,
  opencode: harnessSettings.opencode?.binaryOverride
});

const deriveLegacyCodexDefaults = (harnessSettings: HarnessSettings): AppSettings["codexDefaults"] => ({
  ...DEFAULT_SETTINGS.codexDefaults,
  ...(harnessSettings.codex?.defaults ?? {})
});

const normalizeAppSettings = (partial: Partial<AppSettings> | null | undefined): AppSettings => {
  const input = partial ?? {};
  const harnessSettings = normalizeHarnessSettings(input);

  return {
    ...DEFAULT_SETTINGS,
    ...input,
    harnessSettings,
    binaryOverrides: {
      ...DEFAULT_SETTINGS.binaryOverrides,
      ...input.binaryOverrides,
      ...deriveLegacyBinaryOverrides(harnessSettings)
    },
    envVars: {
      ...DEFAULT_SETTINGS.envVars,
      ...input.envVars
    },
    codexDefaults: {
      ...DEFAULT_SETTINGS.codexDefaults,
      ...input.codexDefaults,
      ...deriveLegacyCodexDefaults(harnessSettings)
    }
  };
};

const mapSession = (row: SessionRow): Session => ({
  threadId: row.thread_id,
  ptyPid: row.pty_pid,
  cwd: row.cwd,
  envHash: row.env_hash,
  startedAt: row.started_at,
  stoppedAt: row.stopped_at ?? undefined
});

const parseMessageAttachments = (value: unknown): MessageEvent["attachments"] => {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const attachments: NonNullable<MessageEvent["attachments"]> = [];
  value.forEach((entry) => {
    if (!entry || typeof entry !== "object") {
      return;
    }
    const row = entry as Record<string, unknown>;
    const name = typeof row.name === "string" ? row.name.trim() : "";
    const mimeType = typeof row.mimeType === "string" ? row.mimeType.trim() : "";
    const dataUrl = typeof row.dataUrl === "string" ? row.dataUrl.trim() : "";
    const size = typeof row.size === "number" && Number.isFinite(row.size) ? Math.max(0, row.size) : 0;
    if (!name || !mimeType || !dataUrl) {
      return;
    }
    if (!/^data:[^;,]+(?:;base64)?,/i.test(dataUrl)) {
      return;
    }
    attachments.push({
      name,
      mimeType,
      dataUrl,
      size
    });
  });

  return attachments.length > 0 ? attachments : undefined;
};

const mapMessage = (row: MessageRow): MessageEvent => ({
  id: row.id,
  threadId: row.thread_id,
  role: row.role,
  content: row.content,
  attachments: row.attachments_json
    ? parseMessageAttachments((() => {
        try {
          return JSON.parse(row.attachments_json);
        } catch {
          return null;
        }
      })())
    : undefined,
  ts: row.ts,
  streamSeq: row.stream_seq
});

const isSubthreadPolicy = (value: unknown): value is SubthreadPolicy =>
  value === "manual" || value === "ask" || value === "auto";

const parseEnvVars = (value: unknown): Record<string, string> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  const normalized: Record<string, string> = {};
  Object.entries(value as Record<string, unknown>).forEach(([key, raw]) => {
    const envKey = key.trim();
    if (!envKey || typeof raw !== "string") {
      return;
    }
    normalized[envKey] = raw;
  });
  return normalized;
};

const parseDevCommands = (value: unknown): ProjectDevCommand[] => {
  if (!Array.isArray(value)) {
    return [DEFAULT_DEV_COMMAND];
  }

  const parsed: ProjectDevCommand[] = [];
  for (const [index, item] of value.entries()) {
    if (!item || typeof item !== "object") {
      continue;
    }
    const row = item as Record<string, unknown>;
    const id = typeof row.id === "string" ? row.id.trim() : "";
    const name = typeof row.name === "string" ? row.name.trim() : "";
    const command = typeof row.command === "string" ? row.command.trim() : "";
    if (!id || !name || !command) {
      continue;
    }
    const autoStart = typeof row.autoStart === "boolean" ? row.autoStart : index === 0;
    const stayRunning = typeof row.stayRunning === "boolean" ? row.stayRunning : false;
    const hotkey = typeof row.hotkey === "string" ? row.hotkey.trim() : "";
    parsed.push({ id, name, command, autoStart, stayRunning, hotkey: hotkey || undefined });
  }

  if (parsed.length === 0) {
    return [DEFAULT_DEV_COMMAND];
  }

  return parsed.slice(0, 10);
};

const parseWebLinks = (value: unknown): ProjectWebLink[] => {
  if (!Array.isArray(value)) {
    return [];
  }
  const parsed: ProjectWebLink[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") {
      continue;
    }
    const row = item as Record<string, unknown>;
    const id = typeof row.id === "string" ? row.id.trim() : "";
    const name = typeof row.name === "string" ? row.name.trim() : "";
    const url = typeof row.url === "string" ? row.url.trim() : "";
    if (!id || !name || !url) {
      continue;
    }
    try {
      const parsedUrl = new URL(url);
      if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
        continue;
      }
      parsed.push({ id, name, url: parsedUrl.toString() });
    } catch {
      continue;
    }
  }
  return parsed.slice(0, 8);
};

const mapProjectSettings = (row: ProjectSettingsRow): ProjectSettings => {
  let envVars: Record<string, string> = {};
  let devCommands: ProjectDevCommand[] = [DEFAULT_DEV_COMMAND];
  let webLinks: ProjectWebLink[] = [];
  try {
    envVars = parseEnvVars(JSON.parse(row.env_vars_json));
  } catch {
    envVars = {};
  }
  try {
    devCommands = parseDevCommands(JSON.parse(row.dev_commands_json));
  } catch {
    devCommands = [DEFAULT_DEV_COMMAND];
  }
  try {
    webLinks = parseWebLinks(JSON.parse(row.web_links_json));
  } catch {
    webLinks = [];
  }
  const subthreadPolicyOverride = isSubthreadPolicy(row.subthread_policy_override)
    ? row.subthread_policy_override
    : undefined;

  return {
    projectId: row.project_id,
    envVars,
    devCommands,
    webLinks,
    browserEnabled: row.browser_enabled !== 0,
    defaultDevCommandId: row.default_dev_command_id ?? undefined,
    autoStartDevTerminal: row.auto_start_dev_terminal === 1,
    subthreadPolicyOverride,
    lastDetectedPreviewUrl: row.last_detected_preview_url ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
};

const mapOrchestrationRun = (row: OrchestrationRunRow): OrchestrationRun => {
  let proposal: SubthreadProposal = { reason: "", parentGoal: "", tasks: [] };
  try {
    proposal = JSON.parse(row.proposal_json) as SubthreadProposal;
  } catch {
    proposal = { reason: "", parentGoal: "", tasks: [] };
  }
  return {
    id: row.id,
    parentThreadId: row.parent_thread_id,
    proposal,
    policy: row.policy,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
};

const mapOrchestrationChild = (row: OrchestrationChildRow): OrchestrationChild => ({
  id: row.id,
  runId: row.run_id,
  taskKey: row.task_key,
  childThreadId: row.child_thread_id ?? undefined,
  title: row.title,
  prompt: row.prompt,
  status: row.status,
  lastCheckinAt: row.last_checkin_at ?? undefined,
  lastError: row.last_error ?? undefined,
  retryOfChildId: row.retry_of_child_id ?? undefined,
  createdAt: row.created_at,
  updatedAt: row.updated_at
});

export class Repository {
  private readonly streamSequenceCache = new Map<string, number>();
  private readonly fileWriteQueue = new Map<string, Promise<void>>();

  constructor(
    private readonly db: Database.Database,
    private readonly paths: AppPaths
  ) {}

  listProjects(): Project[] {
    const rows = this.db.prepare("SELECT * FROM projects ORDER BY updated_at DESC").all() as ProjectRow[];
    return rows.map(mapProject);
  }

  listWorkspaces(): WorkspaceModel[] {
    const rows = this.db.prepare("SELECT * FROM workspaces ORDER BY created_at ASC").all() as WorkspaceRow[];
    return rows.map(mapWorkspace);
  }

  getWorkspace(id: string): WorkspaceModel | null {
    const row = this.db.prepare("SELECT * FROM workspaces WHERE id = ?").get(id) as WorkspaceRow | undefined;
    return row ? mapWorkspace(row) : null;
  }

  createWorkspace(input: { name: string; icon: string; color: string; moveProjectIds?: string[] }): WorkspaceModel {
    const now = new Date().toISOString();
    const workspace: WorkspaceModel = {
      id: randomUUID(),
      name: input.name.trim(),
      icon: input.icon.trim(),
      color: input.color.trim(),
      createdAt: now,
      updatedAt: now
    };

    if (!workspace.name) {
      throw new Error("Workspace name is required");
    }
    if (!workspace.icon) {
      throw new Error("Workspace icon is required");
    }
    if (!workspace.color) {
      throw new Error("Workspace color is required");
    }

    const transaction = this.db.transaction(() => {
      this.db
        .prepare(
          "INSERT INTO workspaces (id, name, icon, color, created_at, updated_at) VALUES (@id, @name, @icon, @color, @createdAt, @updatedAt)"
        )
        .run(workspace);

      const moveProjectIds = (input.moveProjectIds ?? []).filter((projectId) => typeof projectId === "string" && projectId.trim());
      if (moveProjectIds.length > 0) {
        const updateProjectWorkspaceStmt = this.db.prepare(
          "UPDATE projects SET workspace_id = ?, updated_at = ? WHERE id = ?"
        );
        for (const projectId of moveProjectIds) {
          updateProjectWorkspaceStmt.run(workspace.id, now, projectId);
        }
      }
    });

    transaction();
    return workspace;
  }

  updateWorkspace(input: { id: string; name?: string; icon?: string; color?: string }): WorkspaceModel {
    const existing = this.getWorkspace(input.id);
    if (!existing) {
      throw new Error("Workspace not found");
    }
    const updated: WorkspaceModel = {
      ...existing,
      name: input.name?.trim() || existing.name,
      icon: input.icon?.trim() || existing.icon,
      color: input.color?.trim() || existing.color,
      updatedAt: new Date().toISOString()
    };

    this.db
      .prepare("UPDATE workspaces SET name = @name, icon = @icon, color = @color, updated_at = @updatedAt WHERE id = @id")
      .run(updated);

    return updated;
  }

  deleteWorkspace(id: string): void {
    const existing = this.getWorkspace(id);
    if (!existing) {
      throw new Error("Workspace not found");
    }

    const transaction = this.db.transaction(() => {
      const projectRows = this.db.prepare("SELECT id FROM projects WHERE workspace_id = ?").all(id) as Array<{ id: string }>;
      const deleteProject = this.db.prepare("DELETE FROM projects WHERE id = ?");
      for (const row of projectRows) {
        deleteProject.run(row.id);
      }
      this.db.prepare("DELETE FROM workspaces WHERE id = ?").run(id);

      const remainingWorkspace = this.db
        .prepare("SELECT id FROM workspaces ORDER BY created_at ASC LIMIT 1")
        .get() as { id: string } | undefined;
      if (!remainingWorkspace) {
        const now = new Date().toISOString();
        this.db
          .prepare(
            "INSERT INTO workspaces (id, name, icon, color, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)"
          )
          .run(randomUUID(), "Default", "grid", "#64748b", now, now);
      }
    });

    transaction();
  }

  getProject(id: string): Project | null {
    const row = this.db.prepare("SELECT * FROM projects WHERE id = ?").get(id) as ProjectRow | undefined;
    return row ? mapProject(row) : null;
  }

  createProject(input: { name: string; path: string }): Project {
    const now = new Date().toISOString();
    const defaultWorkspace =
      this.listWorkspaces()[0] ??
      this.createWorkspace({
        name: "Default",
        icon: "grid",
        color: "#64748b"
      });
    const project: ProjectModel = {
      id: randomUUID(),
      workspaceId: defaultWorkspace.id,
      name: input.name,
      path: input.path,
      createdAt: now,
      updatedAt: now
    };

    this.db
      .prepare(
        "INSERT INTO projects (id, workspace_id, name, path, created_at, updated_at) VALUES (@id, @workspaceId, @name, @path, @createdAt, @updatedAt)"
      )
      .run(project);

    return project as Project;
  }

  updateProject(input: { id: string; name?: string; path?: string; workspaceId?: string }): Project {
    const existing = this.getProject(input.id);
    if (!existing) {
      throw new Error("Project not found");
    }

    if (input.workspaceId && !this.getWorkspace(input.workspaceId)) {
      throw new Error("Workspace not found");
    }

    const existingModel = asProjectModel(existing);
    const updated: ProjectModel = {
      ...existingModel,
      workspaceId: input.workspaceId ?? existingModel.workspaceId,
      name: input.name ?? existing.name,
      path: input.path ?? existing.path,
      updatedAt: new Date().toISOString()
    };

    this.db
      .prepare(
        "UPDATE projects SET workspace_id = @workspaceId, name = @name, path = @path, updated_at = @updatedAt WHERE id = @id"
      )
      .run(updated);

    return updated as Project;
  }

  deleteProject(id: string): void {
    this.db.prepare("DELETE FROM projects WHERE id = ?").run(id);
  }

  listProjectSettings(): ProjectSettings[] {
    const rows = this.db
      .prepare("SELECT * FROM project_settings ORDER BY updated_at DESC")
      .all() as ProjectSettingsRow[];
    return rows.map(mapProjectSettings);
  }

  getProjectSettings(projectId: string): ProjectSettings {
    const project = this.getProject(projectId);
    if (!project) {
      throw new Error("Project not found");
    }

    const existing = this.db
      .prepare("SELECT * FROM project_settings WHERE project_id = ?")
      .get(projectId) as ProjectSettingsRow | undefined;
    if (existing) {
      return mapProjectSettings(existing);
    }

    const now = new Date().toISOString();
    const seeded: ProjectSettingsRow = {
      project_id: projectId,
      env_vars_json: JSON.stringify(this.getSettings().envVars),
      dev_commands_json: JSON.stringify([DEFAULT_DEV_COMMAND]),
      web_links_json: JSON.stringify([]),
      browser_enabled: 1,
      stay_running_actions: 0,
      default_dev_command_id: DEFAULT_DEV_COMMAND.id,
      auto_start_dev_terminal: 1,
      subthread_policy_override: null,
      last_detected_preview_url: null,
      created_at: now,
      updated_at: now
    };

    this.db
      .prepare(
        `INSERT INTO project_settings (
          project_id,
          env_vars_json,
          dev_commands_json,
          web_links_json,
          browser_enabled,
          stay_running_actions,
          default_dev_command_id,
          auto_start_dev_terminal,
          subthread_policy_override,
          last_detected_preview_url,
          created_at,
          updated_at
        ) VALUES (
          @project_id,
          @env_vars_json,
          @dev_commands_json,
          @web_links_json,
          @browser_enabled,
          @stay_running_actions,
          @default_dev_command_id,
          @auto_start_dev_terminal,
          @subthread_policy_override,
          @last_detected_preview_url,
          @created_at,
          @updated_at
        )`
      )
      .run(seeded);

    return mapProjectSettings(seeded);
  }

  setProjectSettings(input: {
    projectId: string;
    envVars?: Record<string, string>;
    devCommands?: ProjectDevCommand[];
    webLinks?: ProjectWebLink[];
    browserEnabled?: boolean;
    defaultDevCommandId?: string;
    autoStartDevTerminal?: boolean;
    subthreadPolicyOverride?: SubthreadPolicy;
    lastDetectedPreviewUrl?: string;
  }): ProjectSettings {
    const current = this.getProjectSettings(input.projectId);
    const nextDevCommands = input.devCommands
      ? parseDevCommands(input.devCommands)
      : current.devCommands;
    const envVars = input.envVars ? parseEnvVars(input.envVars) : current.envVars;
    const webLinks = input.webLinks ? parseWebLinks(input.webLinks) : current.webLinks;
    const fallbackDefaultCommandId = nextDevCommands[0]?.id;
    const requestedDefaultCommandId = input.defaultDevCommandId ?? current.defaultDevCommandId ?? fallbackDefaultCommandId;
    const validDefaultCommandId = nextDevCommands.some((cmd) => cmd.id === requestedDefaultCommandId)
      ? requestedDefaultCommandId
      : fallbackDefaultCommandId;
    const autoStartDevTerminal = input.autoStartDevTerminal ?? current.autoStartDevTerminal;
    const browserEnabled = input.browserEnabled ?? current.browserEnabled;

    const now = new Date().toISOString();
    this.db
      .prepare(
        `UPDATE project_settings
         SET env_vars_json = @env_vars_json,
             dev_commands_json = @dev_commands_json,
             web_links_json = @web_links_json,
             browser_enabled = @browser_enabled,
             default_dev_command_id = @default_dev_command_id,
             auto_start_dev_terminal = @auto_start_dev_terminal,
             subthread_policy_override = @subthread_policy_override,
             last_detected_preview_url = @last_detected_preview_url,
             updated_at = @updated_at
         WHERE project_id = @project_id`
      )
      .run({
        project_id: input.projectId,
        env_vars_json: JSON.stringify(envVars),
        dev_commands_json: JSON.stringify(nextDevCommands.slice(0, 10)),
        web_links_json: JSON.stringify(webLinks),
        browser_enabled: browserEnabled ? 1 : 0,
        default_dev_command_id: validDefaultCommandId ?? null,
        auto_start_dev_terminal: autoStartDevTerminal ? 1 : 0,
        subthread_policy_override: input.subthreadPolicyOverride ?? current.subthreadPolicyOverride ?? null,
        last_detected_preview_url: input.lastDetectedPreviewUrl ?? current.lastDetectedPreviewUrl ?? null,
        updated_at: now
      });

    return this.getProjectSettings(input.projectId);
  }

  setLastDetectedPreviewUrl(projectId: string, url: string): ProjectSettings {
    const normalized = url.trim();
    return this.setProjectSettings({
      projectId,
      lastDetectedPreviewUrl: normalized
    });
  }

  listThreads(input?: { projectId?: string; includeArchived?: boolean }): Thread[] {
    const includeArchived = Boolean(input?.includeArchived);

    if (input?.projectId) {
      const rows = this.db
        .prepare(
          `SELECT
              t.*,
              (
                SELECT m.ts
                FROM message_events m
                WHERE m.thread_id = t.id
                  AND m.role IN ('user', 'assistant')
                ORDER BY m.ts DESC
                LIMIT 1
              ) AS last_message_ts
            FROM threads t
            WHERE t.project_id = @projectId
              AND (@includeArchived = 1 OR t.archived_at IS NULL)
            ORDER BY COALESCE(last_message_ts, t.updated_at) DESC`
        )
        .all({ projectId: input.projectId, includeArchived: includeArchived ? 1 : 0 }) as ThreadRow[];

      return rows.map(mapThread);
    }

    const rows = this.db
      .prepare(
        `SELECT
            t.*,
            (
              SELECT m.ts
              FROM message_events m
              WHERE m.thread_id = t.id
                AND m.role IN ('user', 'assistant')
              ORDER BY m.ts DESC
              LIMIT 1
            ) AS last_message_ts
          FROM threads t
          WHERE (@includeArchived = 1 OR t.archived_at IS NULL)
          ORDER BY COALESCE(last_message_ts, t.updated_at) DESC`
      )
      .all({ includeArchived: includeArchived ? 1 : 0 }) as ThreadRow[];

    return rows.map(mapThread);
  }

  getThread(id: string): Thread | null {
    const row = this.db.prepare("SELECT * FROM threads WHERE id = ?").get(id) as ThreadRow | undefined;
    return row ? mapThread(row) : null;
  }

  createThread(input: { projectId: string; title: string; harnessId?: HarnessId; provider?: Provider; parentThreadId?: string }): Thread {
    const now = new Date().toISOString();
    const provider = input.harnessId ?? input.provider ?? "codex";
    const thread: Thread = {
      id: randomUUID(),
      projectId: input.projectId,
      parentThreadId: input.parentThreadId,
      title: input.title,
      harnessId: provider,
      provider,
      status: "created",
      createdAt: now,
      updatedAt: now
    };

    this.db
      .prepare(
        `INSERT INTO threads (id, project_id, parent_thread_id, title, provider, status, created_at, updated_at)
         VALUES (@id, @projectId, @parentThreadId, @title, @provider, @status, @createdAt, @updatedAt)`
      )
      .run(thread);

    return thread;
  }

  updateThread(input: {
    id: string;
    title?: string;
    color?: string;
    harnessId?: HarnessId;
    provider?: Provider;
    status?: ThreadStatus;
    pinned?: boolean;
  }): Thread {
    const existing = this.getThread(input.id);
    if (!existing) {
      throw new Error("Thread not found");
    }
    const existingWithMetadata = existing as ThreadWithMetadata;

    const normalizedColor =
      typeof input.color === "string" ? (input.color.trim() ? input.color.trim() : undefined) : existingWithMetadata.color;
    const now = new Date().toISOString();
    const pinnedAt =
      typeof input.pinned === "boolean"
        ? input.pinned
          ? existingWithMetadata.pinnedAt ?? now
          : undefined
        : existingWithMetadata.pinnedAt;
    const provider = input.harnessId ?? input.provider ?? existing.provider;
    const updated: ThreadWithMetadata = {
      ...existing,
      title: input.title ?? existing.title,
      color: normalizedColor,
      harnessId: provider,
      provider,
      status: input.status ?? existing.status,
      pinnedAt,
      updatedAt: now
    };

    this.db
      .prepare(
        "UPDATE threads SET title = @title, color = @color, provider = @provider, status = @status, pinned_at = @pinnedAt, updated_at = @updatedAt WHERE id = @id"
      )
      .run({
        ...updated,
        color: updated.color ?? null,
        pinnedAt: updated.pinnedAt ?? null
      });

    return updated as Thread;
  }

  archiveThread(id: string, archived: boolean): Thread {
    const existing = this.getThread(id);
    if (!existing) {
      throw new Error("Thread not found");
    }
    if (archived && (existing as ThreadWithMetadata).pinnedAt) {
      throw new Error("Pinned threads must be unpinned before archiving");
    }

    const archivedAt = archived ? new Date().toISOString() : null;
    const updatedAt = new Date().toISOString();

    this.db
      .prepare(
        `WITH RECURSIVE descendants(id) AS (
           SELECT id FROM threads WHERE id = ?
           UNION ALL
           SELECT t.id
           FROM threads t
           INNER JOIN descendants d ON t.parent_thread_id = d.id
         )
         UPDATE threads
         SET archived_at = ?, updated_at = ?
         WHERE id IN (SELECT id FROM descendants)`
      )
      .run(id, archivedAt, updatedAt);

    return this.getThread(id)!;
  }

  deleteThread(id: string): void {
    const existing = this.getThread(id);
    if (!existing) {
      throw new Error("Thread not found");
    }

    const descendantRows = this.db
      .prepare(
        `WITH RECURSIVE descendants(id) AS (
           SELECT id FROM threads WHERE id = ?
           UNION ALL
           SELECT t.id
           FROM threads t
           INNER JOIN descendants d ON t.parent_thread_id = d.id
         )
         SELECT id FROM descendants`
      )
      .all(id) as Array<{ id: string }>;
    const descendantIds = descendantRows.map((row) => row.id);

    const transaction = this.db.transaction(() => {
      this.db
        .prepare(
          `WITH RECURSIVE descendants(id) AS (
             SELECT id FROM threads WHERE id = ?
             UNION ALL
             SELECT t.id
             FROM threads t
             INNER JOIN descendants d ON t.parent_thread_id = d.id
           )
           DELETE FROM threads
           WHERE id IN (SELECT id FROM descendants)`
        )
        .run(id);
    });

    transaction();

    descendantIds.forEach((threadId) => {
      this.streamSequenceCache.delete(threadId);
    });
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
    const cachedMax = this.streamSequenceCache.get(input.threadId) ?? 0;
    if (nextStreamSeq > cachedMax) {
      this.streamSequenceCache.set(input.threadId, nextStreamSeq);
    }

    const event: MessageEvent = {
      id: randomUUID(),
      threadId: input.threadId,
      role: input.role,
      content: input.content,
      attachments: parseMessageAttachments(input.attachments ?? []),
      ts,
      streamSeq: nextStreamSeq
    };

    this.db
      .prepare(
        `INSERT INTO message_events (id, thread_id, role, content, attachments_json, ts, stream_seq)
         VALUES (@id, @threadId, @role, @content, @attachmentsJson, @ts, @streamSeq)`
      )
      .run({
        ...event,
        attachmentsJson: event.attachments ? JSON.stringify(event.attachments) : null
      });

    const filePath = getThreadDataPath(this.paths.threadsDir, event.threadId).eventsPath;
    this.enqueueFileAppend(filePath, `${JSON.stringify(event)}\n`);

    return event;
  }

  listMessages(input: { threadId: string; beforeStreamSeq?: number; userPromptCount?: number }): ThreadEventsPage {
    const { threadId } = input;
    const upperStreamSeq =
      typeof input.beforeStreamSeq === "number" && Number.isFinite(input.beforeStreamSeq)
        ? Math.max(Math.floor(input.beforeStreamSeq) - 1, 0)
        : Number.MAX_SAFE_INTEGER;
    const userPromptCountRaw =
      typeof input.userPromptCount === "number" && Number.isFinite(input.userPromptCount)
        ? Math.floor(input.userPromptCount)
        : 2;
    const userPromptCount = Math.max(1, Math.min(userPromptCountRaw, 8));

    if (upperStreamSeq <= 0) {
      return { events: [], hasMore: false };
    }

    const anchorUserRow = this.db
      .prepare(
        `SELECT stream_seq
         FROM message_events
         WHERE thread_id = @threadId
           AND role = 'user'
           AND stream_seq <= @upperStreamSeq
         ORDER BY stream_seq DESC
         LIMIT 1 OFFSET @offset`
      )
      .get({
        threadId,
        upperStreamSeq,
        offset: userPromptCount - 1
      }) as Pick<MessageRow, "stream_seq"> | undefined;

    const firstRow = this.db
      .prepare(
        `SELECT stream_seq
         FROM message_events
         WHERE thread_id = @threadId
           AND stream_seq <= @upperStreamSeq
         ORDER BY stream_seq ASC
         LIMIT 1`
      )
      .get({ threadId, upperStreamSeq }) as Pick<MessageRow, "stream_seq"> | undefined;

    if (!firstRow) {
      return { events: [], hasMore: false };
    }

    const lowerStreamSeq = anchorUserRow?.stream_seq ?? firstRow.stream_seq;

    const rows = this.db
      .prepare(
        `SELECT *
         FROM message_events
         WHERE thread_id = @threadId
           AND stream_seq BETWEEN @lowerStreamSeq AND @upperStreamSeq
         ORDER BY stream_seq ASC`
      )
      .all({
        threadId,
        lowerStreamSeq,
        upperStreamSeq
      }) as MessageRow[];

    if (rows.length === 0) {
      return { events: [], hasMore: false };
    }

    const firstLoadedStreamSeq = rows[0]!.stream_seq;
    const hasMoreRow = this.db
      .prepare(
        `SELECT 1 AS has_more
         FROM message_events
         WHERE thread_id = @threadId
           AND stream_seq < @firstLoadedStreamSeq
         LIMIT 1`
      )
      .get({ threadId, firstLoadedStreamSeq }) as { has_more: number } | undefined;
    const hasMore = Boolean(hasMoreRow);

    return {
      events: rows.map(mapMessage),
      hasMore,
      nextBeforeStreamSeq: hasMore ? firstLoadedStreamSeq : undefined
    };
  }

  listMessagesForFork(input: { threadId: string; upToStreamSeq?: number }): MessageEvent[] {
    const threadId = input.threadId.trim();
    if (!threadId) {
      return [];
    }

    const rows =
      typeof input.upToStreamSeq === "number" && Number.isFinite(input.upToStreamSeq)
        ? (this.db
            .prepare(
              `SELECT *
               FROM message_events
               WHERE thread_id = @threadId
                 AND stream_seq <= @upToStreamSeq
               ORDER BY stream_seq ASC`
            )
            .all({
              threadId,
              upToStreamSeq: Math.max(0, Math.floor(input.upToStreamSeq))
            }) as MessageRow[])
        : (this.db
            .prepare(
              `SELECT *
               FROM message_events
               WHERE thread_id = ?
               ORDER BY stream_seq ASC`
            )
            .all(threadId) as MessageRow[]);

    return rows.map(mapMessage);
  }

  appendPtyLog(threadId: string, text: string): void {
    const filePath = getThreadDataPath(this.paths.threadsDir, threadId).ptyLogPath;
    this.enqueueFileAppend(filePath, text);
  }

  async flushPendingFileWrites(): Promise<void> {
    const pending = Array.from(this.fileWriteQueue.values());
    if (pending.length === 0) {
      return;
    }
    await Promise.allSettled(pending);
  }

  getThreadStoragePaths(threadId: string) {
    return getThreadDataPath(this.paths.threadsDir, threadId);
  }

  nextStreamSequence(threadId: string): number {
    const cached = this.streamSequenceCache.get(threadId);
    if (cached !== undefined) {
      return cached + 1;
    }

    const row = this.db
      .prepare("SELECT COALESCE(MAX(stream_seq), 0) AS max_seq FROM message_events WHERE thread_id = ?")
      .get(threadId) as { max_seq: number };
    this.streamSequenceCache.set(threadId, row.max_seq);

    return row.max_seq + 1;
  }

  getSettings(): AppSettings {
    const row = this.db.prepare("SELECT value FROM settings WHERE key = ?").get("app_settings") as { value: string } | undefined;
    if (!row) {
      return DEFAULT_SETTINGS;
    }

    try {
      const parsed = JSON.parse(row.value) as Partial<AppSettings>;
      return normalizeAppSettings(parsed);
    } catch {
      return DEFAULT_SETTINGS;
    }
  }

  setSettings(input: Partial<AppSettings>): AppSettings {
    const current = this.getSettings();
    const merged = normalizeAppSettings({
      ...current,
      ...input,
      harnessSettings: {
        ...current.harnessSettings,
        ...input.harnessSettings
      },
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
    });

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

  createOrchestrationRun(input: {
    parentThreadId: string;
    proposal: SubthreadProposal;
    policy: SubthreadPolicy;
    status?: OrchestrationStatus;
  }): OrchestrationRun {
    const now = new Date().toISOString();
    const row: OrchestrationRunRow = {
      id: randomUUID(),
      parent_thread_id: input.parentThreadId,
      proposal_json: JSON.stringify(input.proposal),
      policy: input.policy,
      status: input.status ?? "proposed",
      created_at: now,
      updated_at: now
    };
    this.db
      .prepare(
        `INSERT INTO thread_orchestration_runs (id, parent_thread_id, proposal_json, policy, status, created_at, updated_at)
         VALUES (@id, @parent_thread_id, @proposal_json, @policy, @status, @created_at, @updated_at)`
      )
      .run(row);
    return mapOrchestrationRun(row);
  }

  listOrchestrationRuns(parentThreadId: string): OrchestrationRun[] {
    const rows = this.db
      .prepare("SELECT * FROM thread_orchestration_runs WHERE parent_thread_id = ? ORDER BY updated_at DESC")
      .all(parentThreadId) as OrchestrationRunRow[];
    return rows.map(mapOrchestrationRun);
  }

  getOrchestrationRun(runId: string): OrchestrationRun | null {
    const row = this.db
      .prepare("SELECT * FROM thread_orchestration_runs WHERE id = ?")
      .get(runId) as OrchestrationRunRow | undefined;
    return row ? mapOrchestrationRun(row) : null;
  }

  updateOrchestrationRunStatus(runId: string, status: OrchestrationStatus): OrchestrationRun {
    this.db
      .prepare("UPDATE thread_orchestration_runs SET status = ?, updated_at = ? WHERE id = ?")
      .run(status, new Date().toISOString(), runId);
    const row = this.getOrchestrationRun(runId);
    if (!row) {
      throw new Error("Orchestration run not found");
    }
    return row;
  }

  createOrchestrationChild(input: {
    runId: string;
    taskKey: string;
    title: string;
    prompt: string;
    status?: OrchestrationStatus;
    childThreadId?: string;
    retryOfChildId?: string;
  }): OrchestrationChild {
    const now = new Date().toISOString();
    const row: OrchestrationChildRow = {
      id: randomUUID(),
      run_id: input.runId,
      task_key: input.taskKey,
      child_thread_id: input.childThreadId ?? null,
      title: input.title,
      prompt: input.prompt,
      status: input.status ?? "proposed",
      last_checkin_at: null,
      last_error: null,
      retry_of_child_id: input.retryOfChildId ?? null,
      created_at: now,
      updated_at: now
    };
    this.db
      .prepare(
        `INSERT INTO thread_orchestration_children (
          id, run_id, task_key, child_thread_id, title, prompt, status, last_checkin_at, last_error, retry_of_child_id, created_at, updated_at
        ) VALUES (
          @id, @run_id, @task_key, @child_thread_id, @title, @prompt, @status, @last_checkin_at, @last_error, @retry_of_child_id, @created_at, @updated_at
        )`
      )
      .run(row);
    return mapOrchestrationChild(row);
  }

  listOrchestrationChildren(runId: string): OrchestrationChild[] {
    const rows = this.db
      .prepare("SELECT * FROM thread_orchestration_children WHERE run_id = ? ORDER BY created_at ASC")
      .all(runId) as OrchestrationChildRow[];
    return rows.map(mapOrchestrationChild);
  }

  getOrchestrationChildById(childRowId: string): OrchestrationChild | null {
    const row = this.db
      .prepare("SELECT * FROM thread_orchestration_children WHERE id = ?")
      .get(childRowId) as OrchestrationChildRow | undefined;
    return row ? mapOrchestrationChild(row) : null;
  }

  getOrchestrationChildByThreadId(childThreadId: string): OrchestrationChild | null {
    const row = this.db
      .prepare("SELECT * FROM thread_orchestration_children WHERE child_thread_id = ?")
      .get(childThreadId) as OrchestrationChildRow | undefined;
    return row ? mapOrchestrationChild(row) : null;
  }

  updateOrchestrationChild(input: {
    id: string;
    status?: OrchestrationStatus;
    childThreadId?: string;
    lastCheckinAt?: string;
    lastError?: string;
  }): OrchestrationChild {
    const existing = this.getOrchestrationChildById(input.id);
    if (!existing) {
      throw new Error("Orchestration child not found");
    }
    const updatedAt = new Date().toISOString();
    this.db
      .prepare(
        `UPDATE thread_orchestration_children
         SET status = ?,
             child_thread_id = ?,
             last_checkin_at = ?,
             last_error = ?,
             updated_at = ?
         WHERE id = ?`
      )
      .run(
        input.status ?? existing.status,
        input.childThreadId ?? existing.childThreadId ?? null,
        input.lastCheckinAt ?? existing.lastCheckinAt ?? null,
        input.lastError ?? existing.lastError ?? null,
        updatedAt,
        input.id
      );
    return this.getOrchestrationChildById(input.id)!;
  }

  private enqueueFileAppend(filePath: string, text: string): void {
    const current = this.fileWriteQueue.get(filePath) ?? Promise.resolve();
    const next = current
      .catch(() => undefined)
      .then(async () => {
        await appendFile(filePath, text, "utf8");
      });
    this.fileWriteQueue.set(filePath, next);
    void next.catch(() => undefined);
    void next.finally(() => {
      if (this.fileWriteQueue.get(filePath) === next) {
        this.fileWriteQueue.delete(filePath);
      }
    });
  }
}
