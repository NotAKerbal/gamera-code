import { mkdtempSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { initializeDatabase } from "../services/database";
import { createAppPaths } from "../services/paths";
import { Repository } from "../services/repository";

const require = createRequire(import.meta.url);
const hasNodeBinding = (() => {
  try {
    const Database = require("better-sqlite3");
    const db = new Database(":memory:");
    db.close();
    return true;
  } catch {
    return false;
  }
})();

const describeRepository = hasNodeBinding ? describe : describe.skip;

describeRepository("Repository", () => {
  it("creates and retrieves projects and threads", () => {
    const dir = mkdtempSync(join(tmpdir(), "code-app-test-"));
    const paths = createAppPaths(dir);
    const db = initializeDatabase(paths.dbPath);
    const repo = new Repository(db, paths);

    const project = repo.createProject({ name: "repo", path: "/tmp/repo" });
    const thread = repo.createThread({ projectId: project.id, title: "hello", provider: "codex" });

    expect(repo.listProjects()).toHaveLength(1);
    expect(repo.listThreads({ projectId: project.id })).toHaveLength(1);
    expect(repo.getThread(thread.id)?.title).toBe("hello");
  });

  it("stores and returns settings", () => {
    const dir = mkdtempSync(join(tmpdir(), "code-app-settings-"));
    const paths = createAppPaths(dir);
    const db = initializeDatabase(paths.dbPath);
    const repo = new Repository(db, paths);

    repo.setSettings({
      permissionMode: "always_ask",
      binaryOverrides: { codex: "/x/codex" },
      envVars: { FOO: "bar" }
    });

    const settings = repo.getSettings();
    expect(settings.permissionMode).toBe("always_ask");
    expect(settings.binaryOverrides.codex).toBe("/x/codex");
    expect(settings.envVars.FOO).toBe("bar");
    expect(settings.codexDefaults.sandboxMode).toBe("workspace-write");
  });

  it("persists provider thread ids", () => {
    const dir = mkdtempSync(join(tmpdir(), "code-app-provider-state-"));
    const paths = createAppPaths(dir);
    const db = initializeDatabase(paths.dbPath);
    const repo = new Repository(db, paths);

    const project = repo.createProject({ name: "repo", path: "/tmp/repo-provider-state" });
    const thread = repo.createThread({ projectId: project.id, title: "sdk", provider: "codex" });

    expect(repo.getProviderThreadId(thread.id, "codex")).toBeNull();

    repo.setProviderThreadId(thread.id, "codex", "sdk-thread-123");
    expect(repo.getProviderThreadId(thread.id, "codex")).toBe("sdk-thread-123");

    repo.clearProviderThreadId(thread.id, "codex");
    expect(repo.getProviderThreadId(thread.id, "codex")).toBeNull();
  });

  it("orders threads by latest user/assistant message and ignores system messages", () => {
    const dir = mkdtempSync(join(tmpdir(), "code-app-thread-order-"));
    const paths = createAppPaths(dir);
    const db = initializeDatabase(paths.dbPath);
    const repo = new Repository(db, paths);

    const project = repo.createProject({ name: "repo", path: "/tmp/repo-thread-order" });
    const older = repo.createThread({ projectId: project.id, title: "older", provider: "codex" });
    const newer = repo.createThread({ projectId: project.id, title: "newer", provider: "codex" });

    repo.appendMessage({
      threadId: older.id,
      role: "user",
      content: "older user prompt",
      ts: "2024-01-01T00:00:00.000Z",
      streamSeq: 1
    });
    repo.appendMessage({
      threadId: newer.id,
      role: "assistant",
      content: "newer assistant response",
      ts: "2024-01-02T00:00:00.000Z",
      streamSeq: 1
    });
    repo.appendMessage({
      threadId: older.id,
      role: "system",
      content: "system update should not affect sort",
      ts: "2024-01-03T00:00:00.000Z",
      streamSeq: 2
    });

    const listed = repo.listThreads({ projectId: project.id });
    expect(listed[0]?.id).toBe(newer.id);
    expect(listed[1]?.id).toBe(older.id);
  });

  it("seeds and updates project settings", () => {
    const dir = mkdtempSync(join(tmpdir(), "code-app-project-settings-"));
    const paths = createAppPaths(dir);
    const db = initializeDatabase(paths.dbPath);
    const repo = new Repository(db, paths);
    repo.setSettings({
      envVars: { GLOBAL_TOKEN: "seed" }
    });

    const project = repo.createProject({ name: "repo", path: "/tmp/repo-project-settings" });
    const seeded = repo.getProjectSettings(project.id);
    expect(seeded.envVars.GLOBAL_TOKEN).toBe("seed");
    expect(seeded.devCommands[0]?.command).toBe("npm run dev");

    const updated = repo.setProjectSettings({
      projectId: project.id,
      envVars: { NODE_ENV: "development" },
      devCommands: [{ id: "vite", name: "Vite", command: "npm run dev -- --host" }],
      defaultDevCommandId: "vite",
      lastDetectedPreviewUrl: "http://127.0.0.1:5173"
    });

    expect(updated.envVars.NODE_ENV).toBe("development");
    expect(updated.defaultDevCommandId).toBe("vite");
    expect(updated.lastDetectedPreviewUrl).toBe("http://127.0.0.1:5173");
  });
});
