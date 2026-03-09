import { dirname, join } from "node:path";
import { readFileSync } from "node:fs";
import type {
  CodexAuthStatus,
  CodexLoginResult,
  CodexLogoutResult,
  HarnessAvailableModels,
  HarnessId,
  InstallDependenciesResult,
  InstallDetail,
  InstallDependencyKey,
  InstallStatus,
  OpenCodeAuthCommandResult,
  OpenCodeAuthMethod,
  OpenCodeAuthStatus,
  Provider
} from "@code-app/shared";
import { getHarnessModelSuggestions } from "@code-app/shared";
import { Repository } from "./repository";
import { createCommandRunner, type CommandRunner } from "../utils/commandRunner";
import { resolveCodexBinaryPath } from "../utils/codexBinary";
import { resolveBundledRipgrepBinaryPath } from "../utils/ripgrepBinary";
import { CodexAppServerClient } from "./codexAppServer";
import { getHarnessDefinition, getPtyHarnessAdapter } from "./harnessDefinitions";
import { stripAnsi } from "../utils/stripAnsi";

interface InstallCommand {
  label: string;
  command: string;
  args: string[];
}

const DEFAULT_SETUP_TARGETS: InstallDependencyKey[] = ["node", "npm", "git", "rg"];

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

const OPENCODE_TREE_PREFIX_PATTERN = /^[\s|│┃┆╎├└┌┐╭╰─┬┴┼]+/u;

export const parseOpenCodeAuthListOutput = (output: string): OpenCodeAuthStatus => {
  const lines = stripAnsi(output)
    .replace(/\r/g, "")
    .split("\n")
    .map((line) => line.replace(OPENCODE_TREE_PREFIX_PATTERN, "").trim())
    .filter(Boolean);

  const credentialProviders: string[] = [];
  const environmentProviders: string[] = [];
  let section: "credentials" | "environment" | null = null;

  for (const line of lines) {
    if (/^credentials\b/i.test(line)) {
      section = "credentials";
      continue;
    }
    if (/^environment\b/i.test(line)) {
      section = "environment";
      continue;
    }
    if (!section) {
      continue;
    }
    if (/configured/i.test(line)) {
      continue;
    }

    if (section === "credentials") {
      credentialProviders.push(line);
    } else {
      environmentProviders.push(line);
    }
  }

  const authenticated = credentialProviders.length > 0 || environmentProviders.length > 0;
  const parts: string[] = [];
  if (credentialProviders.length > 0) {
    parts.push(`Stored credentials: ${credentialProviders.join(", ")}`);
  }
  if (environmentProviders.length > 0) {
    parts.push(`Environment auth: ${environmentProviders.join(", ")}`);
  }

  return {
    authenticated,
    hasStoredCredentials: credentialProviders.length > 0,
    methods: [],
    credentialMethods: [],
    environmentMethods: [],
    credentialProviders,
    environmentProviders,
    message: authenticated ? parts.join(" | ") : "No OpenCode providers configured."
  };
};

const OPEN_CODE_AUTH_TREE_PREFIX_PATTERN = /^[\s|\u25cf\u2502\u2503\u2506\u254e\u251c\u2514\u250c\u2510\u256d\u2570\u2500\u252c\u2534\u253c]+/u;
const OPEN_CODE_CREDENTIAL_SUMMARY_PATTERN = /^\d+\s+credentials?$/i;
const OPEN_CODE_ENVIRONMENT_SUMMARY_PATTERN = /^\d+\s+environment variables?$/i;

const pickKnownModelsFromText = (knownModels: string[], output: string): string[] => {
  const normalizedOutput = stripAnsi(output).toLowerCase();
  const matches: string[] = [];
  const seen = new Set<string>();

  for (const model of knownModels) {
    const candidates = [model.toLowerCase()];
    if (model.startsWith("opencode/")) {
      candidates.push(model.slice("opencode/".length).toLowerCase());
    }

    if (!candidates.some((candidate) => normalizedOutput.includes(candidate))) {
      continue;
    }
    if (seen.has(model)) {
      continue;
    }
    seen.add(model);
    matches.push(model);
  }

  return matches;
};

const buildOpenCodeMethodId = (source: OpenCodeAuthMethod["source"], providerLabel: string, qualifier?: string) =>
  `${source}:${providerLabel.toLowerCase()}:${qualifier?.toLowerCase() ?? ""}`;

const parseOpenCodeAuthListOutputV2 = (output: string): OpenCodeAuthStatus => {
  const lines = stripAnsi(output)
    .replace(/\r/g, "")
    .split("\n")
    .map((line) => line.replace(OPEN_CODE_AUTH_TREE_PREFIX_PATTERN, "").trim())
    .filter(Boolean);

  const credentialMethods: OpenCodeAuthMethod[] = [];
  const environmentMethods: OpenCodeAuthMethod[] = [];
  let section: "credentials" | "environment" | null = null;

  for (const line of lines) {
    if (/^credentials\b/i.test(line)) {
      section = "credentials";
      continue;
    }
    if (/^environment\b/i.test(line)) {
      section = "environment";
      continue;
    }
    if (!section) {
      continue;
    }
    if (OPEN_CODE_CREDENTIAL_SUMMARY_PATTERN.test(line) || OPEN_CODE_ENVIRONMENT_SUMMARY_PATTERN.test(line)) {
      continue;
    }

    if (section === "credentials") {
      const match = /^(?<provider>.+?)\s+(?<authKind>oauth|api)$/i.exec(line);
      const providerLabel = match?.groups?.provider?.trim() ?? line;
      const authKind = match?.groups?.authKind?.trim().toLowerCase();
      credentialMethods.push({
        id: buildOpenCodeMethodId("credential", providerLabel, authKind),
        source: "credential",
        providerLabel,
        authKind,
        removable: true,
        rawLabel: line
      });
      continue;
    }

    const match = /^(?<provider>.+?)\s+(?<envVar>[A-Z][A-Z0-9_]+)$/i.exec(line);
    const providerLabel = match?.groups?.provider?.trim() ?? line;
    const envVarName = match?.groups?.envVar?.trim();
    environmentMethods.push({
      id: buildOpenCodeMethodId("environment", providerLabel, envVarName),
      source: "environment",
      providerLabel,
      envVarName,
      removable: false,
      rawLabel: line
    });
  }

  const methods = [...credentialMethods, ...environmentMethods];
  const credentialProviders = credentialMethods.map((method) => method.providerLabel);
  const environmentProviders = environmentMethods.map((method) => method.providerLabel);
  const authenticated = methods.length > 0;
  const parts: string[] = [];
  if (credentialMethods.length > 0) {
    parts.push(`Stored credentials: ${credentialMethods.map((method) => method.rawLabel).join(", ")}`);
  }
  if (environmentMethods.length > 0) {
    parts.push(`Environment auth: ${environmentMethods.map((method) => method.rawLabel).join(", ")}`);
  }

  return {
    authenticated,
    hasStoredCredentials: credentialMethods.length > 0,
    methods,
    credentialMethods,
    environmentMethods,
    credentialProviders,
    environmentProviders,
    message: authenticated ? parts.join(" | ") : "No OpenCode providers configured."
  };
};

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
    const codex = await this.checkHarnessHealth("codex");
    const opencode = await this.checkHarnessHealth("opencode");
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
      { key: "codex", ok: codex.ok, version: codex.version, message: codex.message },
      { key: "opencode", ok: opencode.ok, version: opencode.version, message: opencode.message }
    ];

    const status: InstallStatus = {
      nodeOk: node.ok,
      npmOk: npm.ok,
      gitOk: git.ok,
      rgOk,
      codexOk: codex.ok,
      opencodeOk: opencode.ok,
      geminiOk: true,
      readyHarnessIds: [codex.ok ? "codex" : null, opencode.ok ? "opencode" : null].filter(
        (value): value is HarnessId => Boolean(value)
      ),
      details
    };

    this.repository.saveInstallCheck(status);

    return status;
  }

  async verify(): Promise<InstallStatus> {
    return this.doctor();
  }

  async getCodexAuthStatus(): Promise<CodexAuthStatus> {
    const appServer = this.createCodexAppServerClient();
    try {
      await appServer.connect();
      const status = await appServer.getAccountStatus(true);
      return {
        ...status,
        message: status.authenticated ? "Signed in to Codex." : "Codex account sign-in is required."
      };
    } catch (error) {
      return {
        authenticated: false,
        requiresOpenaiAuth: true,
        message: error instanceof Error ? error.message : String(error)
      };
    } finally {
      await appServer.close();
    }
  }

  async loginCodex(onAuthUrl?: (url: string) => void | Promise<void>): Promise<CodexLoginResult> {
    const appServer = this.createCodexAppServerClient();
    try {
      await appServer.connect();
      const status = await appServer.getAccountStatus(true);
      if (status.authenticated) {
        return {
          ok: true,
          alreadyAuthenticated: true,
          message: "Already signed in to Codex."
        };
      }

      const { authUrl, loginId } = await appServer.startChatGptLogin();
      if (onAuthUrl) {
        await onAuthUrl(authUrl);
      }

      const completion = await appServer.waitForLoginCompletion(loginId, 180_000);
      if (!completion.success) {
        return {
          ok: false,
          message: completion.error || "Codex sign-in did not complete."
        };
      }

      const finalStatus = await appServer.getAccountStatus(true);
      if (!finalStatus.authenticated) {
        return {
          ok: false,
          message: "Codex sign-in callback finished, but account is still unauthenticated."
        };
      }

      return {
        ok: true,
        authUrl,
        message: "Signed in to Codex."
      };
    } catch (error) {
      return {
        ok: false,
        message: error instanceof Error ? error.message : String(error)
      };
    } finally {
      await appServer.close();
    }
  }

  async logoutCodex(): Promise<CodexLogoutResult> {
    const appServer = this.createCodexAppServerClient();
    try {
      await appServer.connect();
      const status = await appServer.getAccountStatus(true);
      if (!status.authenticated) {
        return {
          ok: true,
          alreadyLoggedOut: true,
          message: "Codex is already signed out."
        };
      }

      await appServer.logoutAccount();
      const finalStatus = await appServer.getAccountStatus(false);
      return {
        ok: !finalStatus.authenticated,
        message: finalStatus.authenticated ? "Codex sign-out did not complete." : "Signed out of Codex."
      };
    } catch (error) {
      return {
        ok: false,
        message: error instanceof Error ? error.message : String(error)
      };
    } finally {
      await appServer.close();
    }
  }

  async getOpenCodeAuthStatus(binaryOverride?: string): Promise<OpenCodeAuthStatus> {
    const adapter = getPtyHarnessAdapter("opencode");
    const binary = adapter?.getBinaryName(binaryOverride) ?? binaryOverride ?? "opencode";
    const result = await this.runner.run(binary, ["auth", "list"]);
    if (result.code !== 0) {
      return {
        authenticated: false,
        hasStoredCredentials: false,
        methods: [],
        credentialMethods: [],
        environmentMethods: [],
        credentialProviders: [],
        environmentProviders: [],
        message: result.stderr || result.stdout || "OpenCode auth status is unavailable."
      };
    }

    return parseOpenCodeAuthListOutputV2(result.stdout || result.stderr);
  }

  async getAvailableModels(input?: { opencodeBinaryOverride?: string }): Promise<HarnessAvailableModels> {
    const available: HarnessAvailableModels = {};

    const codexModels = await this.getCodexAvailableModels();
    if (codexModels && codexModels.length > 0) {
      available.codex = codexModels;
    }

    const opencodeModels = await this.getOpenCodeAvailableModels(input?.opencodeBinaryOverride);
    if (opencodeModels && opencodeModels.length > 0) {
      available.opencode = opencodeModels;
    }

    return available;
  }

  async loginOpenCode(input: {
    cwd?: string;
    binaryOverride?: string;
    launchCommand: (command: string, args: string[], cwd?: string) => Promise<void>;
  }): Promise<OpenCodeAuthCommandResult> {
    const adapter = getPtyHarnessAdapter("opencode");
    const command = adapter?.getBinaryName(input.binaryOverride) ?? input.binaryOverride ?? "opencode";
    await input.launchCommand(command, ["auth", "login"], input.cwd);
    return {
      ok: true,
      launched: true,
      message: "Opened OpenCode auth login in your terminal."
    };
  }

  async logoutOpenCode(input: {
    cwd?: string;
    binaryOverride?: string;
    providerLabel?: string;
    launchCommand: (command: string, args: string[], cwd?: string) => Promise<void>;
  }): Promise<OpenCodeAuthCommandResult> {
    const status = await this.getOpenCodeAuthStatus(input.binaryOverride);
    if (!status.hasStoredCredentials) {
      return {
        ok: true,
        message: status.environmentProviders.length > 0
          ? "OpenCode is configured via environment variables. Remove those variables to sign out."
          : "No saved OpenCode credentials were found."
      };
    }

    const adapter = getPtyHarnessAdapter("opencode");
    const command = adapter?.getBinaryName(input.binaryOverride) ?? input.binaryOverride ?? "opencode";
    await input.launchCommand(command, ["auth", "logout"], input.cwd);
    return {
      ok: true,
      launched: true,
      message: input.providerLabel
        ? `Opened OpenCode auth logout in your terminal. Select ${input.providerLabel} if prompted.`
        : "Opened OpenCode auth logout in your terminal."
    };
  }

  private async getCodexAvailableModels(): Promise<string[] | null> {
    const appServer = this.createCodexAppServerClient();
    try {
      await appServer.connect();
      return await appServer.listAvailableModels();
    } catch {
      return null;
    } finally {
      await appServer.close();
    }
  }

  private async getOpenCodeAvailableModels(binaryOverride?: string): Promise<string[] | null> {
    const adapter = getPtyHarnessAdapter("opencode");
    const binary = adapter?.getBinaryName(binaryOverride) ?? binaryOverride ?? "opencode";
    const result = await this.runner.run(binary, ["models"]);
    if (result.code !== 0) {
      return null;
    }

    const knownModels = getHarnessModelSuggestions("opencode");
    const matches = pickKnownModelsFromText(knownModels, result.stdout || result.stderr);
    return matches.length > 0 ? matches : null;
  }

  async installCli(provider: Provider): Promise<{ ok: boolean; logs: string[] }> {
    const definition = getHarnessDefinition(provider);
    if (definition.bundled) {
      return {
        ok: true,
        logs: [
          "Codex app server is bundled with the desktop app. No extra Codex CLI installation is required.",
          "If authentication is needed, Codex will prompt during your first Codex thread prompt."
        ]
      };
    }

    const adapter = getPtyHarnessAdapter(provider);
    if (adapter && provider === "opencode") {
      const install = adapter.getInstallCommand();
      return {
        ok: true,
        logs: [
          "OpenCode is not bundled with the desktop app.",
          `Install it with: ${install.command} ${install.args.join(" ")}`
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
      if (target === "opencode") {
        return !status.opencodeOk;
      }
      return false;
    });
  }

  private async checkHarnessHealth(harnessId: HarnessId): Promise<{ ok: boolean; version?: string; message: string }> {
    const definition = getHarnessDefinition(harnessId);
    if (definition.runtimeKind === "codex_app_server") {
      return this.checkCodexAppServer();
    }

    const adapter = getPtyHarnessAdapter(harnessId);
    if (!adapter) {
      return {
        ok: false,
        message: `No adapter registered for ${harnessId}`
      };
    }

    return adapter.healthCheck(this.repository.getSettings().harnessSettings[harnessId]?.binaryOverride);
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

  private createCodexAppServerClient() {
    const env = Object.fromEntries(
      Object.entries({
        ...process.env,
        FORCE_COLOR: "0",
        NO_COLOR: "1",
        CLICOLOR: "0",
        TERM: "dumb",
        CODE_APP_PROVIDER: "codex",
        CODE_APP_THREAD_ID: "installer-auth-check"
      }).filter((entry): entry is [string, string] => typeof entry[1] === "string")
    );

    return new CodexAppServerClient({
      executablePath: resolveCodexBinaryPath(),
      env,
      threadId: "installer-auth-check"
    });
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
