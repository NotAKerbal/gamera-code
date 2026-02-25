import { existsSync } from "node:fs";
import path from "node:path";

const platformTriple = (): { triple: string; packageName: string; binaryName: string } | null => {
  const binaryName = process.platform === "win32" ? "codex.exe" : "codex";

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
    const codexPackageJson = require.resolve("@openai/codex/package.json");
    const codexRoot = path.dirname(codexPackageJson);
    let platformPackageJson: string;
    try {
      platformPackageJson = require.resolve(`${target.packageName}/package.json`, { paths: [codexRoot] });
    } catch {
      platformPackageJson = require.resolve(`${target.packageName}/package.json`);
    }
    const platformRoot = path.dirname(platformPackageJson);
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
