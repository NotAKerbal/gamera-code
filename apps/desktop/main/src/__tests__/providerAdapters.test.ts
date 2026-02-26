import { describe, expect, it } from "vitest";
import { PROVIDER_ADAPTERS } from "../services/providerAdapters";

describe("provider adapters", () => {
  it("defines install commands", () => {
    const codex = PROVIDER_ADAPTERS.codex.getInstallCommand();
    const gemini = PROVIDER_ADAPTERS.gemini.getInstallCommand();

    expect(codex.command).toBe("npm");
    expect(codex.args).toContain("@openai/codex");
    expect(gemini.args).toContain("@google/gemini-cli");
  });

  it("uses binary override when provided", () => {
    const run = PROVIDER_ADAPTERS.gemini.getRunCommand({
      cwd: "/tmp",
      binaryOverride: "/custom/gemini"
    });

    expect(run.command).toBe("/custom/gemini");
  });

  it("passes through chunk parser", () => {
    const chunk = "hello";
    expect(PROVIDER_ADAPTERS.gemini.parseOutputChunk(chunk)).toBe(chunk);
  });
});
