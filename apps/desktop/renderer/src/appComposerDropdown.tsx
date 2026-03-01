import { createPortal } from "react-dom";
import { memo, type Dispatch, type RefObject, type SetStateAction } from "react";
import type { CodexThreadOptions } from "@code-app/shared";
import {
  APPROVAL_OPTIONS,
  COLLABORATION_OPTIONS,
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
  if (!composerDropdown) {
    return null;
  }

  return createPortal(
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
            <button
              className={(composerOptions.model ?? "").trim() === "" ? "branch-dropdown-row branch-dropdown-row-current" : "branch-dropdown-row"}
              onClick={() => {
                setComposerOptions((prev) => ({
                  ...prev,
                  model: undefined
                }));
                setComposerDropdown(null);
              }}
            >
              <span className="truncate">auto</span>
            </button>
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
                <span className="truncate">{model.toLowerCase()}</span>
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
              <span className="truncate">{option.label.toLowerCase()}</span>
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
              <span className="truncate">{option.label.toLowerCase()}</span>
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
                setComposerOptions((prev) => ({
                  ...prev,
                  sandboxMode: option.value
                }));
                setComposerDropdown(null);
              }}
            >
              <span className="truncate">{option.label.toLowerCase()}</span>
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
              <span className="truncate">{option.label.toLowerCase()}</span>
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
    </div>,
    document.body
  );
};

export const ComposerDropdownPortal = memo(ComposerDropdownPortalComponent);
