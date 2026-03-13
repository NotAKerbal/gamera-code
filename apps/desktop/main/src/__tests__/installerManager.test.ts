import { afterEach, describe, expect, it, vi } from "vitest";
import { InstallerManager } from "../services/installerManager";
import { PROVIDER_ADAPTERS } from "../services/providerAdapters";

describe("installer model discovery", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("includes Gemini models when the Gemini adapter is healthy", async () => {
    const repository = {
      getSettings: () => ({
        harnessSettings: {
          gemini: {
            binaryOverride: "/repo/gemini"
          }
        }
      }),
      saveInstallCheck: vi.fn()
    } as any;

    const manager = new InstallerManager(repository);
    vi.spyOn(manager as any, "getCodexAvailableModels").mockResolvedValue(null);
    vi.spyOn(manager as any, "getOpenCodeAvailableModels").mockResolvedValue(null);
    const healthCheck = vi.spyOn(PROVIDER_ADAPTERS.gemini, "healthCheck").mockResolvedValue({
      ok: true,
      version: "1.2.3",
      message: "ok"
    });
    const discover = vi.spyOn(PROVIDER_ADAPTERS.gemini, "discoverAvailableModels").mockResolvedValue([
      "gemini-2.5-pro",
      "gemini-2.5-flash"
    ]);

    await expect(manager.getAvailableModels()).resolves.toEqual({
      gemini: ["gemini-2.5-pro", "gemini-2.5-flash"]
    });
    expect(healthCheck).toHaveBeenCalledWith("/repo/gemini");
    expect(discover).toHaveBeenCalledWith(undefined);
  });

  it("prefers the explicit Gemini binary override for discovery", async () => {
    const repository = {
      getSettings: () => ({
        harnessSettings: {
          gemini: {
            binaryOverride: "/repo/gemini"
          }
        }
      }),
      saveInstallCheck: vi.fn()
    } as any;

    const manager = new InstallerManager(repository);
    vi.spyOn(manager as any, "getCodexAvailableModels").mockResolvedValue(null);
    vi.spyOn(manager as any, "getOpenCodeAvailableModels").mockResolvedValue(null);
    const healthCheck = vi.spyOn(PROVIDER_ADAPTERS.gemini, "healthCheck").mockResolvedValue({
      ok: true,
      version: "1.2.3",
      message: "ok"
    });
    const discover = vi.spyOn(PROVIDER_ADAPTERS.gemini, "discoverAvailableModels").mockResolvedValue([
      "gemini-2.5-pro"
    ]);

    await expect(
      manager.getAvailableModels({
        geminiBinaryOverride: "/custom/gemini"
      })
    ).resolves.toEqual({
      gemini: ["gemini-2.5-pro"]
    });
    expect(healthCheck).toHaveBeenCalledWith("/custom/gemini");
    expect(discover).toHaveBeenCalledWith("/custom/gemini");
  });

  it("skips Gemini discovery when the Gemini adapter health check fails", async () => {
    const repository = {
      getSettings: () => ({
        harnessSettings: {
          gemini: {
            binaryOverride: "/repo/gemini"
          }
        }
      }),
      saveInstallCheck: vi.fn()
    } as any;

    const manager = new InstallerManager(repository);
    vi.spyOn(manager as any, "getCodexAvailableModels").mockResolvedValue(null);
    vi.spyOn(manager as any, "getOpenCodeAvailableModels").mockResolvedValue(null);
    vi.spyOn(PROVIDER_ADAPTERS.gemini, "healthCheck").mockResolvedValue({
      ok: false,
      message: "missing"
    });
    const discover = vi.spyOn(PROVIDER_ADAPTERS.gemini, "discoverAvailableModels");

    await expect(manager.getAvailableModels()).resolves.toEqual({});
    expect(discover).not.toHaveBeenCalled();
  });
});
