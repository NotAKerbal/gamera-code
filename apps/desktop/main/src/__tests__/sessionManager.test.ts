import { describe, expect, it, vi } from "vitest";
import { SessionManager } from "../services/sessionManager";

describe("sessionManager active project session detection", () => {
  it("treats any running agent session kind as active for its project", () => {
    const repository = {
      getThread: vi.fn((threadId: string) => {
        if (threadId === "thread-codex") {
          return { id: threadId, projectId: "project-a" };
        }
        if (threadId === "thread-gemini") {
          return { id: threadId, projectId: "project-b" };
        }
        return null;
      })
    } as unknown as ConstructorParameters<typeof SessionManager>[0]["repository"];

    const permissionEngine = {
      clearThreadApprovals: vi.fn()
    } as unknown as ConstructorParameters<typeof SessionManager>[0]["permissionEngine"];

    const manager = new SessionManager({
      repository,
      permissionEngine,
      emit: vi.fn()
    });

    const sessions = (manager as unknown as { sessions: Map<string, unknown> }).sessions;
    sessions.set("thread-codex", {
      kind: "codex_app_server",
      threadId: "thread-codex"
    });
    sessions.set("thread-gemini", {
      kind: "pty",
      threadId: "thread-gemini"
    });

    expect(manager.hasActiveAgentSessionInProject("project-a")).toBe(true);
    expect(manager.hasActiveAgentSessionInProject("project-b")).toBe(true);
    expect(manager.hasActiveAgentSessionInProject("project-c")).toBe(false);
  });

  it("forces danger-full-access when playwright-interactive skill is used", async () => {
    const repository = {
      getThread: vi.fn(() => ({
        id: "thread-codex",
        provider: "codex",
        projectId: "project-a"
      })),
      getProject: vi.fn(() => ({
        id: "project-a",
        path: process.cwd()
      })),
      getSession: vi.fn(() => null),
      appendMessage: vi.fn()
    } as unknown as ConstructorParameters<typeof SessionManager>[0]["repository"];

    const permissionEngine = {
      clearThreadApprovals: vi.fn()
    } as unknown as ConstructorParameters<typeof SessionManager>[0]["permissionEngine"];

    const manager = new SessionManager({
      repository,
      permissionEngine,
      emit: vi.fn()
    });

    const startSpy = vi.spyOn(manager, "start").mockResolvedValue({
      threadId: "thread-codex",
      ptyPid: 0,
      cwd: process.cwd(),
      envHash: "",
      startedAt: new Date().toISOString()
    });

    const ok = await manager.sendInput(
      "thread-codex",
      "test prompt",
      {
        sandboxMode: "workspace-write",
        networkAccessEnabled: false
      },
      [],
      [{ name: "playwright-interactive", path: "/skills/playwright-interactive/SKILL.md" }]
    );

    expect(ok).toBe(false);
    expect(startSpy).toHaveBeenCalledWith(
      expect.objectContaining({ id: "thread-codex" }),
      expect.any(String),
      expect.objectContaining({
        sandboxMode: "danger-full-access",
        networkAccessEnabled: true
      })
    );
  });

  it("includes detected preview URL in codex input when playwright-interactive is used", () => {
    const repository = {
      getProjectSettings: vi.fn(() => ({
        lastDetectedPreviewUrl: "http://127.0.0.1:4173"
      }))
    } as unknown as ConstructorParameters<typeof SessionManager>[0]["repository"];

    const permissionEngine = {
      clearThreadApprovals: vi.fn()
    } as unknown as ConstructorParameters<typeof SessionManager>[0]["permissionEngine"];

    const manager = new SessionManager({
      repository,
      permissionEngine,
      emit: vi.fn()
    });

    const result = (manager as unknown as {
      buildCodexInput: (
        projectId: string,
        input: string,
        attachments: Array<unknown>,
        skills: Array<{ name: string; path: string }>
      ) => unknown;
    }).buildCodexInput("project-a", "Please validate this app.", [], [
      { name: "playwright-interactive", path: "/skills/playwright-interactive/SKILL.md" }
    ]);

    expect(Array.isArray(result)).toBe(true);
    const items = result as Array<{ type: string; text?: string }>;
    const textItem = items.find((item) => item.type === "text");
    expect(textItem?.text).toContain("Detected preview URL: http://127.0.0.1:4173");
  });

  it("disables compact for harnesses without the thread_compact capability", async () => {
    const repository = {
      getThread: vi.fn(() => ({
        id: "thread-opencode",
        provider: "opencode",
        harnessId: "opencode",
        projectId: "project-a"
      }))
    } as unknown as ConstructorParameters<typeof SessionManager>[0]["repository"];

    const permissionEngine = {
      clearThreadApprovals: vi.fn()
    } as unknown as ConstructorParameters<typeof SessionManager>[0]["permissionEngine"];

    const manager = new SessionManager({
      repository,
      permissionEngine,
      emit: vi.fn()
    });

    await expect(manager.compactThread("thread-opencode")).resolves.toBe(false);
  });

  it("classifies quoted PowerShell Get-Content commands as file reads", async () => {
    const emit = vi.fn();
    const repository = {
      getThread: vi.fn(() => null),
      getSession: vi.fn(() => null),
      appendMessage: vi.fn()
    } as unknown as ConstructorParameters<typeof SessionManager>[0]["repository"];

    const permissionEngine = {
      clearThreadApprovals: vi.fn()
    } as unknown as ConstructorParameters<typeof SessionManager>[0]["permissionEngine"];

    const manager = new SessionManager({
      repository,
      permissionEngine,
      emit
    });

    await (
      manager as unknown as {
        handleCodexItemEvent: (
          threadId: string,
          eventType: "item.started" | "item.updated" | "item.completed",
          item: Record<string, unknown>,
          agentDrafts: Map<string, string>
        ) => Promise<void>;
      }
    ).handleCodexItemEvent(
      "thread-a",
      "item.completed",
      {
        id: "cmd-1",
        type: "command_execution",
        status: "completed",
        command: "\"C:\\\\Windows\\\\System32\\\\WindowsPowerShell\\\\v1.0\\\\powershell.exe\" -Command \"Get-Content 'apps/desktop/shared/src/contracts.ts' | Select-Object -First 220\"",
        aggregated_output: "export interface DesktopApi {}"
      },
      new Map()
    );

    expect(emit).toHaveBeenCalledWith(
      expect.objectContaining({
        threadId: "thread-a",
        type: "progress",
        data: expect.objectContaining({
          category: "file_read",
          commandIntent: "read",
          command: "Get-Content 'apps/desktop/shared/src/contracts.ts' | Select-Object -First 220"
        })
      })
    );
  });

  it("interrupts the parent turn after auto-spawning subthreads", async () => {
    const emit = vi.fn();
    let storedRun: { id: string; parentThreadId: string; proposal: { reason: string; parentGoal: string; tasks: unknown[] }; policy: "auto"; status: "queued" } | null =
      null;
    const repository = {
      getThread: vi.fn(() => ({
        id: "thread-parent",
        provider: "codex",
        projectId: "project-a"
      })),
      createOrchestrationRun: vi.fn((input: {
        parentThreadId: string;
        proposal: { reason: string; parentGoal: string; tasks: unknown[] };
        policy: "auto";
        status: "queued";
      }) => {
        storedRun = {
          id: "run-1",
          ...input
        };
        return storedRun;
      }),
      createOrchestrationChild: vi.fn(),
      getOrchestrationRun: vi.fn(() => storedRun),
      appendMessage: vi.fn()
    } as unknown as ConstructorParameters<typeof SessionManager>[0]["repository"];

    const permissionEngine = {
      clearThreadApprovals: vi.fn()
    } as unknown as ConstructorParameters<typeof SessionManager>[0]["permissionEngine"];

    const manager = new SessionManager({
      repository,
      permissionEngine,
      emit
    });

    const scheduleRunSpawns = vi
      .spyOn(manager as unknown as { scheduleRunSpawns: (runId: string) => Promise<void> }, "scheduleRunSpawns")
      .mockResolvedValue();

    const interruptTurn = vi.fn().mockResolvedValue(undefined);
    const sessions = (manager as unknown as { sessions: Map<string, unknown> }).sessions;
    sessions.set("thread-parent", {
      kind: "codex_app_server",
      threadId: "thread-parent",
      appServer: { interruptTurn }
    });

    const message = [
      "<subthread_proposal_v1>",
      JSON.stringify({
        reason: "Split implementation and tests.",
        parentGoal: "Pause parent synthesis until workers finish.",
        tasks: [
          { key: "impl", title: "Implementation", prompt: "Patch runtime behavior." },
          { key: "tests", title: "Tests", prompt: "Add regression coverage." }
        ]
      }),
      "</subthread_proposal_v1>"
    ].join("");

    await (
      manager as unknown as {
        maybeCreateSubthreadOrchestration: (threadId: string, assistantMessage: string) => Promise<void>;
      }
    ).maybeCreateSubthreadOrchestration("thread-parent", message);

    expect(repository.createOrchestrationRun).toHaveBeenCalledWith(
      expect.objectContaining({
        parentThreadId: "thread-parent",
        policy: "auto",
        status: "queued"
      })
    );
    expect(repository.createOrchestrationChild).toHaveBeenCalledTimes(2);
    expect(scheduleRunSpawns).toHaveBeenCalledWith("run-1");
    expect(interruptTurn).toHaveBeenCalledTimes(1);
    expect(emit).toHaveBeenCalledWith(
      expect.objectContaining({
        threadId: "thread-parent",
        type: "progress",
        payload: "Paused parent turn until sub-threads complete",
        data: expect.objectContaining({
          category: "orchestration_parent_paused",
          runId: "run-1"
        })
      })
    );
  });

  it("marks interrupted turns distinctly in progress events", async () => {
    const emit = vi.fn();
    const repository = {
      getThread: vi.fn(() => null),
      getSession: vi.fn(() => null),
      appendMessage: vi.fn()
    } as unknown as ConstructorParameters<typeof SessionManager>[0]["repository"];

    const permissionEngine = {
      clearThreadApprovals: vi.fn()
    } as unknown as ConstructorParameters<typeof SessionManager>[0]["permissionEngine"];

    const manager = new SessionManager({
      repository,
      permissionEngine,
      emit
    });

    await (
      manager as unknown as {
        handleCodexStreamEvent: (threadId: string, rawEvent: unknown, agentDrafts: Map<string, string>) => Promise<void>;
      }
    ).handleCodexStreamEvent("thread-a", { type: "turn.completed", status: "interrupted" }, new Map());

    expect(emit).toHaveBeenCalledWith(
      expect.objectContaining({
        threadId: "thread-a",
        type: "progress",
        payload: "Turn completed",
        data: expect.objectContaining({
          category: "turn",
          phase: "interrupted",
          status: "interrupted"
        })
      })
    );
  });
});
