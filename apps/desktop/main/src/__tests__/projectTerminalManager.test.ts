import { describe, expect, it, vi } from "vitest";
import type { ProjectSettings } from "@code-app/shared";
import {
  ProjectTerminalManager,
  detectPreviewUrlFromOutput,
  fallbackUrlFromCommand,
  isValidPreviewUrl
} from "../services/projectTerminalManager";

const baseSettings: ProjectSettings = {
  projectId: "p1",
  envVars: {},
  devCommands: [{ id: "default", name: "Dev Server", command: "npm run dev", autoStart: true, useForPreview: true }],
  defaultDevCommandId: "default",
  autoStartDevTerminal: true,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString()
};

describe("projectTerminalManager utils", () => {
  it("infers fallback preview URLs from commands", () => {
    expect(fallbackUrlFromCommand("npm run vite")).toBe("http://127.0.0.1:5173");
    expect(fallbackUrlFromCommand("next dev")).toBe("http://127.0.0.1:3000");
    expect(fallbackUrlFromCommand("unknown")).toBeUndefined();
  });

  it("detects valid preview URLs from output", () => {
    expect(detectPreviewUrlFromOutput("ready at http://127.0.0.1:5173")).toBe("http://127.0.0.1:5173");
    expect(detectPreviewUrlFromOutput("ready at https://localhost:3000")).toBe("https://localhost:3000");
    expect(detectPreviewUrlFromOutput("ready at https://example.com")).toBeUndefined();
    expect(isValidPreviewUrl("http://localhost:8080")).toBe(true);
    expect(isValidPreviewUrl("https://example.com")).toBe(false);
  });
});

describe("projectTerminalManager switching", () => {
  it("stops previous and starts next project for start_stop behavior", async () => {
    vi.useFakeTimers();
    const repository = {
      getProjectSettings: vi.fn((projectId: string) => ({
        ...baseSettings,
        projectId
      })),
      getSettings: vi.fn(() => ({
        projectTerminalSwitchBehaviorDefault: "start_stop"
      }))
    } as unknown as ConstructorParameters<typeof ProjectTerminalManager>[0]["repository"];

    const manager = new ProjectTerminalManager({
      repository,
      emit: vi.fn()
    });

    const stopSpy = vi.spyOn(manager, "stop").mockReturnValue({ ok: true });
    const startSpy = vi.spyOn(manager, "start").mockImplementation((projectId: string) => ({
      projectId,
      running: true,
      terminals: [],
      outputTail: "",
      updatedAt: new Date().toISOString()
    }));

    manager.setActiveProject("p1");
    await vi.runAllTimersAsync();
    manager.setActiveProject("p2");
    await vi.runAllTimersAsync();

    expect(startSpy).toHaveBeenCalledWith("p1", undefined, true);
    expect(stopSpy).toHaveBeenCalledWith("p1", "default");
    expect(startSpy).toHaveBeenCalledWith("p2", undefined, true);
    vi.useRealTimers();
  });

  it("does not auto-start on project enter when project auto-start flag is false", async () => {
    vi.useFakeTimers();
    const repository = {
      getProjectSettings: vi.fn((projectId: string) => ({
        ...baseSettings,
        projectId,
        autoStartDevTerminal: false
      })),
      getSettings: vi.fn(() => ({
        projectTerminalSwitchBehaviorDefault: "start_only"
      }))
    } as unknown as ConstructorParameters<typeof ProjectTerminalManager>[0]["repository"];

    const manager = new ProjectTerminalManager({
      repository,
      emit: vi.fn()
    });

    const startSpy = vi.spyOn(manager, "start").mockImplementation((projectId: string) => ({
      projectId,
      running: true,
      terminals: [],
      outputTail: "",
      updatedAt: new Date().toISOString()
    }));

    manager.setActiveProject("p1");
    await vi.runAllTimersAsync();

    expect(startSpy).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it("skips stopping previous project when an agent session is active there", async () => {
    vi.useFakeTimers();
    const repository = {
      getProjectSettings: vi.fn((projectId: string) => ({
        ...baseSettings,
        projectId
      })),
      getSettings: vi.fn(() => ({
        projectTerminalSwitchBehaviorDefault: "start_stop"
      }))
    } as unknown as ConstructorParameters<typeof ProjectTerminalManager>[0]["repository"];

    const manager = new ProjectTerminalManager({
      repository,
      hasActiveAgentSessionInProject: vi.fn((projectId: string) => projectId === "p1"),
      emit: vi.fn()
    });

    const stopSpy = vi.spyOn(manager, "stop").mockReturnValue({ ok: true });
    const startSpy = vi.spyOn(manager, "start").mockImplementation((projectId: string) => ({
      projectId,
      running: true,
      terminals: [],
      outputTail: "",
      updatedAt: new Date().toISOString()
    }));

    manager.setActiveProject("p1");
    await vi.runAllTimersAsync();
    manager.setActiveProject("p2");
    await vi.runAllTimersAsync();

    expect(startSpy).toHaveBeenCalledWith("p1", undefined, true);
    expect(stopSpy).not.toHaveBeenCalledWith("p1");
    expect(startSpy).toHaveBeenCalledWith("p2", undefined, true);
    vi.useRealTimers();
  });

  it("does not restart already-running terminals during auto-start-only start", () => {
    const repository = {
      getProject: vi.fn((projectId: string) => ({ id: projectId, name: projectId, path: process.cwd() })),
      getProjectSettings: vi.fn((projectId: string) => ({
        ...baseSettings,
        projectId
      })),
      getSettings: vi.fn(() => ({
        projectTerminalSwitchBehaviorDefault: "start_only"
      }))
    } as unknown as ConstructorParameters<typeof ProjectTerminalManager>[0]["repository"];

    const manager = new ProjectTerminalManager({
      repository,
      emit: vi.fn()
    });
    const stopSpy = vi.spyOn(manager, "stop");

    (manager as unknown as { running: Map<string, unknown> }).running.set("p1:default", {
      projectId: "p1",
      commandId: "default"
    });

    manager.start("p1", undefined, true);

    expect(stopSpy).not.toHaveBeenCalled();
  });

  it("does not start any command when no command is marked auto-start", () => {
    const repository = {
      getProject: vi.fn((projectId: string) => ({ id: projectId, name: projectId, path: process.cwd() })),
      getProjectSettings: vi.fn((projectId: string) => ({
        ...baseSettings,
        projectId,
        devCommands: [{ id: "default", name: "Dev Server", command: "npm run dev", autoStart: false, useForPreview: true }]
      })),
      getSettings: vi.fn(() => ({
        projectTerminalSwitchBehaviorDefault: "start_only"
      }))
    } as unknown as ConstructorParameters<typeof ProjectTerminalManager>[0]["repository"];

    const manager = new ProjectTerminalManager({
      repository,
      emit: vi.fn()
    });

    const stopSpy = vi.spyOn(manager, "stop");
    manager.start("p1", undefined, true);

    expect(stopSpy).not.toHaveBeenCalled();
  });

  it("does not call start on project enter when no commands are auto-start", async () => {
    vi.useFakeTimers();
    const repository = {
      getProjectSettings: vi.fn((projectId: string) => ({
        ...baseSettings,
        projectId,
        devCommands: [{ id: "default", name: "Dev Server", command: "npm run dev", autoStart: false, useForPreview: true }]
      })),
      getSettings: vi.fn(() => ({
        projectTerminalSwitchBehaviorDefault: "start_only"
      }))
    } as unknown as ConstructorParameters<typeof ProjectTerminalManager>[0]["repository"];

    const manager = new ProjectTerminalManager({
      repository,
      emit: vi.fn()
    });

    const startSpy = vi.spyOn(manager, "start").mockImplementation((projectId: string) => ({
      projectId,
      running: true,
      terminals: [],
      outputTail: "",
      updatedAt: new Date().toISOString()
    }));

    manager.setActiveProject("p1");
    await vi.runAllTimersAsync();

    expect(startSpy).not.toHaveBeenCalled();
    vi.useRealTimers();
  });
});
