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
});
