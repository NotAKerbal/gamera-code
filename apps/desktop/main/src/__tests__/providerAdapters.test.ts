import { describe, expect, it } from "vitest";
import { PROVIDER_ADAPTERS } from "../services/providerAdapters";

describe("provider adapters", () => {
  it("defines install commands", () => {
    const codex = PROVIDER_ADAPTERS.codex.getInstallCommand();
    const opencode = PROVIDER_ADAPTERS.opencode.getInstallCommand();
    const gemini = PROVIDER_ADAPTERS.gemini.getInstallCommand();

    expect(codex.command).toBe("npm");
    expect(codex.args).toContain("@openai/codex");
    expect(opencode.args).toContain("opencode-ai");
    expect(gemini.args).toContain("@google/gemini-cli");
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
        model: "opencode/gpt-5.4"
      }
    });

    expect(run.command).toBe("opencode");
    expect(run.args).toEqual(["--model", "opencode/gpt-5.4"]);
  });

  it("defines Gemini as a first-class harness adapter", () => {
    expect(PROVIDER_ADAPTERS.gemini.defaultBinary).toBe("gemini");
    expect(PROVIDER_ADAPTERS.gemini.getRunCommand({ cwd: "/tmp" })).toEqual({
      command: "gemini",
      args: ["--model", "gemini-2.5-pro"]
    });
  });

  it("maps Gemini model options into run args", () => {
    const run = PROVIDER_ADAPTERS.gemini.getRunCommand({
      cwd: "/tmp",
      options: {
        model: "gemini-2.5-flash"
      }
    });

    expect(run).toEqual({
      command: "gemini",
      args: ["--model", "gemini-2.5-flash"]
    });
  });

  it("drops invalid model selections for OpenCode and Gemini", () => {
    const opencodeRun = PROVIDER_ADAPTERS.opencode.getRunCommand({
      cwd: "/tmp",
      options: {
        model: "gpt-5.4"
      }
    });
    const geminiRun = PROVIDER_ADAPTERS.gemini.getRunCommand({
      cwd: "/tmp",
      options: {
        model: "gpt-5.4"
      }
    });

    expect(opencodeRun.args).toEqual([]);
    expect(geminiRun.args).toEqual(["--model", "gemini-2.5-pro"]);
  });

  it("uses shared Gemini suggestions for adapter discovery", async () => {
    const models = await PROVIDER_ADAPTERS.gemini.discoverAvailableModels?.();

    expect(models).toEqual(
      expect.arrayContaining([
        "gemini-3.1-pro-preview",
        "gemini-3-flash-preview",
        "gemini-2.5-pro",
        "gemini-2.5-flash",
        "gemini-2.5-flash-lite"
      ])
    );
  });
});
