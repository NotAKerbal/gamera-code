import Database from "better-sqlite3";

export const initializeDatabase = (dbPath: string) => {
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  db.exec(`
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      path TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS threads (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      parent_thread_id TEXT,
      title TEXT NOT NULL,
      provider TEXT NOT NULL,
      status TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      archived_at TEXT,
      FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS sessions (
      thread_id TEXT PRIMARY KEY,
      pty_pid INTEGER NOT NULL,
      cwd TEXT NOT NULL,
      env_hash TEXT NOT NULL,
      started_at TEXT NOT NULL,
      stopped_at TEXT,
      FOREIGN KEY(thread_id) REFERENCES threads(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS message_events (
      id TEXT PRIMARY KEY,
      thread_id TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      attachments_json TEXT,
      ts TEXT NOT NULL,
      stream_seq INTEGER NOT NULL,
      FOREIGN KEY(thread_id) REFERENCES threads(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS install_checks (
      id TEXT PRIMARY KEY,
      ts TEXT NOT NULL,
      node_ok INTEGER NOT NULL,
      npm_ok INTEGER NOT NULL,
      codex_ok INTEGER NOT NULL,
      gemini_ok INTEGER NOT NULL,
      payload TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS project_settings (
      project_id TEXT PRIMARY KEY,
      env_vars_json TEXT NOT NULL,
      dev_commands_json TEXT NOT NULL,
      web_links_json TEXT NOT NULL DEFAULT '[]',
      browser_enabled INTEGER NOT NULL DEFAULT 1,
      default_dev_command_id TEXT,
      auto_start_dev_terminal INTEGER NOT NULL DEFAULT 1,
      switch_behavior_override TEXT,
      subthread_policy_override TEXT,
      last_detected_preview_url TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS permission_decisions (
      id TEXT PRIMARY KEY,
      thread_id TEXT,
      command_hash TEXT NOT NULL,
      risk_level TEXT NOT NULL,
      approved INTEGER NOT NULL,
      ts TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS thread_provider_state (
      thread_id TEXT NOT NULL,
      provider TEXT NOT NULL,
      provider_thread_id TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY(thread_id, provider),
      FOREIGN KEY(thread_id) REFERENCES threads(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS thread_orchestration_runs (
      id TEXT PRIMARY KEY,
      parent_thread_id TEXT NOT NULL,
      proposal_json TEXT NOT NULL,
      policy TEXT NOT NULL,
      status TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(parent_thread_id) REFERENCES threads(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS thread_orchestration_children (
      id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL,
      task_key TEXT NOT NULL,
      child_thread_id TEXT,
      title TEXT NOT NULL,
      prompt TEXT NOT NULL,
      status TEXT NOT NULL,
      last_checkin_at TEXT,
      last_error TEXT,
      retry_of_child_id TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(run_id) REFERENCES thread_orchestration_runs(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_threads_project_updated
      ON threads(project_id, updated_at DESC);

    CREATE INDEX IF NOT EXISTS idx_message_events_thread_stream
      ON message_events(thread_id, stream_seq);

    CREATE INDEX IF NOT EXISTS idx_message_events_thread_role_ts
      ON message_events(thread_id, role, ts DESC);

    CREATE INDEX IF NOT EXISTS idx_sessions_thread_started
      ON sessions(thread_id, started_at DESC);

    CREATE INDEX IF NOT EXISTS idx_thread_provider_state_lookup
      ON thread_provider_state(thread_id, provider);

    CREATE INDEX IF NOT EXISTS idx_orchestration_runs_parent
      ON thread_orchestration_runs(parent_thread_id, updated_at DESC);

    CREATE INDEX IF NOT EXISTS idx_orchestration_children_run
      ON thread_orchestration_children(run_id, updated_at DESC);

    CREATE INDEX IF NOT EXISTS idx_project_settings_updated
      ON project_settings(updated_at DESC);
  `);

  const projectSettingsColumns = db
    .prepare("PRAGMA table_info(project_settings)")
    .all() as Array<{ name: string }>;
  const hasBrowserEnabledColumn = projectSettingsColumns.some((column) => column.name === "browser_enabled");
  if (!hasBrowserEnabledColumn) {
    db.exec("ALTER TABLE project_settings ADD COLUMN browser_enabled INTEGER NOT NULL DEFAULT 1;");
  }
  const hasWebLinksColumn = projectSettingsColumns.some((column) => column.name === "web_links_json");
  if (!hasWebLinksColumn) {
    db.exec("ALTER TABLE project_settings ADD COLUMN web_links_json TEXT NOT NULL DEFAULT '[]';");
  }
  const hasSubthreadPolicyOverride = projectSettingsColumns.some((column) => column.name === "subthread_policy_override");
  if (!hasSubthreadPolicyOverride) {
    db.exec("ALTER TABLE project_settings ADD COLUMN subthread_policy_override TEXT;");
  }
  const messageEventColumns = db
    .prepare("PRAGMA table_info(message_events)")
    .all() as Array<{ name: string }>;
  const hasAttachmentsJsonColumn = messageEventColumns.some((column) => column.name === "attachments_json");
  if (!hasAttachmentsJsonColumn) {
    db.exec("ALTER TABLE message_events ADD COLUMN attachments_json TEXT;");
  }

  const threadColumns = db
    .prepare("PRAGMA table_info(threads)")
    .all() as Array<{ name: string }>;
  const hasParentThreadIdColumn = threadColumns.some((column) => column.name === "parent_thread_id");
  if (!hasParentThreadIdColumn) {
    db.exec("ALTER TABLE threads ADD COLUMN parent_thread_id TEXT;");
  }

  return db;
};
