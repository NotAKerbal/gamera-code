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
    expect(repo.getThread(thread.id)?.harnessId).toBe("codex");
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
    expect(settings.harnessSettings.codex?.binaryOverride).toBe("/x/codex");
  });

  it("hydrates legacy and harness settings together", () => {
    const dir = mkdtempSync(join(tmpdir(), "code-app-harness-settings-"));
    const paths = createAppPaths(dir);
    const db = initializeDatabase(paths.dbPath);
    const repo = new Repository(db, paths);

    repo.setSettings({
      harnessSettings: {
        codex: {
          binaryOverride: "/opt/codex",
          defaults: {
            model: "gpt-5.3-codex",
            sandboxMode: "read-only"
          }
        }
      }
    });

    const settings = repo.getSettings();
    expect(settings.binaryOverrides.codex).toBe("/opt/codex");
    expect(settings.codexDefaults.model).toBe("gpt-5.3-codex");
    expect(settings.codexDefaults.sandboxMode).toBe("read-only");
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

  it("assigns stream sequence numbers without querying max on every append", () => {
    const dir = mkdtempSync(join(tmpdir(), "code-app-stream-seq-"));
    const paths = createAppPaths(dir);
    const db = initializeDatabase(paths.dbPath);
    const repo = new Repository(db, paths);

    const project = repo.createProject({ name: "repo", path: "/tmp/repo-stream-seq" });
    const thread = repo.createThread({ projectId: project.id, title: "seq", provider: "codex" });

    const first = repo.appendMessage({
      threadId: thread.id,
      role: "user",
      content: "first"
    });
    const second = repo.appendMessage({
      threadId: thread.id,
      role: "assistant",
      content: "second"
    });
    const manual = repo.appendMessage({
      threadId: thread.id,
      role: "system",
      content: "manual",
      streamSeq: 10
    });
    const afterManual = repo.appendMessage({
      threadId: thread.id,
      role: "assistant",
      content: "after manual"
    });

    expect(first.streamSeq).toBe(1);
    expect(second.streamSeq).toBe(2);
    expect(manual.streamSeq).toBe(10);
    expect(afterManual.streamSeq).toBe(11);
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
      subthreadPolicyOverride: "auto",
      lastDetectedPreviewUrl: "http://127.0.0.1:5173"
    });

    expect(updated.envVars.NODE_ENV).toBe("development");
    expect(updated.defaultDevCommandId).toBe("vite");
    expect(updated.subthreadPolicyOverride).toBe("auto");
    expect(updated.lastDetectedPreviewUrl).toBe("http://127.0.0.1:5173");
  });

  it("stores orchestration runs and child records", () => {
    const dir = mkdtempSync(join(tmpdir(), "code-app-orchestration-"));
    const paths = createAppPaths(dir);
    const db = initializeDatabase(paths.dbPath);
    const repo = new Repository(db, paths);

    const project = repo.createProject({ name: "repo", path: "/tmp/repo-orch" });
    const thread = repo.createThread({ projectId: project.id, title: "parent", provider: "codex" });

    const run = repo.createOrchestrationRun({
      parentThreadId: thread.id,
      policy: "ask",
      proposal: {
        reason: "parallelize",
        parentGoal: "ship feature",
        tasks: [{ key: "api", title: "API", prompt: "Build API" }]
      }
    });
    const child = repo.createOrchestrationChild({
      runId: run.id,
      taskKey: "api",
      title: "API",
      prompt: "Build API",
      status: "queued"
    });

    const fetched = repo.getOrchestrationRun(run.id);
    expect(fetched?.policy).toBe("ask");
    expect(repo.listOrchestrationRuns(thread.id)).toHaveLength(1);

    repo.updateOrchestrationChild({
      id: child.id,
      childThreadId: "child-thread-1",
      status: "running",
      lastCheckinAt: new Date().toISOString()
    });
    expect(repo.getOrchestrationChildByThreadId("child-thread-1")?.id).toBe(child.id);
  });

  it("archives and restores thread descendants with parent", () => {
    const dir = mkdtempSync(join(tmpdir(), "code-app-thread-archive-cascade-"));
    const paths = createAppPaths(dir);
    const db = initializeDatabase(paths.dbPath);
    const repo = new Repository(db, paths);

    const project = repo.createProject({ name: "repo", path: "/tmp/repo-archive-cascade" });
    const parent = repo.createThread({ projectId: project.id, title: "parent", provider: "codex" });
    const child = repo.createThread({
      projectId: project.id,
      title: "child",
      provider: "codex",
      parentThreadId: parent.id
    });
    const grandchild = repo.createThread({
      projectId: project.id,
      title: "grandchild",
      provider: "codex",
      parentThreadId: child.id
    });

    repo.archiveThread(parent.id, true);
    expect(repo.getThread(parent.id)?.archivedAt).toBeTruthy();
    expect(repo.getThread(child.id)?.archivedAt).toBeTruthy();
    expect(repo.getThread(grandchild.id)?.archivedAt).toBeTruthy();

    repo.archiveThread(parent.id, false);
    expect(repo.getThread(parent.id)?.archivedAt).toBeUndefined();
    expect(repo.getThread(child.id)?.archivedAt).toBeUndefined();
    expect(repo.getThread(grandchild.id)?.archivedAt).toBeUndefined();
  });

  it("stores pinned state on threads", () => {
    const dir = mkdtempSync(join(tmpdir(), "code-app-thread-pin-"));
    const paths = createAppPaths(dir);
    const db = initializeDatabase(paths.dbPath);
    const repo = new Repository(db, paths);

    const project = repo.createProject({ name: "repo", path: "/tmp/repo-pin" });
    const thread = repo.createThread({ projectId: project.id, title: "pin me", provider: "codex" });

    const pinned = repo.updateThread({ id: thread.id, pinned: true });
    expect(pinned.pinnedAt).toBeTruthy();

    const unpinned = repo.updateThread({ id: thread.id, pinned: false });
    expect(unpinned.pinnedAt).toBeUndefined();
  });

  it("stores thread color", () => {
    const dir = mkdtempSync(join(tmpdir(), "code-app-thread-color-"));
    const paths = createAppPaths(dir);
    const db = initializeDatabase(paths.dbPath);
    const repo = new Repository(db, paths);

    const project = repo.createProject({ name: "repo", path: "/tmp/repo-color" });
    const thread = repo.createThread({ projectId: project.id, title: "color me", provider: "codex" });
    const updated = repo.updateThread({ id: thread.id, color: "#2563eb" });

    expect(updated.color).toBe("#2563eb");
    expect(repo.getThread(thread.id)?.color).toBe("#2563eb");
  });

  it("blocks archiving pinned threads", () => {
    const dir = mkdtempSync(join(tmpdir(), "code-app-thread-pin-archive-"));
    const paths = createAppPaths(dir);
    const db = initializeDatabase(paths.dbPath);
    const repo = new Repository(db, paths);

    const project = repo.createProject({ name: "repo", path: "/tmp/repo-pin-archive" });
    const thread = repo.createThread({ projectId: project.id, title: "pinned", provider: "codex" });
    repo.updateThread({ id: thread.id, pinned: true });

    expect(() => repo.archiveThread(thread.id, true)).toThrow(/Pinned threads must be unpinned before archiving/);
  });

  it("deletes thread descendants with parent", () => {
    const dir = mkdtempSync(join(tmpdir(), "code-app-thread-delete-cascade-"));
    const paths = createAppPaths(dir);
    const db = initializeDatabase(paths.dbPath);
    const repo = new Repository(db, paths);

    const project = repo.createProject({ name: "repo", path: "/tmp/repo-delete-cascade" });
    const parent = repo.createThread({ projectId: project.id, title: "parent", provider: "codex" });
    const child = repo.createThread({
      projectId: project.id,
      title: "child",
      provider: "codex",
      parentThreadId: parent.id
    });
    const grandchild = repo.createThread({
      projectId: project.id,
      title: "grandchild",
      provider: "codex",
      parentThreadId: child.id
    });

    repo.deleteThread(parent.id);

    expect(repo.getThread(parent.id)).toBeNull();
    expect(repo.getThread(child.id)).toBeNull();
    expect(repo.getThread(grandchild.id)).toBeNull();
  });
});
