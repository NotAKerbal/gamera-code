import { createHash } from "node:crypto";
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

interface RunningProjectTerminal {
  projectId: string;
  ptyProcess: pty.IPty;
  commandId: string;
  command: string;
}

interface ProjectTerminalManagerDeps {
  repository: Repository;
  emit: (event: ProjectTerminalEvent) => void;
}

const MAX_OUTPUT_CHARS = 12000;
const URL_PATTERN = /\bhttps?:\/\/[^\s"'<>]+/gi;

const nowIso = () => new Date().toISOString();

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

const pickCommand = (settings: ProjectSettings, commandId?: string): ProjectDevCommand => {
  if (commandId) {
    const match = settings.devCommands.find((cmd) => cmd.id === commandId);
    if (match) {
      return match;
    }
  }

  if (settings.defaultDevCommandId) {
    const match = settings.devCommands.find((cmd) => cmd.id === settings.defaultDevCommandId);
    if (match) {
      return match;
    }
  }

  return settings.devCommands[0] ?? { id: "default", name: "Dev Server", command: "npm run dev" };
};

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
      if (previousBehavior === "start_stop") {
        this.stop(previous);
      }
    }

    if (!projectId) {
      return { ok: true };
    }

    const settings = this.deps.repository.getProjectSettings(projectId);
    const behavior = this.resolveSwitchBehavior(settings);
    const shouldAutoStart = settings.autoStartDevTerminal && (behavior === "start_stop" || behavior === "start_only");
    if (shouldAutoStart) {
      this.start(projectId);
    }

    return { ok: true };
  }

  getState(projectId: string): ProjectTerminalState {
    const existing = this.states.get(projectId);
    if (existing) {
      return existing;
    }

    const settings = this.deps.repository.getProjectSettings(projectId);
    const command = pickCommand(settings);
    const seed: ProjectTerminalState = {
      projectId,
      running: false,
      commandId: command.id,
      command: command.command,
      outputTail: "",
      updatedAt: nowIso()
    };
    this.states.set(projectId, seed);
    return seed;
  }

  start(projectId: string, commandId?: string): ProjectTerminalState {
    const project = this.requireProject(projectId);
    const settings = this.deps.repository.getProjectSettings(projectId);
    const command = pickCommand(settings, commandId);
    this.stop(projectId);

    const env = {
      ...process.env,
      ...settings.envVars,
      FORCE_COLOR: "0",
      NO_COLOR: "1",
      CLICOLOR: "0",
      TERM: "xterm-256color",
      CODE_APP_PROJECT_ID: projectId
    } as Record<string, string>;
    const shell = process.platform === "win32" ? "cmd.exe" : "/bin/zsh";
    const shellArgs = process.platform === "win32" ? ["/d", "/s", "/c", command.command] : ["-lc", command.command];
    const ptyProcess = pty.spawn(shell, shellArgs, {
      name: "xterm-256color",
      cols: 120,
      rows: 40,
      cwd: project.path,
      env,
      useConpty: process.platform === "win32"
    });

    this.running.set(projectId, {
      projectId,
      ptyProcess,
      commandId: command.id,
      command: command.command
    });
    this.setState(projectId, {
      running: true,
      commandId: command.id,
      command: command.command,
      pid: ptyProcess.pid,
      outputTail: "",
      updatedAt: nowIso()
    });

    this.emit(projectId, "status", `Started: ${command.name}`, {
      commandId: command.id,
      command: command.command,
      envHash: createHash("sha1").update(JSON.stringify(env)).digest("hex")
    });

    const fallbackUrl = fallbackUrlFromCommand(command.command);
    if (fallbackUrl) {
      this.applyPreviewUrl(projectId, fallbackUrl, "command_fallback");
    }

    ptyProcess.onData((chunk) => {
      const cleaned = sanitizePtyOutput(chunk);
      if (!cleaned) {
        return;
      }
      const nextState = this.getState(projectId);
      this.setState(projectId, {
        outputTail: mergeOutputTail(nextState.outputTail, cleaned),
        updatedAt: nowIso()
      });
      this.emit(projectId, "stdout", cleaned);
      const match = detectPreviewUrlFromOutput(cleaned);
      if (match) {
        this.applyPreviewUrl(projectId, match, "output");
      }
    });

    ptyProcess.onExit(({ exitCode, signal }) => {
      this.running.delete(projectId);
      const existing = this.getState(projectId);
      this.setState(projectId, {
        running: false,
        pid: undefined,
        lastExitCode: exitCode,
        updatedAt: nowIso()
      });
      this.emit(projectId, "exit", `Exited with code ${exitCode}${signal ? ` signal ${signal}` : ""}`);
      // Keep the accumulated output and command metadata in state.
      this.states.set(projectId, {
        ...existing,
        running: false,
        pid: undefined,
        lastExitCode: exitCode,
        updatedAt: nowIso()
      });
    });

    return this.getState(projectId);
  }

  stop(projectId: string): { ok: boolean } {
    const running = this.running.get(projectId);
    if (!running) {
      return { ok: false };
    }

    try {
      running.ptyProcess.kill();
    } catch {
      return { ok: false };
    }

    this.running.delete(projectId);
    this.setState(projectId, {
      running: false,
      pid: undefined,
      updatedAt: nowIso()
    });
    this.emit(projectId, "status", "Stopped");
    return { ok: true };
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

  private setState(projectId: string, patch: Partial<ProjectTerminalState>) {
    const current = this.states.get(projectId) ?? this.getState(projectId);
    this.states.set(projectId, {
      ...current,
      ...patch,
      updatedAt: patch.updatedAt ?? nowIso()
    });
  }
}
