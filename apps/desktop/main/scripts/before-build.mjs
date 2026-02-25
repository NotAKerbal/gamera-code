/**
 * electron-builder beforeBuild hook.
 *
 * In this npm-workspaces repo, electron-builder's default dependency install
 * can mutate the shared root node_modules tree. We skip that step by returning
 * false and package the currently-installed workspace dependencies as-is.
 *
 * npm workspaces hoists most packages to the repo root node_modules. Symlinks
 * and packages outside the app directory are NOT followed by asar packaging,
 * so we physically copy every production dependency (and its transitive deps)
 * into the app's local node_modules before the build.
 */

import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  lstatSync,
  rmSync,
} from "node:fs";
import { join, dirname } from "node:path";

/**
 * Resolve the real directory for a package, checking the app's local
 * node_modules first, then falling back to the root node_modules.
 */
function findPackageDir(name, localNodeModules, rootNodeModules) {
  const localPath = join(localNodeModules, name);
  if (existsSync(localPath)) {
    const stat = lstatSync(localPath);
    if (stat.isDirectory() && !stat.isSymbolicLink()) {
      return null; // already a real directory locally
    }
  }

  const rootPath = join(rootNodeModules, name);
  if (existsSync(rootPath)) {
    const stat = lstatSync(rootPath);
    // Follow symlinks (workspace packages are junctions in root node_modules)
    if (stat.isDirectory() || stat.isSymbolicLink()) {
      return rootPath;
    }
  }

  return null;
}

/**
 * Read a package.json and return its production dependency names
 * (dependencies + optionalDependencies).
 */
function readProdDeps(packageJsonPath) {
  if (!existsSync(packageJsonPath)) return [];
  const raw = JSON.parse(readFileSync(packageJsonPath, "utf8"));
  return [
    ...Object.keys(raw.dependencies ?? {}),
    ...Object.keys(raw.optionalDependencies ?? {}),
  ];
}

/**
 * Recursively collect all production dependencies starting from the app's
 * package.json, walking transitive deps.
 */
function collectAllDeps(appDir, localNodeModules, rootNodeModules) {
  const visited = new Set();
  const toCopy = new Map(); // name -> source dir

  const walk = (depName) => {
    if (visited.has(depName)) return;
    visited.add(depName);

    const src = findPackageDir(depName, localNodeModules, rootNodeModules);
    if (src) {
      toCopy.set(depName, src);
    }

    // Resolve the actual location to read transitive deps from
    const resolvedDir = src ?? join(localNodeModules, depName);
    const pkgJson = join(resolvedDir, "package.json");
    for (const child of readProdDeps(pkgJson)) {
      walk(child);
    }
  };

  const appPkgJson = join(appDir, "package.json");
  for (const dep of readProdDeps(appPkgJson)) {
    walk(dep);
  }

  return toCopy;
}

/**
 * Special handling for workspace packages: copy source package.json + dist
 * rather than the root node_modules symlink target.
 */
function copyWorkspacePackage(name, repoRoot, localNodeModules) {
  if (name === "@code-app/shared") {
    const sharedSrc = join(repoRoot, "apps", "desktop", "shared");
    const sharedDst = join(localNodeModules, "@code-app", "shared");

    if (!existsSync(sharedSrc)) {
      throw new Error("Cannot find @code-app/shared source at " + sharedSrc);
    }

    mkdirSync(sharedDst, { recursive: true });
    cpSync(join(sharedSrc, "package.json"), join(sharedDst, "package.json"));
    if (existsSync(join(sharedSrc, "dist"))) {
      cpSync(join(sharedSrc, "dist"), join(sharedDst, "dist"), {
        recursive: true,
      });
    }
    console.log(`  - copied ${name} (workspace) into app node_modules`);
    return true;
  }
  return false;
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

  // Collect every production dependency (direct + transitive) that's hoisted
  const toCopy = collectAllDeps(appDir, localNodeModules, rootNodeModules);

  // Handle workspace packages specially
  const workspacePackages = ["@code-app/shared"];
  for (const wp of workspacePackages) {
    copyWorkspacePackage(wp, repoRoot, localNodeModules);
    toCopy.delete(wp);
  }

  // Copy all remaining hoisted packages into local node_modules
  for (const [name, src] of toCopy) {
    const dst = join(localNodeModules, name);

    // Remove stale symlinks/junctions/old copies
    try {
      const stat = lstatSync(dst);
      if (stat) rmSync(dst, { recursive: true, force: true });
    } catch {
      // doesn't exist, that's fine
    }

    mkdirSync(dirname(dst), { recursive: true });
    cpSync(src, dst, { recursive: true });
    console.log(`  - copied ${name} into app node_modules`);
  }

  console.log(
    `  - ensured ${toCopy.size + workspacePackages.length} packages in app node_modules`
  );
  console.log("  - skipping electron-builder dependency reinstall");

  return false;
}
