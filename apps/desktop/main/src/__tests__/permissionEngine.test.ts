import { describe, expect, it } from "vitest";
import { PermissionEngine, classifyRisk } from "../services/permissionEngine";

const mockRepository = {
  savePermissionDecision: () => undefined
} as any;

describe("classifyRisk", () => {
  it("marks destructive commands as high risk", () => {
    const result = classifyRisk("rm -rf node_modules");
    expect(result.riskLevel).toBe("high");
  });

  it("marks force push as medium risk", () => {
    const result = classifyRisk("git push --force");
    expect(result.riskLevel).toBe("medium");
  });

  it("marks reads as low risk", () => {
    const result = classifyRisk("rg TODO src");
    expect(result.riskLevel).toBe("low");
  });
});

describe("PermissionEngine", () => {
  it("requires prompt for medium risk in prompt_on_risk mode", () => {
    const engine = new PermissionEngine(mockRepository, "prompt_on_risk");
    const check = engine.evaluate({ command: "git push --force", cwd: "/tmp" });

    expect(check.requiresPrompt).toBe(true);
  });

  it("respects always_ask mode", () => {
    const engine = new PermissionEngine(mockRepository, "always_ask");
    const check = engine.evaluate({ command: "ls", cwd: "/tmp" });

    expect(check.requiresPrompt).toBe(true);
  });

  it("supports session approval", () => {
    const engine = new PermissionEngine(mockRepository, "prompt_on_risk");
    const threadId = "thread-1";

    engine.evaluate({ threadId, command: "git push --force", cwd: "/tmp", approve: true });

    const check = engine.evaluate({ threadId, command: "git push --force", cwd: "/tmp" });
    expect(check.requiresPrompt).toBe(false);
    expect(check.approved).toBe(true);
  });
});
