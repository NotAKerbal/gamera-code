import { describe, expect, it } from "vitest";
import { PROVIDER_ADAPTERS } from "../services/providerAdapters";

describe("provider adapters", () => {
  it("defines install commands", () => {
    const codex = PROVIDER_ADAPTERS.codex.getInstallCommand();
    const opencode = PROVIDER_ADAPTERS.opencode.getInstallCommand();

    expect(codex.command).toBe("npm");
    expect(codex.args).toContain("@openai/codex");
    expect(opencode.args).toContain("opencode-ai");
  });

  it("uses binary override when provided", () => {
    const run = PROVIDER_ADAPTERS.opencode.getRunCommand({
      cwd: "/tmp",
      binaryOverride: "/custom/opencode"
    });

    expect(run.command).toBe("/custom/opencode");
  });

  it("passes through chunk parser", () => {
    const chunk = "hello";
    expect(PROVIDER_ADAPTERS.opencode.parseOutputChunk(chunk)).toBe(chunk);
  });

  it("maps OpenCode model options into run args", () => {
    const run = PROVIDER_ADAPTERS.opencode.getRunCommand({
      cwd: "/tmp",
      options: {
        model: "gpt-5"
      }
    });

    expect(run.command).toBe("opencode");
    expect(run.args).toEqual(["--model", "gpt-5"]);
  });
});
