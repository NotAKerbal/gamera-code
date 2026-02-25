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
 * All production dependencies (including transitive ones) that are hoisted
 * to the root node_modules are recursively copied into the app's local
 * node_modules so they resolve correctly inside the asar.
 */

import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  lstatSync,
} from "node:fs";
import { join } from "node:path";

const WORKSPACE_SCOPES = new Set(["@code-app"]);

/**
 * Recursively copy a production dependency and all of its transitive
 * production dependencies from rootNodeModules into localNodeModules.
 * Tracks already-copied packages in `visited` to avoid cycles.
 */
function copyDependencyTree(name, rootNodeModules, localNodeModules, visited) {
  if (visited.has(name)) return;
  visited.add(name);

  const src = join(rootNodeModules, ...name.split("/"));
  const dst = join(localNodeModules, ...name.split("/"));

  if (!existsSync(src)) {
    // May be an optional dependency not installed on this platform
    console.warn(`  - WARNING: ${name} not found in root node_modules (optional?)`);
    return;
  }
  if (existsSync(dst)) return;

  // For scoped packages, ensure the scope directory exists
  if (name.startsWith("@")) {
    const scope = name.split("/")[0];
    mkdirSync(join(localNodeModules, scope), { recursive: true });
  }

  cpSync(src, dst, { recursive: true });
  console.log(`  - copied ${name}`);

  // Recurse into this package's production dependencies
  const pkgJsonPath = join(src, "package.json");
  if (existsSync(pkgJsonPath)) {
    try {
      const pkg = JSON.parse(readFileSync(pkgJsonPath, "utf8"));
      for (const dep of Object.keys(pkg.dependencies || {})) {
        copyDependencyTree(dep, rootNodeModules, localNodeModules, visited);
      }
    } catch {
      // non-fatal: skip unreadable package.json
    }
  }
}

export default async function beforeBuild(context) {
  const { appDir } = context;
  const repoRoot = join(appDir, "..", "..", "..");
  const localNodeModules = join(appDir, "node_modules");
  const rootNodeModules = join(repoRoot, "node_modules");

  if (!existsSync(localNodeModules)) {
    console.log("  - app node_modules not found (hoisted by npm workspaces), creating it");
    mkdirSync(localNodeModules, { recursive: true });
  }

  // --- workspace package: @code-app/shared ---
  // Copy only package.json + dist (skip source/tests/configs)
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
    console.log("  - copied @code-app/shared (workspace)");
  } else {
    throw new Error("Cannot find @code-app/shared source at " + sharedSrc);
  }

  // --- all production dependencies (+ transitive) ---
  const appPkgJson = JSON.parse(readFileSync(join(appDir, "package.json"), "utf8"));
  const visited = new Set();

  // Mark workspace packages as already visited so we don't overwrite them
  for (const scope of WORKSPACE_SCOPES) {
    const scopeDir = join(rootNodeModules, scope);
    if (existsSync(scopeDir)) {
      for (const entry of readdirSync(scopeDir)) {
        visited.add(`${scope}/${entry}`);
      }
    }
  }

  for (const dep of Object.keys(appPkgJson.dependencies || {})) {
    copyDependencyTree(dep, rootNodeModules, localNodeModules, visited);
  }

  console.log("  - using existing workspace dependencies");
  console.log("  - skipping electron-builder dependency reinstall");

  return false;
}
