import os from "node:os";
import path from "node:path";
import { existsSync, statSync } from "node:fs";

const cleanPathToken = (token: string) => {
  const trimmed = token.trim().replace(/^"+|"+$/g, "");
  return trimmed;
};

const isDirectoryPath = (value: string) => {
  try {
    if (!existsSync(value)) {
      return true;
    }
    return statSync(value).isDirectory();
  } catch {
    return false;
  }
};

const uniquePathEntries = (entries: string[]) => {
  const seen = new Set<string>();
  const deduped: string[] = [];
  for (const rawEntry of entries) {
    const entry = cleanPathToken(rawEntry);
    if (!entry || seen.has(entry)) {
      continue;
    }
    if (!isDirectoryPath(entry)) {
      continue;
    }
    seen.add(entry);
    deduped.push(entry);
  }
  return deduped;
};

const defaultPathCandidates = () => {
  const home = os.homedir();
  const base = [path.dirname(process.execPath)];

  if (process.platform === "darwin") {
    return [
      ...base,
      "/opt/homebrew/bin",
      "/usr/local/bin",
      "/usr/bin",
      "/bin",
      "/usr/sbin",
      "/sbin",
      path.join(home, ".volta", "bin"),
      path.join(home, "bin")
    ];
  }

  if (process.platform === "win32") {
    const programFiles = process.env.ProgramFiles ?? "C:\\Program Files";
    const programFilesX86 = process.env["ProgramFiles(x86)"] ?? "C:\\Program Files (x86)";
    return [
      ...base,
      path.join(programFiles, "nodejs"),
      path.join(programFilesX86, "nodejs"),
      path.join(home, "AppData", "Roaming", "npm")
    ];
  }

  return [...base, "/usr/local/bin", "/usr/bin", "/bin", path.join(home, ".local", "bin"), path.join(home, "bin")];
};

export const withRuntimePath = (inputEnv: NodeJS.ProcessEnv): NodeJS.ProcessEnv => {
  const env: NodeJS.ProcessEnv = { ...inputEnv };
  const delimiter = path.delimiter;
  const currentPath = env.PATH ?? env.Path ?? "";
  const entries = currentPath.split(delimiter).filter(Boolean);
  const merged = uniquePathEntries([...entries, ...defaultPathCandidates()]);
  const mergedPath = merged.join(delimiter);
  env.PATH = mergedPath;
  if (process.platform === "win32") {
    env.Path = mergedPath;
  }
  return env;
};

export const applyRuntimePathToProcessEnv = () => {
  const updated = withRuntimePath(process.env);
  Object.assign(process.env, updated);
};
