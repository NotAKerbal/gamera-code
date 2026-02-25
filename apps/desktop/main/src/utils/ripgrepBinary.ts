import { existsSync } from "node:fs";
import path from "node:path";
import {
  asarUnpackedPath,
  resolveCodexPlatformTarget,
  resolvePlatformPackageRoot
} from "./codexPlatform";

const platformTarget = () => resolveCodexPlatformTarget(process.platform === "win32" ? "rg.exe" : "rg");

const splitPathEntries = (value: string) =>
  value
    .split(path.delimiter)
    .map((entry) => entry.trim())
    .filter(Boolean);

const joinPathEntries = (entries: string[]) => entries.join(path.delimiter);

export const resolveBundledRipgrepBinaryPath = (): string | undefined => {
  const target = platformTarget();
  if (!target) {
    return undefined;
  }

  try {
    const platformRoot = resolvePlatformPackageRoot(target.packageName);
    const binaryPath = path.join(platformRoot, "vendor", target.triple, "path", target.binaryName);

    if (existsSync(binaryPath)) {
      const unpacked = asarUnpackedPath(binaryPath);
      if (unpacked !== binaryPath && existsSync(unpacked)) {
        return unpacked;
      }
      return binaryPath;
    }

    const unpackedBinaryPath = asarUnpackedPath(binaryPath);
    if (existsSync(unpackedBinaryPath)) {
      return unpackedBinaryPath;
    }
  } catch {
    return undefined;
  }

  return undefined;
};

export const withBundledRipgrepInPath = (inputEnv: NodeJS.ProcessEnv): NodeJS.ProcessEnv => {
  const rgBinary = resolveBundledRipgrepBinaryPath();
  if (!rgBinary) {
    return inputEnv;
  }

  const rgDir = path.dirname(rgBinary);
  const currentPath = inputEnv.PATH ?? inputEnv.Path ?? "";
  const entries = splitPathEntries(currentPath);
  const hasEntry =
    process.platform === "win32"
      ? entries.some((entry) => entry.toLowerCase() === rgDir.toLowerCase())
      : entries.includes(rgDir);

  if (hasEntry) {
    return inputEnv;
  }

  const nextEntries = [rgDir, ...entries];
  const nextPath = joinPathEntries(nextEntries);
  const env: NodeJS.ProcessEnv = {
    ...inputEnv,
    PATH: nextPath
  };

  if (process.platform === "win32") {
    env.Path = nextPath;
  }

  return env;
};
