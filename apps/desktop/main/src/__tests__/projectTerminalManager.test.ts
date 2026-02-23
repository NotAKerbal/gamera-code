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
  devCommands: [{ id: "default", name: "Dev Server", command: "npm run dev" }],
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
  it("stops previous and starts next project for start_stop behavior", () => {
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
      outputTail: "",
      updatedAt: new Date().toISOString()
    }));

    manager.setActiveProject("p1");
    manager.setActiveProject("p2");

    expect(startSpy).toHaveBeenCalledWith("p1");
    expect(stopSpy).toHaveBeenCalledWith("p1");
    expect(startSpy).toHaveBeenCalledWith("p2");
  });
});
