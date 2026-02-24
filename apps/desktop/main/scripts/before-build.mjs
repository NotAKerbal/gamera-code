/**
 * electron-builder beforeBuild hook.
 *
 * In this npm-workspaces repo, electron-builder's default dependency install
 * can mutate the shared root node_modules tree. We skip that step by returning
 * false and package the currently-installed workspace dependencies as-is.
 *
 * Workspace packages (like @code-app/shared) are symlinked by npm into the
 * root node_modules. Symlinks pointing outside the app directory are NOT
 * followed by asar packaging, so we physically copy workspace packages into
 * the app's local node_modules before the build.
 *
 * Hoisted packages (like @openai/codex-sdk) that live only in the root
 * node_modules must also be copied so they resolve inside the asar.
 */

import { cpSync, existsSync, mkdirSync, readdirSync, lstatSync } from "node:fs";
import { join } from "node:path";

function copyPackage(src, dst) {
  mkdirSync(dst, { recursive: true });
  cpSync(src, dst, { recursive: true });
}

/**
 * Copy all @openai/* packages from root node_modules into the app's local
 * node_modules. This covers codex-sdk, codex, and the platform-specific
 * optional binary packages (e.g. codex-win32-x64).
 */
function copyHoistedOpenAiPackages(rootNodeModules, localNodeModules) {
  const scopeDir = join(rootNodeModules, "@openai");
  if (!existsSync(scopeDir)) {
    console.warn("  - WARNING: @openai scope not found in root node_modules");
    return;
  }

  const localScope = join(localNodeModules, "@openai");
  mkdirSync(localScope, { recursive: true });

  for (const entry of readdirSync(scopeDir)) {
    const src = join(scopeDir, entry);
    if (!lstatSync(src).isDirectory()) continue;
    const dst = join(localScope, entry);
    copyPackage(src, dst);
    console.log(`  - copied @openai/${entry} into app node_modules`);
  }
}

export default async function beforeBuild(context) {
  const { appDir } = context;
  const repoRoot = join(appDir, "..", "..", "..");
  const localNodeModules = join(appDir, "node_modules");
  const rootNodeModules = join(repoRoot, "node_modules");

  if (!existsSync(localNodeModules)) {
    throw new Error(
      "Missing app node_modules. Run npm install (repo root) before packaging."
    );
  }

  // Copy workspace package @code-app/shared so it's physically present
  // in the asar archive (symlinks to outside the app dir are not followed).
  const sharedSrc = join(repoRoot, "apps", "desktop", "shared");
  const sharedDst = join(localNodeModules, "@code-app", "shared");

  if (existsSync(sharedSrc)) {
    mkdirSync(sharedDst, { recursive: true });
    cpSync(join(sharedSrc, "package.json"), join(sharedDst, "package.json"));
    if (existsSync(join(sharedSrc, "dist"))) {
      cpSync(join(sharedSrc, "dist"), join(sharedDst, "dist"), {
        recursive: true,
      });
    }
    console.log("  - copied @code-app/shared into app node_modules");
  } else {
    throw new Error("Cannot find @code-app/shared source at " + sharedSrc);
  }

  // Copy hoisted @openai/* packages (codex-sdk, codex, platform binaries)
  // so dynamic import("@openai/codex-sdk") resolves inside the asar.
  copyHoistedOpenAiPackages(rootNodeModules, localNodeModules);

  console.log("  - using existing workspace dependencies");
  console.log("  - skipping electron-builder dependency reinstall");

  return false;
}
