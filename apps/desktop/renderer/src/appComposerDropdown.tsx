import { createPortal } from "react-dom";
import { memo, useState, type Dispatch, type RefObject, type SetStateAction } from "react";
import type { CodexSandboxMode, CodexThreadOptions, HarnessId } from "@code-app/shared";
import {
  APPROVAL_OPTIONS,
  COLLABORATION_OPTIONS,
  harnessSupports,
  acknowledgeDangerFullAccessWarning,
  hasDangerFullAccessWarningAcknowledged,
  REASONING_OPTIONS,
  SANDBOX_OPTIONS,
  WEB_SEARCH_OPTIONS,
  type ComposerDropdownKind
} from "./appCore";
import { HarnessBadge } from "./harnessBadge";
import { buildComposerModelGroups } from "./harnessModelCatalog";

type ComposerDropdownState = {
  kind: ComposerDropdownKind;
  bottom: number;
  left: number;
  width: number;
};

type ComposerDropdownPortalProps = {
  composerDropdown: ComposerDropdownState | null;
  composerDropdownMenuRef: RefObject<HTMLDivElement | null>;
  composerOptions: CodexThreadOptions;
  currentHarnessId: HarnessId;
  visibleHarnesses: Partial<Record<HarnessId, boolean>>;
  visibleHarnessCount: number;
  canSwitchHarnesses: boolean;
  onSelectHarnessModel: (harnessId: HarnessId, model: string) => void;
  setComposerOptions: Dispatch<SetStateAction<CodexThreadOptions>>;
  setComposerDropdown: Dispatch<SetStateAction<ComposerDropdownState | null>>;
};

const ComposerDropdownPortalComponent = ({
  composerDropdown,
  composerDropdownMenuRef,
  composerOptions,
  currentHarnessId,
  visibleHarnesses,
  visibleHarnessCount,
  canSwitchHarnesses,
  onSelectHarnessModel,
  setComposerOptions,
  setComposerDropdown
}: ComposerDropdownPortalProps) => {
  const [pendingDangerSandboxMode, setPendingDangerSandboxMode] = useState<CodexSandboxMode | null>(null);
  const providerModelGroups = buildComposerModelGroups({
    composerOptions,
    currentHarnessId,
    visibleHarnesses,
    canSwitchHarnesses,
    showUnavailableModels: !canSwitchHarnesses || visibleHarnessCount <= 1
  });

  if (!composerDropdown && !pendingDangerSandboxMode) {
    return null;
  }

  const applySandboxMode = (mode: CodexSandboxMode) => {
    setComposerOptions((prev) => ({
      ...prev,
      sandboxMode: mode
    }));
    setComposerDropdown(null);
  };

  return createPortal(
    <>
      {composerDropdown && (
        <div
          ref={composerDropdownMenuRef}
          className={composerDropdown.kind === "model" ? "branch-dropdown-pop composer-model-dropdown-pop" : "branch-dropdown-pop"}
          style={{
            position: "fixed",
            bottom: `${composerDropdown.bottom}px`,
            left: `${composerDropdown.left}px`,
            width: `${composerDropdown.width}px`,
            zIndex: 90
          }}
        >
          <div className={composerDropdown.kind === "model" ? "composer-model-dropdown-list" : "branch-dropdown-list"}>
            {composerDropdown.kind === "model" && (
              <div className={visibleHarnessCount <= 1 ? "composer-model-groups composer-model-groups-single" : "composer-model-groups"}>
                {providerModelGroups.map((group) => (
                  <section key={group.id} className="composer-model-group">
                    <div className="composer-model-group-header">
                      <div className="composer-model-group-title">{group.label}</div>
                      <div className="composer-model-group-meta">
                        {group.rows.length} model{group.rows.length === 1 ? "" : "s"}
                      </div>
                    </div>
                    <div className="composer-model-group-items">
                      {group.rows.map((row) => (
                        <div
                          key={row.id}
                          className={row.selected ? "composer-model-row composer-model-row-current" : "composer-model-row"}
                        >
                          <button
                            className="composer-model-row-main"
                            disabled={row.preferredHarness.disabled}
                            data-app-tooltip={row.tooltip}
                            title={row.tooltip}
                            onClick={() => {
                              onSelectHarnessModel(row.preferredHarness.harnessId, row.preferredHarness.model);
                              setComposerDropdown(null);
                            }}
                          >
                            <span className="composer-model-option-name">{row.displayName}</span>
                          </button>
                          <div className="composer-model-row-badges">
                            {row.harnesses.map((harness) => (
                              <button
                                key={`${row.id}:${harness.harnessId}`}
                                className={
                                  harness.selected
                                    ? "composer-model-harness-badge composer-model-harness-badge-current"
                                    : "composer-model-harness-badge"
                                }
                                disabled={harness.disabled}
                                data-app-tooltip={harness.tooltip}
                                title={harness.tooltip}
                                aria-label={harness.tooltip}
                                onClick={() => {
                                  onSelectHarnessModel(harness.harnessId, harness.model);
                                  setComposerDropdown(null);
                                }}
                              >
                                <HarnessBadge
                                  harness={{ label: harness.harnessLabel, badge: harness.badge }}
                                  showLabel={false}
                                  className="composer-model-harness-badge-visual"
                                />
                              </button>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </section>
                ))}
              </div>
            )}
            {composerDropdown.kind === "effort" &&
              harnessSupports(currentHarnessId, "reasoning_effort") &&
              REASONING_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  className={
                    (composerOptions.modelReasoningEffort ?? "medium") === option.value
                      ? "branch-dropdown-row branch-dropdown-row-current"
                      : "branch-dropdown-row"
                  }
                  onClick={() => {
                    setComposerOptions((prev) => ({
                      ...prev,
                      modelReasoningEffort: option.value
                    }));
                    setComposerDropdown(null);
                  }}
                >
                  <span className="truncate">{option.label}</span>
                </button>
              ))}
            {composerDropdown.kind === "mode" &&
              harnessSupports(currentHarnessId, "collaboration_mode") &&
              COLLABORATION_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  className={
                    (composerOptions.collaborationMode ?? "plan") === option.value
                      ? "branch-dropdown-row branch-dropdown-row-current"
                      : "branch-dropdown-row"
                  }
                  onClick={() => {
                    setComposerOptions((prev) => ({
                      ...prev,
                      collaborationMode: option.value
                    }));
                    setComposerDropdown(null);
                  }}
                >
                  <span className="truncate">{option.label}</span>
                </button>
              ))}
            {composerDropdown.kind === "sandbox" &&
              harnessSupports(currentHarnessId, "sandbox") &&
              SANDBOX_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  className={
                    (composerOptions.sandboxMode ?? "workspace-write") === option.value
                      ? "branch-dropdown-row branch-dropdown-row-current"
                      : "branch-dropdown-row"
                  }
                  onClick={() => {
                    if (option.value === "danger-full-access" && !hasDangerFullAccessWarningAcknowledged()) {
                      setComposerDropdown(null);
                      setPendingDangerSandboxMode(option.value);
                      return;
                    }
                    applySandboxMode(option.value);
                  }}
                >
                  <span className="truncate">{option.dropdownLabel ?? option.label}</span>
                </button>
              ))}
            {composerDropdown.kind === "approval" &&
              harnessSupports(currentHarnessId, "approval_policy") &&
              APPROVAL_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  className={
                    (composerOptions.approvalPolicy ?? "on-request") === option.value
                      ? "branch-dropdown-row branch-dropdown-row-current"
                      : "branch-dropdown-row"
                  }
                  onClick={() => {
                    setComposerOptions((prev) => ({
                      ...prev,
                      approvalPolicy: option.value
                    }));
                    setComposerDropdown(null);
                  }}
                >
                  <span className="truncate">{option.dropdownLabel ?? option.label}</span>
                </button>
              ))}
            {composerDropdown.kind === "websearch" &&
              harnessSupports(currentHarnessId, "web_search") &&
              WEB_SEARCH_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  className={
                    (composerOptions.webSearchMode ?? "cached") === option.value
                      ? "branch-dropdown-row branch-dropdown-row-current"
                      : "branch-dropdown-row"
                  }
                  onClick={() => {
                    setComposerOptions((prev) => ({
                      ...prev,
                      webSearchMode: option.value
                    }));
                    setComposerDropdown(null);
                  }}
                >
                  <span className="truncate">{option.label.toLowerCase()}</span>
                </button>
              ))}
          </div>
        </div>
      )}
      {pendingDangerSandboxMode && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-md rounded-xl border border-border bg-surface p-4 shadow-neon">
            <h3 className="text-base font-semibold text-slate-100">Allow Full Access to Computer?</h3>
            <p className="mt-2 text-sm text-slate-300">
              This setting lets the agent run commands with very broad access on your machine. Continue only if you trust this
              project and prompt.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                className="btn-secondary"
                onClick={() => {
                  setPendingDangerSandboxMode(null);
                }}
              >
                Cancel
              </button>
              <button
                className="btn-primary"
                onClick={() => {
                  acknowledgeDangerFullAccessWarning();
                  applySandboxMode(pendingDangerSandboxMode);
                  setPendingDangerSandboxMode(null);
                }}
              >
                Continue
              </button>
            </div>
          </div>
        </div>
      )}
    </>,
    document.body
  );
};

export const ComposerDropdownPortal = memo(ComposerDropdownPortalComponent);
