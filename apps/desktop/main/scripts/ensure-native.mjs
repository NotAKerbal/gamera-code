import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const appPath = resolve(__dirname, "..");
const npmCmd = process.platform === "win32" ? "npm.cmd" : "npm";

const runScript = (name) =>
  new Promise((resolvePromise) => {
    const child = spawn(npmCmd, ["run", name], {
      cwd: appPath,
      stdio: "inherit",
      env: process.env
    });

    child.on("exit", (code) => {
      resolvePromise(code ?? 1);
    });
  });

const run = async () => {
  const initialCheck = await runScript("check:native");
  if (initialCheck === 0) {
    process.stdout.write("Native modules already match Electron ABI.\n");
    return;
  }

  process.stdout.write("Native check failed. Rebuilding native modules for Electron...\n");
  const rebuild = await runScript("rebuild:native");
  if (rebuild !== 0) {
    process.exit(rebuild);
  }

  const finalCheck = await runScript("check:native");
  if (finalCheck !== 0) {
    process.stderr.write("Native modules still do not match Electron ABI after rebuild.\n");
    process.exit(finalCheck);
  }

  process.stdout.write("Native modules verified for Electron ABI.\n");
};

run().catch((error) => {
  process.stderr.write(`Native ensure failed: ${String(error)}\n`);
  process.exit(1);
});
