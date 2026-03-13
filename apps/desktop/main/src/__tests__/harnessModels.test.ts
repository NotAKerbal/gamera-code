import { describe, expect, it } from "vitest";
import {
  findHarnessModelProvider,
  getDefaultHarnessModel,
  getHarnessModelProviders,
  getHarnessModelSuggestions,
  HARNESS_PROVIDER_MODEL_MAP
} from "@code-app/shared";

describe("harness model catalog", () => {
  it("builds a provider map for each harness without changing selected model values", () => {
    const codexProviders = getHarnessModelProviders("codex");
    const opencodeProviders = getHarnessModelProviders("opencode");

    expect(codexProviders.map((provider) => provider.id)).toEqual(["codex:flagship", "codex:codex", "codex:spark"]);
    expect(opencodeProviders.map((provider) => provider.id)).toContain("opencode:openai");
    expect(opencodeProviders.map((provider) => provider.id)).toContain("opencode:anthropic");

    expect(HARNESS_PROVIDER_MODEL_MAP.codex?.["codex:flagship"]?.models[0]?.value).toBe("gpt-5.4");
    expect(HARNESS_PROVIDER_MODEL_MAP.opencode?.["opencode:openai"]?.models[0]?.value).toBe("opencode/gpt-5.4-pro");
  });

  it("preserves per-provider defaults and lookup behavior", () => {
    expect(getDefaultHarnessModel("codex")).toBe("gpt-5.4");
    expect(getDefaultHarnessModel("opencode")).toBe("opencode/gpt-5.4-pro");

    expect(findHarnessModelProvider("codex", "gpt-5.3-codex-spark")?.id).toBe("codex:spark");
    expect(findHarnessModelProvider("opencode", "google-vertex/deepseek-ai/deepseek-v3.1-maas")?.id).toBe(
      "opencode:deepseek"
    );
  });

  it("keeps suggestion ordering identical to the provider catalog", () => {
    const expectedCodexSuggestions = getHarnessModelProviders("codex").flatMap((provider) =>
      provider.models.map((model) => model.value)
    );
    const expectedOpenCodeSuggestions = getHarnessModelProviders("opencode").flatMap((provider) =>
      provider.models.map((model) => model.value)
    );

    expect(getHarnessModelSuggestions("codex")).toEqual(expectedCodexSuggestions);
    expect(getHarnessModelSuggestions("opencode")).toEqual(expectedOpenCodeSuggestions);
  });
});
