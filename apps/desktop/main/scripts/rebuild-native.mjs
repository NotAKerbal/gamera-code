import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { rebuild } from "@electron/rebuild";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const workspaceRoot = resolve(__dirname, "../../../..");
const appPath = resolve(__dirname, "..");
const cacheHome = resolve(workspaceRoot, ".cache-home");
const gypDir = resolve(workspaceRoot, ".electron-gyp");

mkdirSync(cacheHome, { recursive: true });
mkdirSync(gypDir, { recursive: true });

process.env.HOME = cacheHome;
process.env.USERPROFILE = cacheHome;
process.env.npm_config_devdir = gypDir;

const electronVersion = "35.0.1";
const buildFromSource = process.env.CODE_APP_NATIVE_BUILD_FROM_SOURCE === "1";

const run = async () => {
  await rebuild({
    // Electron rebuild expects the app directory containing package.json.
    buildPath: appPath,
    // Ensure hoisted workspace dependencies are discovered from the monorepo root.
    projectRootPath: workspaceRoot,
    electronVersion,
    force: true,
    buildFromSource,
    onlyModules: ["better-sqlite3", "node-pty"],
    mode: process.platform === "win32" ? "sequential" : "parallel"
  });

  process.stdout.write("Native modules rebuilt for Electron 35.0.1\n");
};

run().catch((error) => {
  process.stderr.write(`Native rebuild failed: ${String(error)}\n`);
  process.exit(1);
});
