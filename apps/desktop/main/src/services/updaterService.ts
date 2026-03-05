import { app } from "electron";
import { autoUpdater } from "electron-updater";
import type { UpdateCheckResult } from "@code-app/shared";

type ParsedVersion = {
  major: number;
  minor: number;
  patch: number;
  prerelease: string[];
};

const parseSemver = (value: string): ParsedVersion | null => {
  const trimmed = value.trim().replace(/^v/i, "");
  const match = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?/.exec(trimmed);
  if (!match) {
    return null;
  }

  const majorText = match[1];
  const minorText = match[2];
  const patchText = match[3];
  if (!majorText || !minorText || !patchText) {
    return null;
  }

  const prerelease = match[4]
    ? match[4]
        .split(".")
        .map((segment) => segment.trim())
        .filter(Boolean)
    : [];

  return {
    major: Number.parseInt(majorText, 10),
    minor: Number.parseInt(minorText, 10),
    patch: Number.parseInt(patchText, 10),
    prerelease
  };
};

const comparePrerelease = (left: string[], right: string[]): number => {
  if (left.length === 0 && right.length === 0) {
    return 0;
  }
  if (left.length === 0) {
    return 1;
  }
  if (right.length === 0) {
    return -1;
  }

  const maxLength = Math.max(left.length, right.length);
  for (let index = 0; index < maxLength; index += 1) {
    const leftPart = left[index];
    const rightPart = right[index];
    if (leftPart === undefined) {
      return -1;
    }
    if (rightPart === undefined) {
      return 1;
    }

    const leftNumber = /^[0-9]+$/.test(leftPart) ? Number.parseInt(leftPart, 10) : null;
    const rightNumber = /^[0-9]+$/.test(rightPart) ? Number.parseInt(rightPart, 10) : null;
    if (leftNumber !== null && rightNumber !== null) {
      if (leftNumber !== rightNumber) {
        return leftNumber > rightNumber ? 1 : -1;
      }
      continue;
    }
    if (leftNumber !== null) {
      return -1;
    }
    if (rightNumber !== null) {
      return 1;
    }
    if (leftPart !== rightPart) {
      return leftPart > rightPart ? 1 : -1;
    }
  }

  return 0;
};

const isVersionNewer = (candidate: string, current: string): boolean => {
  const parsedCandidate = parseSemver(candidate);
  const parsedCurrent = parseSemver(current);
  if (!parsedCandidate || !parsedCurrent) {
    return candidate !== current;
  }

  if (parsedCandidate.major !== parsedCurrent.major) {
    return parsedCandidate.major > parsedCurrent.major;
  }
  if (parsedCandidate.minor !== parsedCurrent.minor) {
    return parsedCandidate.minor > parsedCurrent.minor;
  }
  if (parsedCandidate.patch !== parsedCurrent.patch) {
    return parsedCandidate.patch > parsedCurrent.patch;
  }

  return comparePrerelease(parsedCandidate.prerelease, parsedCurrent.prerelease) > 0;
};

export class UpdaterService {
  private readonly enabled: boolean;

  constructor() {
    this.enabled = app.isPackaged;
    autoUpdater.autoDownload = false;
  }

  async checkForUpdates(): Promise<UpdateCheckResult> {
    if (!this.enabled) {
      return {
        available: false,
        notes: "Auto-updates are disabled in development builds."
      };
    }

    const result = await autoUpdater.checkForUpdates();
    const currentVersion = app.getVersion();
    const nextVersion = result?.updateInfo.version;

    if (!nextVersion || !isVersionNewer(nextVersion, currentVersion)) {
      return { available: false };
    }

    return {
      available: true,
      version: nextVersion,
      notes: result?.updateInfo.releaseNotes
        ? String(result.updateInfo.releaseNotes)
        : undefined
    };
  }

  async applyUpdate(): Promise<{ ok: boolean }> {
    if (!this.enabled) {
      return { ok: false };
    }

    await autoUpdater.downloadUpdate();
    setImmediate(() => autoUpdater.quitAndInstall());
    return { ok: true };
  }
}
