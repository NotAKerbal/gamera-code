import { spawn } from "node:child_process";
import { withRuntimePath } from "./runtimeEnv";

export interface RunCommandResult {
  code: number;
  stdout: string;
  stderr: string;
}

export interface CommandRunner {
  run: (command: string, args?: string[], cwd?: string) => Promise<RunCommandResult>;
  stream: (
    command: string,
    args: string[],
    options: { cwd?: string; onData: (line: string) => void }
  ) => Promise<RunCommandResult>;
}

const WINDOWS_SHELL_META = /[\s"&|<>^()]/;

const quoteForWindowsShell = (value: string): string => {
  if (value.length === 0) {
    return "\"\"";
  }

  const escaped = value.replace(/"/g, "\\\"").replace(/%/g, "%%");
  return WINDOWS_SHELL_META.test(value) ? `"${escaped}"` : escaped;
};

const buildSpawnInput = (command: string, args: string[]) => {
  if (process.platform !== "win32") {
    return {
      command,
      args,
      shell: false
    };
  }

  const commandLine = [command, ...args].map(quoteForWindowsShell).join(" ");
  return {
    command: commandLine,
    args: [] as string[],
    shell: true
  };
};

export const createCommandRunner = (): CommandRunner => ({
  async run(command, args = [], cwd) {
    return new Promise((resolve) => {
      const run = buildSpawnInput(command, args);
      const child = spawn(run.command, run.args, {
        cwd,
        shell: run.shell,
        env: withRuntimePath(process.env)
      });

      let stdout = "";
      let stderr = "";

      child.stdout.on("data", (chunk) => {
        stdout += chunk.toString();
      });

      child.stderr.on("data", (chunk) => {
        stderr += chunk.toString();
      });

      child.on("close", (code) => {
        resolve({ code: code ?? 1, stdout: stdout.trim(), stderr: stderr.trim() });
      });

      child.on("error", (error) => {
        resolve({ code: 1, stdout, stderr: error.message });
      });
    });
  },

  async stream(command, args, options) {
    return new Promise((resolve) => {
      const run = buildSpawnInput(command, args);
      const child = spawn(run.command, run.args, {
        cwd: options.cwd,
        shell: run.shell,
        env: withRuntimePath(process.env)
      });

      let stdout = "";
      let stderr = "";

      child.stdout.on("data", (chunk) => {
        const text = chunk.toString();
        stdout += text;
        options.onData(text);
      });

      child.stderr.on("data", (chunk) => {
        const text = chunk.toString();
        stderr += text;
        options.onData(text);
      });

      child.on("close", (code) => {
        resolve({ code: code ?? 1, stdout: stdout.trim(), stderr: stderr.trim() });
      });

      child.on("error", (error) => {
        options.onData(error.message);
        resolve({ code: 1, stdout, stderr: error.message });
      });
    });
  }
});
