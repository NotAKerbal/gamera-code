import { createPortal } from "react-dom";
import { memo, useState, type Dispatch, type RefObject, type SetStateAction } from "react";
import type { CodexSandboxMode, CodexThreadOptions, HarnessAvailableModels, HarnessId } from "@code-app/shared";
import { getModelTooltip } from "../../shared/src/modelTooltips";
import {
  APPROVAL_OPTIONS,
  COLLABORATION_OPTIONS,
  formatModelDisplayName,
  harnessSupports,
  acknowledgeDangerFullAccessWarning,
  hasDangerFullAccessWarningAcknowledged,
  REASONING_OPTIONS,
  SANDBOX_OPTIONS,
  SUPPORTED_HARNESSES,
  WEB_SEARCH_OPTIONS,
  type ComposerDropdownKind
} from "./appCore";

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
  availableModelsByHarness: HarnessAvailableModels;
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
  availableModelsByHarness,
  visibleHarnesses,
  visibleHarnessCount,
  canSwitchHarnesses,
  onSelectHarnessModel,
  setComposerOptions,
  setComposerDropdown
}: ComposerDropdownPortalProps) => {
  const [pendingDangerSandboxMode, setPendingDangerSandboxMode] = useState<CodexSandboxMode | null>(null);

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
              <div
                className={
                  visibleHarnessCount <= 1
                    ? "composer-model-harnesses composer-model-harnesses-single"
                    : "composer-model-harnesses"
                }
              >
                {SUPPORTED_HARNESSES.map((harness) => {
                  if (visibleHarnesses[harness.id] === false) {
                    return null;
                  }
                  const availableModels = availableModelsByHarness[harness.id];
                  const modelGroups = harness.modelGroups
                    .map((group) => ({
                      ...group,
                      models: availableModels ? group.models.filter((model) => availableModels.includes(model)) : group.models
                    }))
                    .filter((group) => group.models.length > 0);
                  if (modelGroups.length === 0) {
                    return null;
                  }
                  const harnessIsActive = harness.id === currentHarnessId;
                  const harnessClassName =
                    harness.id === "codex"
                      ? "composer-model-harness composer-model-harness-codex"
                      : "composer-model-harness composer-model-harness-open";
                  return (
                    <section key={harness.id} className={harnessClassName}>
                      <div className="composer-model-harness-header">
                        <div className="composer-model-harness-title">{harness.label}</div>
                        {!harnessIsActive && !canSwitchHarnesses ? (
                          <div className="composer-model-harness-meta">Create a new thread to switch</div>
                        ) : (
                          <div className="composer-model-harness-meta">{modelGroups.length} sections</div>
                        )}
                      </div>
                      <div
                        className={
                          harness.id === "codex"
                            ? "composer-model-harness-columns composer-model-harness-columns-codex"
                            : "composer-model-harness-columns"
                        }
                      >
                        {modelGroups.map((group) => (
                          <section key={`${harness.id}:${group.id}`} className="composer-model-column">
                            <div className="composer-model-column-header">
                              <div className="composer-model-column-title">{group.label}</div>
                            </div>
                            <div className="composer-model-column-items">
                              {group.models.map((model) => {
                                const selected = harnessIsActive && (composerOptions.model ?? "").trim() === model;
                                const disabled = !harnessIsActive && !canSwitchHarnesses;
                                const tooltip = getModelTooltip(model);
                                return (
                                  <button
                                    key={`${harness.id}:${model}`}
                                    className={
                                      selected ? "composer-model-option composer-model-option-current" : "composer-model-option"
                                    }
                                    disabled={disabled}
                                    data-app-tooltip={tooltip}
                                    title={tooltip}
                                    onClick={() => {
                                      onSelectHarnessModel(harness.id, model);
                                      setComposerDropdown(null);
                                    }}
                                  >
                                    <span className="composer-model-option-name">{formatModelDisplayName(model)}</span>
                                  </button>
                                );
                              })}
                            </div>
                          </section>
                        ))}
                      </div>
                    </section>
                  );
                })}
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
