import { app } from "electron";
import { autoUpdater } from "electron-updater";
import type { UpdateCheckResult } from "@code-app/shared";

export class UpdaterService {
  private readonly enabled: boolean;

  constructor() {
    this.enabled = !app.isPackaged ? false : true;
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

    if (!nextVersion || nextVersion === currentVersion) {
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
