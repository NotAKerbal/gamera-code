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
      default_dev_command_id TEXT,
      auto_start_dev_terminal INTEGER NOT NULL DEFAULT 1,
      switch_behavior_override TEXT,
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

    CREATE INDEX IF NOT EXISTS idx_threads_project_updated
      ON threads(project_id, updated_at DESC);

    CREATE INDEX IF NOT EXISTS idx_message_events_thread_stream
      ON message_events(thread_id, stream_seq);

    CREATE INDEX IF NOT EXISTS idx_sessions_thread_started
      ON sessions(thread_id, started_at DESC);

    CREATE INDEX IF NOT EXISTS idx_thread_provider_state_lookup
      ON thread_provider_state(thread_id, provider);

    CREATE INDEX IF NOT EXISTS idx_project_settings_updated
      ON project_settings(updated_at DESC);
  `);

  return db;
};
