import { dirname, join } from "node:path";
import { readFileSync } from "node:fs";
import type {
  InstallDependenciesResult,
  InstallDetail,
  InstallDependencyKey,
  InstallStatus,
  Provider
} from "@code-app/shared";
import { Repository } from "./repository";
import { createCommandRunner, type CommandRunner } from "../utils/commandRunner";
import { resolveCodexBinaryPath } from "../utils/codexBinary";
import { resolveBundledRipgrepBinaryPath } from "../utils/ripgrepBinary";

interface InstallCommand {
  label: string;
  command: string;
  args: string[];
}

const DEFAULT_SETUP_TARGETS: InstallDependencyKey[] = ["node", "npm", "git", "rg", "codex"];

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

const uniqueTargets = (targets: InstallDependencyKey[]) => Array.from(new Set(targets));

const linesFromChunk = (chunk: string) =>
  chunk
    .replace(/\r/g, "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

export class InstallerManager {
  constructor(
    private readonly repository: Repository,
    private readonly runner: CommandRunner = createCommandRunner()
  ) {}

  async doctor(): Promise<InstallStatus> {
    const node = await existsInPath(this.runner, "node", ["--version"]);
    const npm = await existsInPath(this.runner, "npm", ["--version"]);
    const git = await existsInPath(this.runner, "git", ["--version"]);
    const rg = await existsInPath(this.runner, "rg", ["--version"]);
    const codex = await this.checkCodexAppServer();
    const bundledRg = resolveBundledRipgrepBinaryPath();
    const rgOk = rg.ok || Boolean(bundledRg);

    const details: InstallDetail[] = [
      { key: "node", ok: node.ok, version: node.version, message: node.message },
      { key: "npm", ok: npm.ok, version: npm.version, message: npm.message },
      { key: "git", ok: git.ok, version: git.version, message: git.message },
      {
        key: "rg",
        ok: rgOk,
        version: rg.version,
        message: rg.ok ? "ok" : bundledRg ? "Bundled with app" : rg.message
      },
      { key: "codex", ok: codex.ok, version: codex.version, message: codex.message }
    ];

    const status: InstallStatus = {
      nodeOk: node.ok,
      npmOk: npm.ok,
      gitOk: git.ok,
      rgOk,
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
          "Codex app server is bundled with the desktop app. No extra Codex CLI installation is required.",
          "If authentication is needed, Codex will prompt during your first Codex thread prompt."
        ]
      };
    }

    if (provider === "gemini") {
      return {
        ok: false,
        logs: [
          "Gemini support is temporarily disabled while Codex app-server flow is being finalized.",
          "Gemini will return as an SDK-backed provider in a follow-up update."
        ]
      };
    }

    return {
      ok: false,
      logs: [`Unsupported provider: ${provider}`]
    };
  }

  async installDependencies(
    targets: InstallDependencyKey[] = DEFAULT_SETUP_TARGETS,
    onLog?: (line: string) => void
  ): Promise<InstallDependenciesResult> {
    const requested = uniqueTargets(targets);
    const logs: string[] = [];

    const pushLog = (line: string) => {
      logs.push(line);
      onLog?.(line);
    };

    const initialStatus = await this.doctor();
    const missing = this.resolveMissingDependencies(initialStatus, requested);

    if (missing.length === 0) {
      pushLog("All selected dependencies are already available.");
      return {
        ok: true,
        logs,
        status: initialStatus
      };
    }

    const actionable = this.mapToActionableDependencies(missing);
    if (actionable.length === 0) {
      pushLog("Missing dependencies do not require a package-manager install.");
      const status = await this.doctor();
      return {
        ok: this.resolveMissingDependencies(status, requested).length === 0,
        logs,
        status
      };
    }

    const plan = await this.buildInstallPlan(actionable);
    if (plan.length === 0) {
      pushLog("No supported package manager found for automatic installation on this system.");
      const status = await this.doctor();
      return {
        ok: false,
        logs,
        status
      };
    }

    let hadInstallFailure = false;
    for (const step of plan) {
      const printable = `${step.command} ${step.args.join(" ")}`.trim();
      pushLog(`Running (${step.label}): ${printable}`);
      const result = await this.runner.stream(step.command, step.args, {
        onData: (chunk) => {
          linesFromChunk(chunk).forEach((line) => pushLog(line));
        }
      });
      if (result.code !== 0) {
        hadInstallFailure = true;
        pushLog(`Step failed (${step.label}) with exit code ${result.code}.`);
        if (result.stderr) {
          linesFromChunk(result.stderr).forEach((line) => pushLog(line));
        }
      } else {
        pushLog(`Step completed (${step.label}).`);
      }
    }

    const status = await this.doctor();
    const unresolved = this.resolveMissingDependencies(status, requested);
    const ok = unresolved.length === 0 && !hadInstallFailure;

    if (ok) {
      pushLog("Automatic setup completed successfully.");
    } else if (unresolved.length > 0) {
      pushLog(`Setup incomplete. Missing: ${unresolved.join(", ")}.`);
    } else {
      pushLog("Setup finished but at least one installer command failed.");
    }

    return {
      ok,
      logs,
      status
    };
  }

  private resolveMissingDependencies(status: InstallStatus, targets: InstallDependencyKey[]): InstallDependencyKey[] {
    return targets.filter((target) => {
      if (target === "node") {
        return !status.nodeOk;
      }
      if (target === "npm") {
        return !status.npmOk;
      }
      if (target === "git") {
        return !status.gitOk;
      }
      if (target === "rg") {
        return !status.rgOk;
      }
      if (target === "codex") {
        return !status.codexOk;
      }
      return false;
    });
  }

  private mapToActionableDependencies(targets: InstallDependencyKey[]): Array<"node" | "git" | "rg"> {
    const mapped = targets
      .map((target) => {
        if (target === "node" || target === "git" || target === "rg") {
          return target;
        }
        if (target === "npm") {
          return "node";
        }
        return null;
      })
      .filter((value): value is "node" | "git" | "rg" => Boolean(value));

    return Array.from(new Set(mapped));
  }

  private async buildInstallPlan(targets: Array<"node" | "git" | "rg">): Promise<InstallCommand[]> {
    if (targets.length === 0) {
      return [];
    }

    if (process.platform === "win32") {
      const hasWinget = (await existsInPath(this.runner, "winget")).ok;
      if (hasWinget) {
        const idByTarget: Record<"node" | "git" | "rg", string> = {
          node: "OpenJS.NodeJS.LTS",
          git: "Git.Git",
          rg: "BurntSushi.ripgrep.MSVC"
        };
        return targets.map((target) => ({
          label: `Install ${target}`,
          command: "winget",
          args: [
            "install",
            "--exact",
            "--id",
            idByTarget[target],
            "--accept-package-agreements",
            "--accept-source-agreements",
            "--silent"
          ]
        }));
      }

      const hasChoco = (await existsInPath(this.runner, "choco")).ok;
      if (hasChoco) {
        const packageByTarget: Record<"node" | "git" | "rg", string> = {
          node: "nodejs-lts",
          git: "git",
          rg: "ripgrep"
        };
        const packages = targets.map((target) => packageByTarget[target]);
        return [
          {
            label: "Install dependencies via Chocolatey",
            command: "choco",
            args: ["install", "-y", ...packages]
          }
        ];
      }

      return [];
    }

    if (process.platform === "darwin") {
      const hasBrew = (await existsInPath(this.runner, "brew")).ok;
      if (!hasBrew) {
        return [];
      }
      const packageByTarget: Record<"node" | "git" | "rg", string> = {
        node: "node",
        git: "git",
        rg: "ripgrep"
      };
      const packages = targets.map((target) => packageByTarget[target]);
      return [
        {
          label: "Install dependencies via Homebrew",
          command: "brew",
          args: ["install", ...packages]
        }
      ];
    }

    const packageByTarget: Record<"node" | "git" | "rg", string> = {
      node: "nodejs",
      git: "git",
      rg: "ripgrep"
    };
    const packages = targets.map((target) => packageByTarget[target]).join(" ");

    if ((await existsInPath(this.runner, "apt-get")).ok) {
      return [
        {
          label: "Install dependencies via apt-get",
          command: "sh",
          args: [
            "-lc",
            `if command -v sudo >/dev/null 2>&1; then sudo -n apt-get update && sudo -n apt-get install -y ${packages}; else apt-get update && apt-get install -y ${packages}; fi`
          ]
        }
      ];
    }

    if ((await existsInPath(this.runner, "dnf")).ok) {
      return [
        {
          label: "Install dependencies via dnf",
          command: "sh",
          args: [
            "-lc",
            `if command -v sudo >/dev/null 2>&1; then sudo -n dnf install -y ${packages}; else dnf install -y ${packages}; fi`
          ]
        }
      ];
    }

    if ((await existsInPath(this.runner, "yum")).ok) {
      return [
        {
          label: "Install dependencies via yum",
          command: "sh",
          args: [
            "-lc",
            `if command -v sudo >/dev/null 2>&1; then sudo -n yum install -y ${packages}; else yum install -y ${packages}; fi`
          ]
        }
      ];
    }

    if ((await existsInPath(this.runner, "pacman")).ok) {
      return [
        {
          label: "Install dependencies via pacman",
          command: "sh",
          args: [
            "-lc",
            `if command -v sudo >/dev/null 2>&1; then sudo -n pacman -Sy --noconfirm ${packages}; else pacman -Sy --noconfirm ${packages}; fi`
          ]
        }
      ];
    }

    return [];
  }

  private async checkCodexAppServer(): Promise<{ ok: boolean; version?: string; message: string }> {
    const version = this.readCodexVersion();
    const binary = resolveCodexBinaryPath() || "codex";
    const result = await this.runner.run(binary, ["app-server", "--help"]);
    if (result.code !== 0) {
      return {
        ok: false,
        version,
        message: result.stderr || "Failed to start Codex app server"
      };
    }

    return {
      ok: true,
      version,
      message: "Codex app server ready"
    };
  }

  private readCodexVersion(): string | undefined {
    try {
      const codexEntry = require.resolve("@openai/codex/package.json");
      const packageJsonPath = join(dirname(codexEntry), "package.json");
      const raw = readFileSync(packageJsonPath, "utf8");
      const parsed = JSON.parse(raw) as { version?: string };
      return parsed.version;
    } catch {
      return undefined;
    }
  }
}
