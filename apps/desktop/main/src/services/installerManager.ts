import { dirname, join } from "node:path";
import { readFileSync } from "node:fs";
import type { InstallDetail, InstallStatus, Provider } from "@code-app/shared";
import { Repository } from "./repository";
import { createCommandRunner, type CommandRunner } from "../utils/commandRunner";
import { loadCodexSdk } from "./codexSdk";
import { resolveCodexBinaryPath } from "../utils/codexBinary";

const existsInPath = async (
  runner: CommandRunner,
  command: string,
  versionArgs: string[] = ["--version"]
): Promise<{ ok: boolean; version?: string; message: string }> => {
  const result = await runner.run(command, versionArgs);
  if (result.code !== 0 && process.platform !== "win32") {
    const fallbackShell = process.platform === "darwin" ? "/bin/zsh" : "/bin/bash";
    const escaped = [command, ...versionArgs].map((token) => token.replace(/"/g, "\\\"")).join(" ");
    const loginResult = await runner.run(fallbackShell, ["-lc", escaped]);
    if (loginResult.code === 0) {
      const version = (loginResult.stdout || loginResult.stderr).split("\n")[0]?.trim();
      return { ok: true, version, message: "ok" };
    }
  }

  if (result.code !== 0) {
    return { ok: false, message: result.stderr || `${command} not found` };
  }

  const version = (result.stdout || result.stderr).split("\n")[0]?.trim();
  return { ok: true, version, message: "ok" };
};

export class InstallerManager {
  constructor(
    private readonly repository: Repository,
    private readonly runner: CommandRunner = createCommandRunner()
  ) {}

  async doctor(): Promise<InstallStatus> {
    const node = await existsInPath(this.runner, "node", ["--version"]);
    const npm = await existsInPath(this.runner, "npm", ["--version"]);
    const codex = await this.checkCodexSdk();

    const details: InstallDetail[] = [
      { key: "node", ok: node.ok, version: node.version, message: node.message },
      { key: "npm", ok: npm.ok, version: npm.version, message: npm.message },
      { key: "codex", ok: codex.ok, version: codex.version, message: codex.message }
    ];

    const status: InstallStatus = {
      nodeOk: node.ok,
      npmOk: npm.ok,
      codexOk: codex.ok,
      geminiOk: true,
      details
    };

    this.repository.saveInstallCheck(status);

    return status;
  }

  async verify(): Promise<InstallStatus> {
    return this.doctor();
  }

  async installCli(provider: Provider): Promise<{ ok: boolean; logs: string[] }> {
    if (provider === "codex") {
      return {
        ok: true,
        logs: [
          "Codex SDK is bundled with the desktop app. No Codex CLI installation is required.",
          "If authentication is needed, the SDK will prompt on your first Codex thread prompt."
        ]
      };
    }

    if (provider === "gemini") {
      return {
        ok: false,
        logs: [
          "Gemini support is temporarily disabled while Codex SDK flow is being finalized.",
          "Gemini will return as an SDK-backed provider in a follow-up update."
        ]
      };
    }

    return {
      ok: false,
      logs: [`Unsupported provider: ${provider}`]
    };
  }

  private async checkCodexSdk(): Promise<{ ok: boolean; version?: string; message: string }> {
    const version = this.readCodexSdkVersion();

    try {
      const { Codex } = await loadCodexSdk();
      const codexPathOverride = resolveCodexBinaryPath();
      const codex = new Codex(codexPathOverride ? { codexPathOverride } : {});
      const authStatusMethod = (codex as Record<string, unknown>).authStatus as (() => Promise<unknown>) | undefined;

      if (!authStatusMethod) {
        return {
          ok: true,
          version,
          message: "Codex SDK ready"
        };
      }

      try {
        const auth = await authStatusMethod.call(codex);
        const record = auth && typeof auth === "object" ? (auth as Record<string, unknown>) : {};
        const authenticated = typeof record.authenticated === "boolean" ? record.authenticated : undefined;

        return {
          ok: true,
          version,
          message: authenticated === false ? "Codex SDK ready (auth required)" : "Codex SDK ready"
        };
      } catch {
        return {
          ok: true,
          version,
          message: "Codex SDK ready (auth status unavailable)"
        };
      }
    } catch (error) {
      return {
        ok: false,
        version,
        message: error instanceof Error ? error.message : "Failed to load Codex SDK"
      };
    }
  }

  private readCodexSdkVersion(): string | undefined {
    try {
      const sdkEntry = require.resolve("@openai/codex-sdk");
      const packageJsonPath = join(dirname(dirname(sdkEntry)), "package.json");
      const raw = readFileSync(packageJsonPath, "utf8");
      const parsed = JSON.parse(raw) as { version?: string };
      return parsed.version;
    } catch {
      return undefined;
    }
  }
}
