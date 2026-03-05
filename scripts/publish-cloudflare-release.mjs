#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readdir, readFile, stat, writeFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { spawn } from "node:child_process";

const INSTALLER_PATTERN = /^GameraCode Setup (\d+\.\d+\.\d+)\.exe$/;
const DEFAULT_RELEASE_DIR = resolve(process.cwd(), "apps/desktop/main/release");
const DEFAULT_PREFIX = "gameracode";
const DEFAULT_ENV_FILE = resolve(process.cwd(), ".env.release");
const SUPPORTED_PLATFORMS = new Set(["win", "mac", "linux"]);

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
    platform: getEnv("CF_RELEASE_PLATFORM") || "win",
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
    if (current === "--platform") {
      args.platform = argv[index + 1] ?? "";
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
  if (!SUPPORTED_PLATFORMS.has(args.platform)) {
    throw new Error(`Invalid platform "${args.platform}". Use one of: win, mac, linux.`);
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

const getChannelFilenameForPlatform = (platform) => {
  if (platform === "win") {
    return "latest.yml";
  }
  if (platform === "mac") {
    return "latest-mac.yml";
  }
  return "latest-linux.yml";
};

const parseChannelYml = (contents) => {
  const versionMatch = contents.match(/^version:\s*([^\r\n]+)\s*$/m);
  const urlMatches = Array.from(contents.matchAll(/^\s*url:\s*([^\r\n]+)\s*$/gm));
  const pathMatch = contents.match(/^\s*path:\s*([^\r\n]+)\s*$/m);

  const files = [];
  for (const match of urlMatches) {
    const raw = match[1]?.trim();
    if (!raw) {
      continue;
    }
    files.push(raw.replace(/^["']|["']$/g, ""));
  }
  if (pathMatch?.[1]) {
    files.push(pathMatch[1].trim().replace(/^["']|["']$/g, ""));
  }

  return {
    version: versionMatch?.[1]?.trim().replace(/^["']|["']$/g, "") || "",
    files: Array.from(new Set(files))
  };
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

const prepareWindowsPublish = async (args) => {
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

  const filesToUpload = [
    { localPath: latestYmlPath, remoteName: basename(latestYmlPath) },
    { localPath: installerPath, remoteName: installer.name }
  ];
  if (hasBlockmap) {
    filesToUpload.push({ localPath: blockmapPath, remoteName: `${installer.name}.blockmap` });
  }

  return {
    version: installer.version,
    channelFilePath: latestYmlPath,
    filesToUpload
  };
};

const prepareYamlBasedPublish = async (args, platform) => {
  const channelFile = getChannelFilenameForPlatform(platform);
  const channelFilePath = join(args.releaseDir, channelFile);
  let channelContents = "";
  try {
    channelContents = await readFile(channelFilePath, "utf8");
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      throw new Error(`Missing ${channelFilePath}. Run the matching package command first (e.g. npm run package:${platform}).`);
    }
    throw error;
  }
  const parsed = parseChannelYml(channelContents);

  if (!parsed.version) {
    throw new Error(`Could not parse version from ${channelFilePath}`);
  }
  if (args.version && parsed.version !== args.version) {
    throw new Error(`Version mismatch: ${channelFile} has ${parsed.version}, expected ${args.version}`);
  }
  if (parsed.files.length === 0) {
    throw new Error(`No artifact URLs found in ${channelFilePath}`);
  }

  const filesToUpload = [{ localPath: channelFilePath, remoteName: channelFile }];
  for (const file of parsed.files) {
    const localPath = join(args.releaseDir, file);
    await stat(localPath);
    filesToUpload.push({ localPath, remoteName: file });
  }

  return {
    version: parsed.version,
    channelFilePath,
    filesToUpload
  };
};

const main = async () => {
  const envFromFile = await loadReleaseEnvFile();
  const args = parseArgs(process.argv.slice(2), envFromFile);
  const publishPlan =
    args.platform === "win"
      ? await prepareWindowsPublish(args)
      : await prepareYamlBasedPublish(args, args.platform);

  const prefix = args.prefix ? `${args.prefix}/` : "";
  console.log(`Publishing ${args.platform} version ${publishPlan.version}`);
  console.log(`Release dir: ${args.releaseDir}`);
  console.log(`Bucket: ${args.bucket}`);
  console.log(`Prefix: ${args.prefix || "(root)"}`);
  if (args.platform === "win") {
    console.log(
      `${args.dryRun ? "Would generate" : "Generated"} ${basename(publishPlan.channelFilePath)} -> ${publishPlan.channelFilePath}`
    );
  } else {
    console.log(`Using generated channel file ${publishPlan.channelFilePath}`);
  }

  for (const file of publishPlan.filesToUpload) {
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
  console.log(`${basename(publishPlan.channelFilePath)} URL: ${baseUrl}/${basename(publishPlan.channelFilePath)}`);
};

main().catch((error) => {
  console.error(`[publish-cloudflare-release] ${String(error)}`);
  process.exitCode = 1;
});
