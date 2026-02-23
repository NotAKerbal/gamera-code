import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = resolve(__dirname, "..");

const run = (command, label) =>
  new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(command, {
      cwd: rootDir,
      stdio: "inherit",
      env: process.env,
      shell: true
    });

    child.on("error", (error) => {
      rejectPromise(new Error(`${label} failed to start: ${String(error)}`));
    });

    child.on("exit", (code) => {
      resolvePromise(code ?? 1);
    });
  });

const start = () => {
  const children = [];
  let exiting = false;

  const stopAll = (exitCode) => {
    if (exiting) {
      return;
    }
    exiting = true;

    for (const child of children) {
      if (!child.killed) {
        child.kill("SIGTERM");
      }
    }

    process.exit(exitCode);
  };

  const commands = [
    "npm run dev:shared",
    "npm run dev:renderer",
    "npm run dev:main",
    "npm run dev:electron"
  ];

  for (const command of commands) {
    const child = spawn(command, {
      cwd: rootDir,
      stdio: "inherit",
      env: process.env,
      shell: true
    });
    children.push(child);

    child.on("error", (error) => {
      process.stderr.write(`Failed to start '${command}': ${String(error)}\n`);
      stopAll(1);
    });

    child.on("exit", (code) => {
      if (exiting) {
        return;
      }
      stopAll(code ?? 1);
    });
  }

  process.on("SIGINT", () => stopAll(130));
  process.on("SIGTERM", () => stopAll(143));
};

const main = async () => {
  const ensureCode = await run("npm run ensure:native", "ensure:native");
  if (ensureCode !== 0) {
    process.exit(ensureCode);
  }
  start();
};

main().catch((error) => {
  process.stderr.write(`Dev startup failed: ${String(error)}\n`);
  process.exit(1);
});
