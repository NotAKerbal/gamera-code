import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const appPath = resolve(__dirname, "..");
const nodeCmd = process.execPath;

const runScript = (scriptFile) =>
  new Promise((resolvePromise) => {
    const child = spawn(nodeCmd, [resolve(__dirname, scriptFile)], {
      cwd: appPath,
      stdio: "inherit",
      env: process.env
    });

    child.on("exit", (code) => {
      resolvePromise(code ?? 1);
    });
  });

const run = async () => {
  const initialCheck = await runScript("check-native.mjs");
  if (initialCheck === 0) {
    process.stdout.write("Native modules already match Electron ABI.\n");
    return;
  }

  process.stdout.write("Native check failed. Rebuilding native modules for Electron...\n");
  const rebuild = await runScript("rebuild-native.mjs");
  if (rebuild !== 0) {
    process.exit(rebuild);
  }

  const finalCheck = await runScript("check-native.mjs");
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
