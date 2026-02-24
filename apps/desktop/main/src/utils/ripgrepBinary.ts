import { existsSync } from "node:fs";
import path from "node:path";

const platformTarget = (): { triple: string; packageName: string; binaryName: string } | null => {
  const binaryName = process.platform === "win32" ? "rg.exe" : "rg";

  if (process.platform === "darwin" && process.arch === "arm64") {
    return {
      triple: "aarch64-apple-darwin",
      packageName: "@openai/codex-darwin-arm64",
      binaryName
    };
  }

  if (process.platform === "darwin" && process.arch === "x64") {
    return {
      triple: "x86_64-apple-darwin",
      packageName: "@openai/codex-darwin-x64",
      binaryName
    };
  }

  if (process.platform === "linux" && process.arch === "arm64") {
    return {
      triple: "aarch64-unknown-linux-musl",
      packageName: "@openai/codex-linux-arm64",
      binaryName
    };
  }

  if (process.platform === "linux" && process.arch === "x64") {
    return {
      triple: "x86_64-unknown-linux-musl",
      packageName: "@openai/codex-linux-x64",
      binaryName
    };
  }

  if (process.platform === "win32" && process.arch === "arm64") {
    return {
      triple: "aarch64-pc-windows-msvc",
      packageName: "@openai/codex-win32-arm64",
      binaryName
    };
  }

  if (process.platform === "win32" && process.arch === "x64") {
    return {
      triple: "x86_64-pc-windows-msvc",
      packageName: "@openai/codex-win32-x64",
      binaryName
    };
  }

  return null;
};

const asarUnpackedPath = (value: string) =>
  value.replace(`${path.sep}app.asar${path.sep}`, `${path.sep}app.asar.unpacked${path.sep}`);

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
    const codexPackageJson = require.resolve("@openai/codex/package.json");
    const codexRoot = path.dirname(codexPackageJson);
    let platformPackageJson: string;
    try {
      platformPackageJson = require.resolve(`${target.packageName}/package.json`, { paths: [codexRoot] });
    } catch {
      platformPackageJson = require.resolve(`${target.packageName}/package.json`);
    }
    const platformRoot = path.dirname(platformPackageJson);
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
