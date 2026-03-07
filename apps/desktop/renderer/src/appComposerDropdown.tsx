import { createPortal } from "react-dom";
import { memo, useState, type Dispatch, type RefObject, type SetStateAction } from "react";
import type { CodexSandboxMode, CodexThreadOptions } from "@code-app/shared";
import {
  APPROVAL_OPTIONS,
  COLLABORATION_OPTIONS,
  formatModelDisplayName,
  acknowledgeDangerFullAccessWarning,
  hasDangerFullAccessWarningAcknowledged,
  MODEL_SUGGESTIONS,
  REASONING_OPTIONS,
  SANDBOX_OPTIONS,
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
  setComposerOptions: Dispatch<SetStateAction<CodexThreadOptions>>;
  setComposerDropdown: Dispatch<SetStateAction<ComposerDropdownState | null>>;
};

const ComposerDropdownPortalComponent = ({
  composerDropdown,
  composerDropdownMenuRef,
  composerOptions,
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
          className="branch-dropdown-pop"
          style={{
            position: "fixed",
            bottom: `${composerDropdown.bottom}px`,
            left: `${composerDropdown.left}px`,
            width: `${composerDropdown.width}px`,
            zIndex: 90
          }}
        >
          <div className="branch-dropdown-list">
            {composerDropdown.kind === "model" && (
              <>
                {MODEL_SUGGESTIONS.map((model) => (
                  <button
                    key={model}
                    className={(composerOptions.model ?? "").trim() === model ? "branch-dropdown-row branch-dropdown-row-current" : "branch-dropdown-row"}
                    onClick={() => {
                      setComposerOptions((prev) => ({
                        ...prev,
                        model
                      }));
                      setComposerDropdown(null);
                    }}
                  >
                    <span className="truncate">{formatModelDisplayName(model)}</span>
                  </button>
                ))}
              </>
            )}
            {composerDropdown.kind === "effort" &&
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
