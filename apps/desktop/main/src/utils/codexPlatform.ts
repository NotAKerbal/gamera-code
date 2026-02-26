import path from "node:path";

export interface CodexPlatformTarget {
  triple: string;
  packageName: string;
  binaryName: string;
}

const PLATFORM_TARGETS: Record<string, { triple: string; packageName: string }> = {
  "darwin-arm64": {
    triple: "aarch64-apple-darwin",
    packageName: "@openai/codex-darwin-arm64"
  },
  "darwin-x64": {
    triple: "x86_64-apple-darwin",
    packageName: "@openai/codex-darwin-x64"
  },
  "linux-arm64": {
    triple: "aarch64-unknown-linux-musl",
    packageName: "@openai/codex-linux-arm64"
  },
  "linux-x64": {
    triple: "x86_64-unknown-linux-musl",
    packageName: "@openai/codex-linux-x64"
  },
  "win32-arm64": {
    triple: "aarch64-pc-windows-msvc",
    packageName: "@openai/codex-win32-arm64"
  },
  "win32-x64": {
    triple: "x86_64-pc-windows-msvc",
    packageName: "@openai/codex-win32-x64"
  }
};

export const resolveCodexPlatformTarget = (binaryName: string): CodexPlatformTarget | null => {
  const key = `${process.platform}-${process.arch}`;
  const target = PLATFORM_TARGETS[key];
  if (!target) {
    return null;
  }

  return {
    ...target,
    binaryName
  };
};

export const asarUnpackedPath = (value: string) =>
  value.replace(`${path.sep}app.asar${path.sep}`, `${path.sep}app.asar.unpacked${path.sep}`);

export const resolvePlatformPackageRoot = (packageName: string): string => {
  const codexPackageJson = require.resolve("@openai/codex/package.json");
  const codexRoot = path.dirname(codexPackageJson);
  try {
    return path.dirname(require.resolve(`${packageName}/package.json`, { paths: [codexRoot] }));
  } catch {
    return path.dirname(require.resolve(`${packageName}/package.json`));
  }
};
