import { spawn } from "node:child_process";

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

export const createCommandRunner = (): CommandRunner => ({
  async run(command, args = [], cwd) {
    return new Promise((resolve) => {
      const child = spawn(command, args, {
        cwd,
        shell: process.platform === "win32",
        env: process.env
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
      const child = spawn(command, args, {
        cwd: options.cwd,
        shell: process.platform === "win32",
        env: process.env
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
