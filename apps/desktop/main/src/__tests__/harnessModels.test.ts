import { describe, expect, it } from "vitest";
import {
  findHarnessModelEntry,
  findHarnessModelProvider,
  getDefaultHarnessModel,
  getHarnessModelLabel,
  getHarnessModelProviders,
  getHarnessModelSuggestions,
  HARNESS_PROVIDER_MODEL_MAP
} from "@code-app/shared";

describe("harness model catalog", () => {
  it("builds a provider map for each harness without changing selected model values", () => {
    const codexProviders = getHarnessModelProviders("codex");
    const opencodeProviders = getHarnessModelProviders("opencode");
    const geminiProviders = getHarnessModelProviders("gemini");

    expect(codexProviders.map((provider) => provider.id)).toEqual(["codex:flagship", "codex:codex", "codex:spark"]);
    expect(opencodeProviders.map((provider) => provider.id)).toContain("opencode:openai");
    expect(opencodeProviders.map((provider) => provider.id)).toContain("opencode:anthropic");
    expect(geminiProviders.map((provider) => provider.id)).toEqual(["gemini:google"]);

    expect(HARNESS_PROVIDER_MODEL_MAP.codex?.["codex:flagship"]?.models[0]?.value).toBe("gpt-5.4");
    expect(HARNESS_PROVIDER_MODEL_MAP.opencode?.["opencode:openai"]?.models[0]?.value).toBe("opencode/gpt-5.4-pro");
    expect(HARNESS_PROVIDER_MODEL_MAP.gemini?.["gemini:google"]?.models[0]?.value).toBe("gemini-3.1-pro-preview");
  });

  it("preserves per-provider defaults and lookup behavior", () => {
    expect(getDefaultHarnessModel("codex")).toBe("gpt-5.4");
    expect(getDefaultHarnessModel("opencode")).toBe("opencode/gpt-5.4-pro");
    expect(getDefaultHarnessModel("gemini")).toBe("gemini-2.5-pro");

    expect(findHarnessModelProvider("codex", "gpt-5.3-codex-spark")?.id).toBe("codex:spark");
    expect(findHarnessModelProvider("opencode", "google-vertex/deepseek-ai/deepseek-v3.1-maas")?.id).toBe(
      "opencode:deepseek"
    );
    expect(findHarnessModelProvider("opencode", "google-vertex/gemini-2.5-pro-preview-06-05")?.id).toBe(
      "opencode:google"
    );
    expect(findHarnessModelProvider("gemini", "gemini-2.5-flash")?.id).toBe("gemini:google");
  });

  it("returns curated labels when provided", () => {
    expect(findHarnessModelEntry("codex", "gpt-5.4")?.label).toBe("GPT-5.4");
    expect(getHarnessModelLabel("opencode", "opencode/gpt-5.4-pro")).toBe("GPT-5.4 Pro");
    expect(getHarnessModelLabel("gemini", "gemini-2.5-flash")).toBe("Gemini 2.5 Flash");
    expect(getHarnessModelLabel("opencode", "google-vertex/gemini-2.5-flash-lite-preview-06-17")).toBe(
      "Gemini 2.5 Flash-Lite Preview 06-17"
    );
  });

  it("uses the updated Gemini 2.5 family for the Google group default", () => {
    const googleProvider = HARNESS_PROVIDER_MODEL_MAP.opencode?.["opencode:google"];

    expect(googleProvider?.defaultModel).toBe("opencode/gemini-3.1-pro");
    expect(googleProvider?.models.map((model) => model.value)).toContain("opencode/gemini-2.5-flash-lite");
    expect(googleProvider?.models.map((model) => model.value)).toContain("google-vertex/gemini-3.1-pro-preview");
    expect(googleProvider?.models.map((model) => model.value)).toContain("google-vertex/gemini-3-flash-preview");
    expect(googleProvider?.models.map((model) => model.value)).toContain("google-vertex/gemini-2.5-pro-preview-06-05");
  });

  it("marks Gemini Google catalog entries with the expected default and labels", () => {
    const googleProvider = HARNESS_PROVIDER_MODEL_MAP.gemini?.["gemini:google"];

    expect(googleProvider?.label).toBe("Google");
    expect(googleProvider?.models.map((model) => ({
      harnessId: model.harnessId,
      providerId: model.providerId,
      value: model.value,
      label: model.label,
      isDefault: model.isDefault
    }))).toEqual([
      {
        harnessId: "gemini",
        providerId: "gemini:google",
        value: "gemini-3.1-pro-preview",
        label: "Gemini 3.1 Pro Preview",
        isDefault: false
      },
      {
        harnessId: "gemini",
        providerId: "gemini:google",
        value: "gemini-3-flash-preview",
        label: "Gemini 3 Flash Preview",
        isDefault: false
      },
      {
        harnessId: "gemini",
        providerId: "gemini:google",
        value: "gemini-2.5-pro",
        label: "Gemini 2.5 Pro",
        isDefault: true
      },
      {
        harnessId: "gemini",
        providerId: "gemini:google",
        value: "gemini-2.5-flash",
        label: "Gemini 2.5 Flash",
        isDefault: false
      },
      {
        harnessId: "gemini",
        providerId: "gemini:google",
        value: "gemini-2.5-flash-lite",
        label: "Gemini 2.5 Flash-Lite",
        isDefault: false
      }
    ]);
  });

  it("keeps suggestion ordering identical to the provider catalog", () => {
    const expectedCodexSuggestions = getHarnessModelProviders("codex").flatMap((provider) =>
      provider.models.map((model) => model.value)
    );
    const expectedOpenCodeSuggestions = getHarnessModelProviders("opencode").flatMap((provider) =>
      provider.models.map((model) => model.value)
    );
    const expectedGeminiSuggestions = getHarnessModelProviders("gemini").flatMap((provider) =>
      provider.models.map((model) => model.value)
    );

    expect(getHarnessModelSuggestions("codex")).toEqual(expectedCodexSuggestions);
    expect(getHarnessModelSuggestions("opencode")).toEqual(expectedOpenCodeSuggestions);
    expect(getHarnessModelSuggestions("gemini")).toEqual(expectedGeminiSuggestions);
    expect(getHarnessModelSuggestions("gemini")).toEqual([
      "gemini-3.1-pro-preview",
      "gemini-3-flash-preview",
      "gemini-2.5-pro",
      "gemini-2.5-flash",
      "gemini-2.5-flash-lite"
    ]);
  });
});
