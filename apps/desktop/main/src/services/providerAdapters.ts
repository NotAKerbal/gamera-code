import {
  getDefaultHarnessModel,
  getHarnessModelSuggestions,
  type CodexThreadOptions,
  type Provider,
  type ProviderInstallCommand
} from "@code-app/shared";
import { createCommandRunner, type CommandRunner } from "../utils/commandRunner";

export interface ThreadContext {
  cwd: string;
  binaryOverride?: string;
  options?: CodexThreadOptions;
}

export interface ProviderAdapter {
  provider: Provider;
  npmPackage: string;
  defaultBinary: string;
  getBinaryName: (override?: string) => string;
  getInstallCommand: () => ProviderInstallCommand;
  getRunCommand: (context: ThreadContext) => { command: string; args: string[] };
  discoverAvailableModels?: (override?: string) => Promise<string[] | null>;
  parseOutputChunk: (chunk: string) => string;
  healthCheck: (override?: string) => Promise<{ ok: boolean; version?: string; message: string }>;
}

const runner = createCommandRunner();

const buildHealthCheck = async (
  commandRunner: CommandRunner,
  binary: string
): Promise<{ ok: boolean; version?: string; message: string }> => {
  const result = await commandRunner.run(binary, ["--version"]);
  if (result.code !== 0) {
    return { ok: false, message: result.stderr || `${binary} not available` };
  }

  const line = result.stdout.split("\n")[0] || result.stderr.split("\n")[0] || "unknown";
  return { ok: true, version: line.trim(), message: "ok" };
};

const resolveSelectedModel = (provider: Provider, model?: string): string | null => {
  const normalized = model?.trim();
  if (!normalized) {
    return null;
  }

  return getHarnessModelSuggestions(provider).includes(normalized) ? normalized : null;
};

const createAdapter = (
  provider: Provider,
  npmPackage: string,
  defaultBinary: string,
  getRunCommand?: (context: ThreadContext) => { command: string; args: string[] }
): ProviderAdapter => ({
  provider,
  npmPackage,
  defaultBinary,
  getBinaryName: (override) => override || defaultBinary,
  getInstallCommand: () => ({
    command: "npm",
    args: ["install", "-g", npmPackage]
  }),
  getRunCommand: (context) =>
    getRunCommand?.(context) ?? {
      command: context.binaryOverride || defaultBinary,
      args: []
    },
  discoverAvailableModels: async () => getHarnessModelSuggestions(provider),
  parseOutputChunk: (chunk) => chunk,
  healthCheck: async (override) => buildHealthCheck(runner, override || defaultBinary)
});

export const PROVIDER_ADAPTERS: Record<Provider, ProviderAdapter> = {
  codex: createAdapter("codex", "@openai/codex", "codex"),
  opencode: createAdapter("opencode", "opencode-ai", "opencode", (context) => {
    const args: string[] = [];
    const model = resolveSelectedModel("opencode", context.options?.model);
    if (model) {
      args.push("--model", model);
    }
    return {
      command: context.binaryOverride || "opencode",
      args
    };
  }),
  gemini: createAdapter("gemini", "@google/gemini-cli", "gemini", (context) => {
    return {
      command: context.binaryOverride || "gemini",
      args: ["--model", resolveSelectedModel("gemini", context.options?.model) ?? getDefaultHarnessModel("gemini") ?? "gemini-2.5-pro"]
    };
  })
};
