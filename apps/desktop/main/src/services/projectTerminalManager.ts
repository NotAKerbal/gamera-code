import { createHash } from "node:crypto";
import { accessSync, constants as fsConstants } from "node:fs";
import * as pty from "node-pty";
import type {
  AppSettings,
  Project,
  ProjectDevCommand,
  ProjectSettings,
  ProjectTerminalEvent,
  ProjectTerminalState,
  ProjectTerminalSwitchBehavior
} from "@code-app/shared";
import { Repository } from "./repository";
import { sanitizePtyOutput } from "../utils/stripAnsi";
import { withBundledRipgrepInPath } from "../utils/ripgrepBinary";
import { withRuntimePath } from "../utils/runtimeEnv";

interface RunningProjectTerminal {
  projectId: string;
  ptyProcess: pty.IPty;
  commandId: string;
  command: string;
  name: string;
  useForPreview: boolean;
}

interface ProjectTerminalManagerDeps {
  repository: Repository;
  emit: (event: ProjectTerminalEvent) => void;
  hasActiveAgentSessionInProject?: (projectId: string) => boolean;
}

const MAX_OUTPUT_CHARS = 12000;
const URL_PATTERN = /\bhttps?:\/\/[^\s"'<>]+/gi;

const nowIso = () => new Date().toISOString();
const toRunningKey = (projectId: string, commandId: string) => `${projectId}:${commandId}`;

const isExecutableFile = (path: string): boolean => {
  try {
    accessSync(path, fsConstants.X_OK);
    return true;
  } catch {
    return false;
  }
};

const resolvePosixShell = (): string | null => {
  const candidates = [
    process.env["SHELL"],
    "/bin/bash",
    "/usr/bin/bash",
    "/bin/sh",
    "/usr/bin/sh",
    "/bin/zsh",
    "/usr/bin/zsh"
  ];
  for (const candidate of candidates) {
    if (!candidate) {
      continue;
    }
    if (isExecutableFile(candidate)) {
      return candidate;
    }
  }
  return null;
};

export const fallbackUrlFromCommand = (command: string): string | undefined => {
  const normalized = command.toLowerCase();
  if (normalized.includes("vite")) {
    return "http://127.0.0.1:5173";
  }
  if (normalized.includes("next dev")) {
    return "http://127.0.0.1:3000";
  }
  if (normalized.includes("react-scripts start")) {
    return "http://127.0.0.1:3000";
  }
  if (normalized.includes("webpack serve")) {
    return "http://127.0.0.1:8080";
  }
  return undefined;
};

export const isValidPreviewUrl = (value: string): boolean => {
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return false;
    }
    return ["localhost", "127.0.0.1"].includes(url.hostname);
  } catch {
    return false;
  }
};

const mergeOutputTail = (prev: string, chunk: string): string => {
  const next = `${prev}${chunk}`;
  if (next.length <= MAX_OUTPUT_CHARS) {
    return next;
  }
  return next.slice(next.length - MAX_OUTPUT_CHARS);
};

export const detectPreviewUrlFromOutput = (output: string): string | undefined => {
  const urls = output.match(URL_PATTERN) ?? [];
  return urls.find((value) => isValidPreviewUrl(value));
};

const normalizeDevCommands = (settings: ProjectSettings): ProjectDevCommand[] => {
  if (settings.devCommands.length === 0) {
    return [{ id: "default", name: "Dev Server", command: "npm run dev", autoStart: true, useForPreview: true }];
  }

  const normalized = settings.devCommands.map((command, index) => ({
    ...command,
    autoStart: command.autoStart ?? index === 0,
    useForPreview: command.useForPreview ?? index === 0
  }));

  if (!normalized.some((command) => command.useForPreview)) {
    const first = normalized[0];
    if (first) {
      normalized[0] = { ...first, useForPreview: true };
    }
  }

  return normalized;
};

const pickCommand = (settings: ProjectSettings, commandId?: string): ProjectDevCommand => {
  const devCommands = normalizeDevCommands(settings);

  if (commandId) {
    const match = devCommands.find((cmd) => cmd.id === commandId);
    if (match) {
      return match;
    }
  }

  if (settings.defaultDevCommandId) {
    const match = devCommands.find((cmd) => cmd.id === settings.defaultDevCommandId);
    if (match) {
      return match;
    }
  }

  return devCommands[0] ?? { id: "default", name: "Dev Server", command: "npm run dev", autoStart: true, useForPreview: true };
};

const pickAutoStartCommands = (settings: ProjectSettings): ProjectDevCommand[] => {
  const devCommands = normalizeDevCommands(settings);
  const autoStart = devCommands.filter((command) => command.autoStart);
  return autoStart.length > 0 ? autoStart : [pickCommand(settings)];
};

const buildTerminal = (
  command: ProjectDevCommand,
  patch?: Partial<ProjectTerminalState["terminals"][number]>
): ProjectTerminalState["terminals"][number] => ({
  commandId: command.id,
  name: command.name,
  command: command.command,
  running: false,
  outputTail: "",
  updatedAt: nowIso(),
  autoStart: Boolean(command.autoStart),
  useForPreview: Boolean(command.useForPreview),
  ...patch
});

export class ProjectTerminalManager {
  private readonly states = new Map<string, ProjectTerminalState>();
  private readonly running = new Map<string, RunningProjectTerminal>();
  private activeProjectId: string | null = null;

  constructor(private readonly deps: ProjectTerminalManagerDeps) {}

  setActiveProject(projectId: string | null): { ok: boolean } {
    if (this.activeProjectId === projectId) {
      return { ok: true };
    }

    const previous = this.activeProjectId;
    this.activeProjectId = projectId;

    if (previous) {
      const previousSettings = this.deps.repository.getProjectSettings(previous);
      const previousBehavior = this.resolveSwitchBehavior(previousSettings);
      const hasActiveAgentSession = this.deps.hasActiveAgentSessionInProject?.(previous) ?? false;
      if (previousBehavior === "start_stop" && !hasActiveAgentSession) {
        this.stop(previous);
      }
    }

    if (!projectId) {
      return { ok: true };
    }

    const settings = this.deps.repository.getProjectSettings(projectId);
    const behavior = this.resolveSwitchBehavior(settings);
    const shouldAutoStart = behavior === "start_stop" || behavior === "start_only";
    if (shouldAutoStart) {
      this.start(projectId, undefined, true);
    }

    return { ok: true };
  }

  getState(projectId: string): ProjectTerminalState {
    const settings = this.deps.repository.getProjectSettings(projectId);
    const previous = this.states.get(projectId);
    const previousByCommandId = new Map(previous?.terminals.map((terminal) => [terminal.commandId, terminal]) ?? []);
    const commands = normalizeDevCommands(settings);

    const terminals = commands.map((command) => {
      const existing = previousByCommandId.get(command.id);
      const running = this.running.has(toRunningKey(projectId, command.id));
      return buildTerminal(command, {
        running,
        outputTail: existing?.outputTail ?? "",
        pid: existing?.pid,
        lastExitCode: existing?.lastExitCode,
        updatedAt: existing?.updatedAt ?? nowIso()
      });
    });

    const aggregate = pickCommand(settings);
    const aggregateTerminal = terminals.find((terminal) => terminal.commandId === aggregate.id);
    const next: ProjectTerminalState = {
      projectId,
      running: terminals.some((terminal) => terminal.running),
      terminals,
      commandId: aggregate.id,
      command: aggregate.command,
      outputTail: aggregateTerminal?.outputTail ?? "",
      pid: aggregateTerminal?.pid,
      lastExitCode: aggregateTerminal?.lastExitCode,
      updatedAt: nowIso()
    };

    this.states.set(projectId, next);
    return next;
  }

  start(projectId: string, commandId?: string, autoStartOnly = false): ProjectTerminalState {
    const project = this.requireProject(projectId);
    const settings = this.deps.repository.getProjectSettings(projectId);
    const targets = commandId
      ? [pickCommand(settings, commandId)]
      : autoStartOnly
      ? pickAutoStartCommands(settings)
      : normalizeDevCommands(settings);

    const commandsToStart = autoStartOnly
      ? targets.filter((command) => !this.running.has(toRunningKey(projectId, command.id)))
      : targets;

    commandsToStart.forEach((command) => this.startCommand(project, settings, command));
    return this.getState(projectId);
  }

  stop(projectId: string, commandId?: string): { ok: boolean } {
    const runningTargets = Array.from(this.running.values()).filter((running) => {
      if (running.projectId !== projectId) {
        return false;
      }
      if (commandId) {
        return running.commandId === commandId;
      }
      return true;
    });

    if (runningTargets.length === 0) {
      return { ok: false };
    }

    let hadFailure = false;
    runningTargets.forEach((running) => {
      try {
        running.ptyProcess.kill();
      } catch {
        hadFailure = true;
      }

      this.running.delete(toRunningKey(projectId, running.commandId));
      this.updateTerminal(projectId, running.commandId, {
        running: false,
        pid: undefined,
        updatedAt: nowIso()
      });
    });

    this.emit(projectId, "status", commandId ? `Stopped: ${commandId}` : "Stopped all dev terminals", {
      commandId
    });

    return { ok: !hadFailure };
  }

  private startCommand(project: Project, settings: ProjectSettings, command: ProjectDevCommand) {
    this.stop(project.id, command.id);

    const posixShell = process.platform === "win32" ? null : resolvePosixShell();
    if (process.platform !== "win32" && !posixShell) {
      const message = "No compatible shell found (tried $SHELL, bash, sh, zsh).";
      this.updateTerminal(project.id, command.id, {
        name: command.name,
        command: command.command,
        running: false,
        pid: undefined,
        outputTail: message,
        lastExitCode: 127,
        updatedAt: nowIso(),
        autoStart: Boolean(command.autoStart),
        useForPreview: Boolean(command.useForPreview)
      });
      this.emit(project.id, "stderr", message, {
        commandId: command.id,
        commandName: command.name
      });
      this.emit(project.id, "exit", `Exited ${command.name} with code 127`, {
        commandId: command.id,
        commandName: command.name,
        exitCode: 127
      });
      return;
    }

    const env = withBundledRipgrepInPath(
      withRuntimePath({
        ...process.env,
        ...settings.envVars,
        FORCE_COLOR: "1",
        CLICOLOR: "1",
        CLICOLOR_FORCE: "1",
        TERM: "xterm-256color",
        CODE_APP_PROJECT_ID: project.id
      } as Record<string, string>)
    );
    const shell = process.platform === "win32" ? "cmd.exe" : (posixShell as string);
    const shellArgs = process.platform === "win32" ? ["/d", "/s", "/c", command.command] : ["-lc", command.command];
    const ptyProcess = pty.spawn(shell, shellArgs, {
      name: "xterm-256color",
      cols: 120,
      rows: 40,
      cwd: project.path,
      env,
      useConpty: process.platform === "win32"
    });

    const running: RunningProjectTerminal = {
      projectId: project.id,
      ptyProcess,
      commandId: command.id,
      command: command.command,
      name: command.name,
      useForPreview: Boolean(command.useForPreview)
    };
    this.running.set(toRunningKey(project.id, command.id), running);

    this.updateTerminal(project.id, command.id, {
      name: command.name,
      command: command.command,
      running: true,
      pid: ptyProcess.pid,
      outputTail: "",
      lastExitCode: undefined,
      updatedAt: nowIso(),
      autoStart: Boolean(command.autoStart),
      useForPreview: Boolean(command.useForPreview)
    });

    this.emit(project.id, "status", `Started: ${command.name}`, {
      commandId: command.id,
      commandName: command.name,
      command: command.command,
      envHash: createHash("sha1").update(JSON.stringify(env)).digest("hex")
    });

    if (command.useForPreview) {
      const fallbackUrl = fallbackUrlFromCommand(command.command);
      if (fallbackUrl) {
        this.applyPreviewUrl(project.id, fallbackUrl, "command_fallback");
      }
    }

    ptyProcess.onData((chunk) => {
      const rawChunk = chunk.replace(/\u0000/g, "");
      if (rawChunk) {
        const existing = this.getState(project.id).terminals.find((terminal) => terminal.commandId === command.id);
        this.updateTerminal(project.id, command.id, {
          outputTail: mergeOutputTail(existing?.outputTail ?? "", rawChunk),
          updatedAt: nowIso()
        });
      }

      const cleaned = sanitizePtyOutput(chunk);
      if (!cleaned) {
        return;
      }

      this.emit(project.id, "stdout", cleaned, {
        commandId: command.id,
        commandName: command.name
      });

      if (command.useForPreview) {
        const match = detectPreviewUrlFromOutput(cleaned);
        if (match) {
          this.applyPreviewUrl(project.id, match, "output");
        }
      }
    });

    ptyProcess.onExit(({ exitCode, signal }) => {
      this.running.delete(toRunningKey(project.id, command.id));
      this.updateTerminal(project.id, command.id, {
        running: false,
        pid: undefined,
        lastExitCode: exitCode,
        updatedAt: nowIso()
      });
      this.emit(project.id, "exit", `Exited ${command.name} with code ${exitCode}${signal ? ` signal ${signal}` : ""}`, {
        commandId: command.id,
        commandName: command.name,
        exitCode
      });
    });
  }

  private updateTerminal(projectId: string, commandId: string, patch: Partial<ProjectTerminalState["terminals"][number]>) {
    const settings = this.deps.repository.getProjectSettings(projectId);
    const state = this.getState(projectId);
    const commands = normalizeDevCommands(settings);
    const command = commands.find((item) => item.id === commandId) ?? pickCommand(settings, commandId);

    const nextTerminals = state.terminals.map((terminal) =>
      terminal.commandId === commandId ? { ...terminal, ...patch, updatedAt: patch.updatedAt ?? nowIso() } : terminal
    );
    if (!nextTerminals.some((terminal) => terminal.commandId === commandId)) {
      nextTerminals.push(
        buildTerminal(command, {
          ...patch,
          updatedAt: patch.updatedAt ?? nowIso()
        })
      );
    }

    const aggregate = pickCommand(settings);
    const aggregateTerminal = nextTerminals.find((terminal) => terminal.commandId === aggregate.id);

    this.states.set(projectId, {
      projectId,
      running: nextTerminals.some((terminal) => terminal.running),
      terminals: nextTerminals,
      commandId: aggregate.id,
      command: aggregate.command,
      outputTail: aggregateTerminal?.outputTail ?? "",
      pid: aggregateTerminal?.pid,
      lastExitCode: aggregateTerminal?.lastExitCode,
      updatedAt: nowIso()
    });
  }

  private requireProject(projectId: string): Project {
    const project = this.deps.repository.getProject(projectId);
    if (!project) {
      throw new Error("Project not found");
    }
    return project;
  }

  private resolveSwitchBehavior(projectSettings: ProjectSettings): ProjectTerminalSwitchBehavior {
    if (projectSettings.switchBehaviorOverride) {
      return projectSettings.switchBehaviorOverride;
    }
    const defaults: AppSettings = this.deps.repository.getSettings();
    return defaults.projectTerminalSwitchBehaviorDefault ?? "start_stop";
  }

  private applyPreviewUrl(projectId: string, url: string, source: "output" | "command_fallback") {
    this.deps.repository.setLastDetectedPreviewUrl(projectId, url);
    this.emit(projectId, "preview_url_detected", url, { source });
  }

  private emit(projectId: string, type: ProjectTerminalEvent["type"], payload: string, data?: Record<string, unknown>) {
    this.deps.emit({
      projectId,
      type,
      payload,
      ts: nowIso(),
      data
    });
  }
}
