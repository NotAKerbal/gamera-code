import type { Dispatch, RefObject, SetStateAction } from "react";
import type { HarnessId, InstallStatus } from "@code-app/shared";
import { INSTALL_DETAIL_LABELS, REQUIRED_SETUP_KEYS, SUPPORTED_HARNESSES } from "./appCore";

type SetupModalProps = {
  installStatus: InstallStatus;
  setupDescription: string;
  requiredSetupKeys: Set<string>;
  setupInstalling: boolean;
  setupPermissionGranted: boolean;
  setSetupPermissionGranted: Dispatch<SetStateAction<boolean>>;
  setupLiveLines: string[];
  setupLogEndRef: RefObject<HTMLDivElement | null>;
  onClose: () => void;
  onRefreshStatus: () => Promise<void>;
  onRunAutomaticSetup: () => Promise<void>;
  onInstallHarness: (harnessId: HarnessId) => Promise<void>;
  appendLog: (line: string) => void;
};

export const SetupModal = ({
  installStatus,
  setupDescription,
  requiredSetupKeys,
  setupInstalling,
  setupPermissionGranted,
  setSetupPermissionGranted,
  setupLiveLines,
  setupLogEndRef,
  onClose,
  onRefreshStatus,
  onRunAutomaticSetup,
  onInstallHarness,
  appendLog
}: SetupModalProps) => (
  <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 p-4">
    <div className="w-full max-w-2xl rounded-2xl border border-border bg-surface p-4 shadow-neon">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-lg font-semibold">Dependency Setup</h3>
        <button
          className="btn-secondary"
          disabled={setupInstalling}
          onClick={() => {
            if (!setupInstalling) {
              onClose();
            }
          }}
        >
          Close
        </button>
      </div>

      <p className="mb-3 text-sm text-slate-300">
        {setupDescription}
      </p>

      <div className="mb-2 text-xs uppercase tracking-wide text-muted">Core Dependencies</div>
      <div className="mb-4 grid grid-cols-2 gap-2 text-sm">
        {installStatus.details
          .filter((detail) => requiredSetupKeys.has(detail.key) || REQUIRED_SETUP_KEYS.has(detail.key))
          .map((detail) => (
            <div key={detail.key} className="rounded-lg border border-border bg-black/20 p-2">
              <div className="font-medium">{INSTALL_DETAIL_LABELS[detail.key] ?? detail.key}</div>
              <div className={detail.ok ? "text-slate-100" : "text-slate-300"}>
                {detail.ok ? `Ready${detail.version ? ` (${detail.version})` : ""}` : detail.message}
              </div>
            </div>
          ))}
      </div>

      <div className="mb-2 text-xs uppercase tracking-wide text-muted">Harnesses</div>
      <div className="mb-4 grid gap-2 text-sm">
        {SUPPORTED_HARNESSES.map((harness) => {
          const detail = installStatus.details.find((entry) => entry.key === harness.id);
          return (
            <div key={harness.id} className="rounded-lg border border-border bg-black/20 p-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="font-medium">{harness.label}</div>
                  <div className={detail?.ok ? "text-slate-100" : "text-slate-300"}>
                    {detail?.ok ? `Ready${detail.version ? ` (${detail.version})` : ""}` : detail?.message ?? "Not configured"}
                  </div>
                </div>
                <button
                  className="btn-secondary h-8 px-2 py-0 text-xs"
                  onClick={() => {
                    onInstallHarness(harness.id).catch((error) => {
                      appendLog(`${harness.label} setup failed: ${String(error)}`);
                    });
                  }}
                  disabled={setupInstalling}
                >
                  {detail?.ok ? "Verify" : "Setup"}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {setupLiveLines.length > 0 && (
        <div className="mb-4 max-h-48 overflow-y-auto rounded-lg border border-border bg-black/40 p-3 font-mono text-xs text-slate-300">
          <div className="mb-1 text-[10px] uppercase tracking-wider text-muted">Install Output</div>
          {setupLiveLines.slice(-60).map((line, i) => (
            <div key={i} className="whitespace-pre-wrap leading-relaxed">{line}</div>
          ))}
          <div ref={setupLogEndRef} />
        </div>
      )}

      <label className="project-settings-toggle mb-4">
        <input
          type="checkbox"
          checked={setupPermissionGranted}
          onChange={(event) => setSetupPermissionGranted(event.target.checked)}
          disabled={setupInstalling}
        />
        <span>I approve running package manager install commands on this computer.</span>
      </label>

      <div className="flex justify-end gap-2">
        <button
          className="btn-secondary"
          onClick={() => {
            onRefreshStatus().catch((error) => {
              appendLog(`Refresh setup status failed: ${String(error)}`);
            });
          }}
          disabled={setupInstalling}
        >
          Refresh Status
        </button>
        <button
          className="btn-primary"
          disabled={!setupPermissionGranted || setupInstalling}
          onClick={() => {
            onRunAutomaticSetup().catch((error) => {
              appendLog(`Automatic setup failed: ${String(error)}`);
            });
          }}
        >
          {setupInstalling ? "Installing..." : "Install Missing Dependencies"}
        </button>
      </div>
    </div>
  </div>
);
