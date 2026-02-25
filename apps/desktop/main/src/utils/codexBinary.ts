import { existsSync } from "node:fs";
import path from "node:path";
import {
  asarUnpackedPath,
  resolveCodexPlatformTarget,
  resolvePlatformPackageRoot
} from "./codexPlatform";

const platformTriple = () => resolveCodexPlatformTarget(process.platform === "win32" ? "codex.exe" : "codex");

const isInsideAsar = (value: string) => value.includes(`${path.sep}app.asar${path.sep}`);

const resolveSpawnablePath = (candidate: string): string | undefined => {
  if (!candidate) {
    return undefined;
  }

  if (!isInsideAsar(candidate)) {
    return existsSync(candidate) ? candidate : undefined;
  }

  const unpacked = asarUnpackedPath(candidate);
  if (unpacked !== candidate && existsSync(unpacked)) {
    return unpacked;
  }

  return undefined;
};

export const resolveCodexBinaryPath = (): string | undefined => {
  const target = platformTriple();
  if (!target) {
    return undefined;
  }

  const bundledPath = path.join(process.resourcesPath, "codex-bin", target.triple, target.binaryName);
  if (existsSync(bundledPath)) {
    return bundledPath;
  }

  try {
    const platformRoot = resolvePlatformPackageRoot(target.packageName);
    const binaryPath = path.join(platformRoot, "vendor", target.triple, "codex", target.binaryName);

    const spawnableBinaryPath = resolveSpawnablePath(binaryPath);
    if (spawnableBinaryPath) {
      return spawnableBinaryPath;
    }

    const unpackedBinaryPath = asarUnpackedPath(binaryPath);
    const spawnableUnpackedBinaryPath = resolveSpawnablePath(unpackedBinaryPath);
    if (spawnableUnpackedBinaryPath) {
      return spawnableUnpackedBinaryPath;
    }
  } catch {
    return undefined;
  }

  return undefined;
};
