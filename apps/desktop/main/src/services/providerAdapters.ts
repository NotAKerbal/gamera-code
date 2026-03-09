import type { CodexThreadOptions, Provider, ProviderInstallCommand } from "@code-app/shared";
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
  parseOutputChunk: (chunk) => chunk,
  healthCheck: async (override) => buildHealthCheck(runner, override || defaultBinary)
});

export const PROVIDER_ADAPTERS: Record<Provider, ProviderAdapter> = {
  codex: createAdapter("codex", "@openai/codex", "codex"),
  opencode: createAdapter("opencode", "opencode-ai", "opencode", (context) => {
    const args: string[] = [];
    const model = context.options?.model?.trim();
    if (model) {
      args.push("--model", model);
    }
    return {
      command: context.binaryOverride || "opencode",
      args
    };
  })
};
