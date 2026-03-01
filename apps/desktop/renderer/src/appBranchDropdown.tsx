import { createPortal } from "react-dom";
import { memo, type Dispatch, type RefObject, type SetStateAction } from "react";

type BranchDropdownPosition = {
  bottom: number;
  left: number;
  width: number;
};

type BranchRow = {
  name: string;
  isCurrent: boolean;
  isLocal?: boolean;
  isOnOrigin?: boolean;
};

type BranchDropdownPortalProps = {
  isOpen: boolean;
  activeProjectId: string | null;
  activeInsideRepo: boolean;
  branchDropdownPosition: BranchDropdownPosition | null;
  branchDropdownMenuRef: RefObject<HTMLDivElement | null>;
  branchListRef: RefObject<HTMLDivElement | null>;
  gitBranchSearch: string;
  setGitBranchSearch: Dispatch<SetStateAction<string>>;
  setIsBranchDropdownOpen: Dispatch<SetStateAction<boolean>>;
  setBranchListScrollTop: Dispatch<SetStateAction<number>>;
  setBranchListViewportHeight: Dispatch<SetStateAction<number>>;
  filteredBranches: BranchRow[];
  visibleBranches: {
    rows: BranchRow[];
    offsetTop: number;
    totalHeight: number;
  };
  exactBranchMatch: BranchRow | null;
  canCreateBranchFromInput: boolean;
  gitBranchInput: string;
  gitBusyAction: string | null;
  onSwitchOrCreateBranch: (branchName?: string) => Promise<void>;
  appendLog: (line: string) => void;
};

const BranchDropdownPortalComponent = ({
  isOpen,
  activeProjectId,
  activeInsideRepo,
  branchDropdownPosition,
  branchDropdownMenuRef,
  branchListRef,
  gitBranchSearch,
  setGitBranchSearch,
  setIsBranchDropdownOpen,
  setBranchListScrollTop,
  setBranchListViewportHeight,
  filteredBranches,
  visibleBranches,
  exactBranchMatch,
  canCreateBranchFromInput,
  gitBranchInput,
  gitBusyAction,
  onSwitchOrCreateBranch,
  appendLog
}: BranchDropdownPortalProps) => {
  if (!isOpen || !activeProjectId || !activeInsideRepo || !branchDropdownPosition) {
    return null;
  }

  return createPortal(
    <div
      ref={branchDropdownMenuRef}
      className="branch-dropdown-pop"
      style={{
        position: "fixed",
        bottom: `${branchDropdownPosition.bottom}px`,
        left: `${branchDropdownPosition.left}px`,
        width: `${branchDropdownPosition.width}px`,
        zIndex: 90
      }}
    >
      <div className="p-2">
        <input
          className="input branch-search-input h-8 text-xs"
          value={gitBranchSearch}
          placeholder="Search branches or type a new one"
          autoFocus
          onChange={(event) => {
            setGitBranchSearch(event.target.value);
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              setIsBranchDropdownOpen(false);
              return;
            }
            if (event.key !== "Enter") {
              return;
            }
            event.preventDefault();
            onSwitchOrCreateBranch().catch((error) => {
              appendLog(`Branch change failed: ${String(error)}`);
            });
          }}
          disabled={Boolean(gitBusyAction)}
        />
      </div>
      <div
        ref={branchListRef}
        className="branch-dropdown-list"
        onScroll={(event) => {
          setBranchListScrollTop(event.currentTarget.scrollTop);
          setBranchListViewportHeight(event.currentTarget.clientHeight || 208);
        }}
      >
        {filteredBranches.length === 0 ? (
          <div className="branch-dropdown-empty">No matching branches.</div>
        ) : (
          <div style={{ height: `${visibleBranches.totalHeight}px`, position: "relative" }}>
            <div
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                right: 0,
                transform: `translateY(${visibleBranches.offsetTop}px)`
              }}
            >
              {visibleBranches.rows.map((branch) => (
                <button
                  key={branch.name}
                  className={branch.isCurrent ? "branch-dropdown-row branch-dropdown-row-current" : "branch-dropdown-row"}
                  onClick={() => {
                    onSwitchOrCreateBranch(branch.name).catch((error) => {
                      appendLog(`Checkout failed: ${String(error)}`);
                    });
                  }}
                  disabled={Boolean(gitBusyAction)}
                >
                  <span className="truncate">{branch.name}</span>
                  <span className="flex items-center gap-1">
                    {branch.isLocal ? <span className="branch-dropdown-chip">local</span> : null}
                    {branch.isOnOrigin && !branch.isLocal ? (
                      <span className="branch-dropdown-chip" title="Exists on origin only">origin</span>
                    ) : null}
                    {branch.isCurrent ? <span className="branch-dropdown-chip">current</span> : null}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="branch-dropdown-actions">
        {exactBranchMatch ? (
          <button
            className="btn-ghost w-full text-left"
            onClick={() => {
              onSwitchOrCreateBranch().catch((error) => {
                appendLog(`Branch change failed: ${String(error)}`);
              });
            }}
            disabled={Boolean(gitBusyAction) || exactBranchMatch.isCurrent}
          >
            {exactBranchMatch.isCurrent ? "Already on this branch" : `Switch to ${exactBranchMatch.name}`}
          </button>
        ) : canCreateBranchFromInput ? (
          <button
            className="btn-ghost w-full text-left"
            onClick={() => {
              onSwitchOrCreateBranch().catch((error) => {
                appendLog(`Branch change failed: ${String(error)}`);
              });
            }}
            disabled={Boolean(gitBusyAction)}
          >
            Create and switch to {gitBranchInput}
          </button>
        ) : (
          <div className="branch-dropdown-empty">Type a branch name to switch or create.</div>
        )}
      </div>
    </div>,
    document.body
  );
};

export const BranchDropdownPortal = memo(BranchDropdownPortalComponent);
