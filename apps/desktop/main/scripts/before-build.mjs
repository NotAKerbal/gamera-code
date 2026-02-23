/**
 * electron-builder beforeBuild hook.
 *
 * In an npm-workspaces monorepo the shared node_modules lives at the repo
 * root.  electron-builder's default "install production dependencies" step
 * runs `npm install --production` inside the workspace, which removes
 * devDependencies (including electron-builder itself and app-builder-bin)
 * from the shared tree — breaking the build mid-flight.
 *
 * This hook installs production deps into a LOCAL node_modules inside the
 * app directory (isolated from the workspace root), then returns `false`
 * so electron-builder skips its own destructive npm install.
 */

import { execSync } from "node:child_process";
import {
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";

export default async function beforeBuild(context) {
  const { appDir, electronVersion } = context;
  const repoRoot = join(appDir, "..", "..", "..");

  const tempDir = join(repoRoot, ".prod-install-temp");
  const localNM = join(appDir, "node_modules");

  // ── 1. Clean previous runs ────────────────────────────────────────
  for (const d of [tempDir, localNM]) {
    if (existsSync(d)) rmSync(d, { recursive: true, force: true });
  }
  mkdirSync(tempDir, { recursive: true });

  // ── 2. Create a standalone package.json (no workspace refs) ───────
  const pkg = JSON.parse(readFileSync(join(appDir, "package.json"), "utf8"));
  const deps = { ...pkg.dependencies };
  delete deps["@code-app/shared"]; // copied manually below

  writeFileSync(
    join(tempDir, "package.json"),
    JSON.stringify(
      { name: pkg.name, version: pkg.version, dependencies: deps },
      null,
      2
    )
  );

  // ── 3. Install production deps in an isolated temp directory ──────
  console.log("  • installing production dependencies (workspace-safe)");
  execSync("npm install --omit=dev --prefer-offline", {
    cwd: tempDir,
    stdio: "inherit",
    env: { ...process.env, npm_config_workspaces: "false" },
  });

  // ── 4. Move node_modules into the app directory ───────────────────
  cpSync(join(tempDir, "node_modules"), localNM, { recursive: true });

  // ── 5. Copy the workspace package @code-app/shared ────────────────
  const sharedSrc = join(repoRoot, "apps", "desktop", "shared");
  const sharedDst = join(localNM, "@code-app", "shared");
  mkdirSync(sharedDst, { recursive: true });
  copyFileSync(join(sharedSrc, "package.json"), join(sharedDst, "package.json"));
  if (existsSync(join(sharedSrc, "dist"))) {
    cpSync(join(sharedSrc, "dist"), join(sharedDst, "dist"), {
      recursive: true,
    });
  }

  // ── 6. Rebuild native modules for Electron ────────────────────────
  console.log(
    `  • rebuilding native modules for Electron ${electronVersion}`
  );
  try {
    execSync(
      `npx @electron/rebuild --version ${electronVersion} --module-dir "${appDir}"`,
      { cwd: repoRoot, stdio: "inherit" }
    );
  } catch (e) {
    console.warn("  • native module rebuild warning:", e.message);
  }

  // ── 7. Tidy up (delayed until process exit so symlinks survive packaging) ─
  process.on("exit", () => {
    try {
      if (existsSync(tempDir)) rmSync(tempDir, { recursive: true, force: true });
    } catch {}
    try {
      if (existsSync(localNM)) rmSync(localNM, { recursive: true, force: true });
    } catch {}
  });

  console.log("  • production dependencies ready");

  return false;
}
