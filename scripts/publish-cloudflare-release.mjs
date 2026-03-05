#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readdir, readFile, stat, writeFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { spawn } from "node:child_process";

const INSTALLER_PATTERN = /^GameraCode Setup (\d+\.\d+\.\d+)\.exe$/;
const DEFAULT_RELEASE_DIR = resolve(process.cwd(), "apps/desktop/main/release");
const DEFAULT_PREFIX = "gameracode";
const DEFAULT_ENV_FILE = resolve(process.cwd(), ".env.release");

const parseDotEnvContents = (contents) => {
  const result = {};
  const lines = contents.split(/\r?\n/);
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }
    const separatorIndex = line.indexOf("=");
    if (separatorIndex <= 0) {
      continue;
    }
    const key = line.slice(0, separatorIndex).trim();
    let value = line.slice(separatorIndex + 1).trim();
    if (
      (value.startsWith("\"") && value.endsWith("\"")) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!key) {
      continue;
    }
    result[key] = value;
  }
  return result;
};

const loadReleaseEnvFile = async () => {
  try {
    const contents = await readFile(DEFAULT_ENV_FILE, "utf8");
    return parseDotEnvContents(contents);
  } catch {
    return {};
  }
};

const parseArgs = (argv, envOverrides) => {
  const getEnv = (key) => process.env[key]?.trim() || envOverrides[key]?.trim() || "";
  const args = {
    bucket: getEnv("CF_R2_BUCKET"),
    prefix: getEnv("CF_R2_PREFIX") || DEFAULT_PREFIX,
    releaseDir: getEnv("CF_RELEASE_DIR") || DEFAULT_RELEASE_DIR,
    version: "",
    dryRun: false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];
    if (current === "--bucket") {
      args.bucket = argv[index + 1] ?? "";
      index += 1;
      continue;
    }
    if (current === "--prefix") {
      args.prefix = argv[index + 1] ?? "";
      index += 1;
      continue;
    }
    if (current === "--release-dir") {
      args.releaseDir = argv[index + 1] ?? "";
      index += 1;
      continue;
    }
    if (current === "--version") {
      args.version = argv[index + 1] ?? "";
      index += 1;
      continue;
    }
    if (current === "--dry-run") {
      args.dryRun = true;
      continue;
    }
    throw new Error(`Unknown argument: ${current}`);
  }

  if (!args.bucket) {
    throw new Error("Missing bucket. Set CF_R2_BUCKET or pass --bucket <name>.");
  }
  if (!args.releaseDir) {
    throw new Error("Missing release directory. Set CF_RELEASE_DIR or pass --release-dir <path>.");
  }

  args.releaseDir = resolve(process.cwd(), args.releaseDir);
  args.prefix = args.prefix.replace(/^\/+|\/+$/g, "");
  return args;
};

const parseVersion = (version) => {
  const [majorRaw, minorRaw, patchRaw] = version.split(".");
  const major = Number.parseInt(majorRaw ?? "", 10);
  const minor = Number.parseInt(minorRaw ?? "", 10);
  const patch = Number.parseInt(patchRaw ?? "", 10);
  if (!Number.isFinite(major) || !Number.isFinite(minor) || !Number.isFinite(patch)) {
    return null;
  }
  return { major, minor, patch };
};

const compareVersions = (left, right) => {
  const a = parseVersion(left);
  const b = parseVersion(right);
  if (!a || !b) {
    return left.localeCompare(right);
  }
  if (a.major !== b.major) return a.major - b.major;
  if (a.minor !== b.minor) return a.minor - b.minor;
  return a.patch - b.patch;
};

const findInstallerFile = async (releaseDir, preferredVersion) => {
  const names = await readdir(releaseDir);
  const candidates = names
    .map((name) => {
      const match = INSTALLER_PATTERN.exec(name);
      if (!match || !match[1]) {
        return null;
      }
      return { name, version: match[1] };
    })
    .filter((value) => value !== null);

  if (candidates.length === 0) {
    throw new Error(`No installer matching "${INSTALLER_PATTERN}" found in ${releaseDir}`);
  }

  if (preferredVersion) {
    const explicit = candidates.find((item) => item.version === preferredVersion);
    if (!explicit) {
      throw new Error(`Installer for version ${preferredVersion} not found in ${releaseDir}`);
    }
    return explicit;
  }

  candidates.sort((left, right) => compareVersions(left.version, right.version));
  return candidates[candidates.length - 1];
};

const toPosixPath = (value) => value.replace(/\\/g, "/");

const buildLatestYml = ({ version, installerName, sha512, size }) => `version: ${version}
files:
  - url: ${installerName}
    sha512: ${sha512}
    size: ${size}
path: ${installerName}
sha512: ${sha512}
releaseDate: '${new Date().toISOString()}'
`;

const computeFileSha512Base64 = async (filePath) => {
  const content = await readFile(filePath);
  return createHash("sha512").update(content).digest("base64");
};

const runCommand = (command, args, cwd, dryRun) =>
  new Promise((resolvePromise, rejectPromise) => {
    const printable = [command, ...args].join(" ");
    if (dryRun) {
      console.log(`[dry-run] ${printable}`);
      resolvePromise();
      return;
    }

    const child = spawn(command, args, {
      cwd,
      stdio: "inherit",
      shell: false
    });
    child.on("error", (error) => rejectPromise(error));
    child.on("close", (code) => {
      if (code === 0) {
        resolvePromise();
        return;
      }
      rejectPromise(new Error(`${printable} exited with code ${code ?? "unknown"}`));
    });
  });

const uploadObject = async ({ bucket, key, filePath, cwd, dryRun }) => {
  const wranglerExecutable = process.platform === "win32" ? "npx.cmd" : "npx";
  const target = `${bucket}/${toPosixPath(key)}`;
  await runCommand(
    wranglerExecutable,
    ["--yes", "wrangler", "r2", "object", "put", target, "--file", filePath, "--remote"],
    cwd,
    dryRun
  );
};

const main = async () => {
  const envFromFile = await loadReleaseEnvFile();
  const args = parseArgs(process.argv.slice(2), envFromFile);
  const installer = await findInstallerFile(args.releaseDir, args.version);
  const installerPath = join(args.releaseDir, installer.name);
  const blockmapPath = `${installerPath}.blockmap`;
  const latestYmlPath = join(args.releaseDir, "latest.yml");

  const installerStats = await stat(installerPath);
  const installerSha512 = await computeFileSha512Base64(installerPath);
  const latestYml = buildLatestYml({
    version: installer.version,
    installerName: installer.name,
    sha512: installerSha512,
    size: installerStats.size
  });
  if (!args.dryRun) {
    await writeFile(latestYmlPath, latestYml, "utf8");
  }

  const hasBlockmap = await stat(blockmapPath)
    .then(() => true)
    .catch(() => false);

  const prefix = args.prefix ? `${args.prefix}/` : "";
  const filesToUpload = [
    { localPath: latestYmlPath, remoteName: basename(latestYmlPath) },
    { localPath: installerPath, remoteName: installer.name }
  ];
  if (hasBlockmap) {
    filesToUpload.push({ localPath: blockmapPath, remoteName: `${installer.name}.blockmap` });
  }

  console.log(`Publishing version ${installer.version}`);
  console.log(`Release dir: ${args.releaseDir}`);
  console.log(`Bucket: ${args.bucket}`);
  console.log(`Prefix: ${args.prefix || "(root)"}`);
  console.log(`${args.dryRun ? "Would generate" : "Generated"} latest.yml -> ${latestYmlPath}`);

  for (const file of filesToUpload) {
    const key = `${prefix}${file.remoteName}`;
    await uploadObject({
      bucket: args.bucket,
      key,
      filePath: file.localPath,
      cwd: process.cwd(),
      dryRun: args.dryRun
    });
  }

  const trimmedPrefix = toPosixPath(args.prefix || "").replace(/^\/+|\/+$/g, "");
  const baseUrl = trimmedPrefix
    ? `https://download.isaacstuff.com/${trimmedPrefix}`
    : "https://download.isaacstuff.com";
  console.log("Upload complete.");
  console.log(`latest.yml URL: ${baseUrl}/latest.yml`);
};

main().catch((error) => {
  console.error(`[publish-cloudflare-release] ${String(error)}`);
  process.exitCode = 1;
});
