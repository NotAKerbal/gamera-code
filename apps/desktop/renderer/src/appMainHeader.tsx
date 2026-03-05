import { memo, useMemo, useState, type Dispatch, type KeyboardEvent as ReactKeyboardEvent, type RefObject, type SetStateAction } from "react";
import {
  FaApple,
  FaChevronDown,
  FaChevronRight,
  FaCodeBranch,
  FaCog,
  FaExternalLinkAlt,
  FaEye,
  FaFolderOpen,
  FaTerminal,
  FaTimes,
  FaPlus,
  FaWindows,
  FaLinux,
  FaWindowMaximize,
  FaWindowMinimize,
  FaWindowRestore
} from "react-icons/fa";
import type { ProjectTerminalState, ProjectWebLink, SystemTerminalOption } from "@code-app/shared";

type HeaderTerminal = ProjectTerminalState["terminals"][number];

type MainHeaderProps = {
  isMacOS: boolean;
  isWindows: boolean;
  isWindowMaximized: boolean;
  appIconSrc: string;
  appVersionLabel: string;
  workspaces: Array<{
    id: string;
    name: string;
    color: string;
    runningCount: number;
    reviewCount: number;
    finishedCount: number;
  }>;
  activeWorkspaceId: string | null;
  onSelectWorkspace: (workspaceId: string) => void;
  onOpenWorkspaceSettings: (workspaceId: string) => void;
  onOpenNewWorkspaceModal: () => void;
  changelogItems: string[];
  changelogRef: RefObject<HTMLDivElement | null>;
  isChangelogOpen: boolean;
  setIsChangelogOpen: Dispatch<SetStateAction<boolean>>;
  updateMessage: string;
  showUpdatePrompt: boolean;
  updateInstallPending: boolean;
  onApplyUpdate: () => void;
  onDismissUpdate: () => void;
  activeProjectWebLinks: ProjectWebLink[];
  onOpenProjectWebLink: (link: ProjectWebLink) => Promise<void>;
  terminalMenuRef: RefObject<HTMLDivElement | null>;
  terminalMenuTriggerRef: RefObject<HTMLButtonElement | null>;
  terminalMenuContentRef: RefObject<HTMLDivElement | null>;
  isTerminalMenuOpen: boolean;
  setIsTerminalMenuOpen: Dispatch<SetStateAction<boolean>>;
  moveTerminalMenuFocus: (event: ReactKeyboardEvent<HTMLDivElement>) => void;
  activeProjectId: string | null;
  activeProjectTerminals: HeaderTerminal[];
  activeRunningTerminalsCount: number;
  systemTerminals: SystemTerminalOption[];
  isTerminalDashboardPoppedOut: boolean;
  onOpenProjectTerminal: (terminalId?: string) => Promise<void>;
  onOpenTerminalDashboardPopout: () => void;
  onOpenTerminalPopout: (terminal: HeaderTerminal) => void;
  onStartTerminal: (commandId: string) => Promise<void>;
  onStopTerminal: (commandId: string) => Promise<void>;
  onCopyTerminalOutput: (name: string, output: string) => void;
  onOpenProjectFiles: () => Promise<void>;
  activeProjectBrowserEnabled: boolean;
  isPreviewOpen: boolean;
  isGitPanelOpen: boolean;
  onTogglePreviewPanel: () => void;
  onToggleGitPanel: () => void;
  showHeaderGitDiffStats: boolean;
  activeGitAddedLines: number;
  activeGitRemovedLines: number;
  onOpenSettingsWindow: () => Promise<void>;
  onMinimizeWindow: () => void | Promise<void>;
  onToggleMaximizeWindow: () => void | Promise<void>;
  onCloseWindow: () => void | Promise<void>;
  appendLog: (line: string) => void;
};

const hexToRgba = (hex: string, alpha: number) => {
  const normalized = hex.trim().replace(/^#/, "");
  const expanded = normalized.length === 3
    ? normalized.split("").map((segment) => `${segment}${segment}`).join("")
    : normalized;
  if (!/^[0-9a-fA-F]{6}$/.test(expanded)) {
    return `rgba(100, 116, 139, ${alpha})`;
  }
  const r = Number.parseInt(expanded.slice(0, 2), 16);
  const g = Number.parseInt(expanded.slice(2, 4), 16);
  const b = Number.parseInt(expanded.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

const TerminalGlyph = ({ terminalId }: { terminalId: string }) => {
  if (
    terminalId === "windows-terminal" ||
    terminalId === "powershell-core" ||
    terminalId === "powershell" ||
    terminalId === "command-prompt"
  ) {
    return <FaWindows className="text-[10px] text-slate-400" />;
  }
  if (terminalId === "git-bash") {
    return <FaCodeBranch className="text-[10px] text-slate-400" />;
  }
  if (terminalId === "terminal-app" || terminalId === "iterm-app") {
    return <FaApple className="text-[10px] text-slate-400" />;
  }
  if (
    terminalId === "x-terminal-emulator" ||
    terminalId === "gnome-terminal" ||
    terminalId === "gnome-console" ||
    terminalId === "konsole" ||
    terminalId === "xfce4-terminal" ||
    terminalId === "tilix" ||
    terminalId === "mate-terminal" ||
    terminalId === "lxterminal" ||
    terminalId === "terminator" ||
    terminalId === "wezterm" ||
    terminalId === "ghostty" ||
    terminalId === "foot" ||
    terminalId === "xterm"
  ) {
    return <FaLinux className="text-[10px] text-slate-400" />;
  }
  return <FaTerminal className="text-[10px] text-slate-400" />;
};

const MainHeaderComponent = ({
  isMacOS,
  isWindows,
  isWindowMaximized,
  appIconSrc,
  appVersionLabel,
  workspaces,
  activeWorkspaceId,
  onSelectWorkspace,
  onOpenWorkspaceSettings,
  onOpenNewWorkspaceModal,
  changelogItems,
  changelogRef,
  isChangelogOpen,
  setIsChangelogOpen,
  updateMessage,
  showUpdatePrompt,
  updateInstallPending,
  onApplyUpdate,
  onDismissUpdate,
  activeProjectWebLinks,
  onOpenProjectWebLink,
  terminalMenuRef,
  terminalMenuTriggerRef,
  terminalMenuContentRef,
  isTerminalMenuOpen,
  setIsTerminalMenuOpen,
  moveTerminalMenuFocus,
  activeProjectId,
  activeProjectTerminals,
  activeRunningTerminalsCount,
  systemTerminals,
  isTerminalDashboardPoppedOut,
  onOpenProjectTerminal,
  onOpenTerminalDashboardPopout,
  onOpenTerminalPopout,
  onStartTerminal,
  onStopTerminal,
  onCopyTerminalOutput,
  onOpenProjectFiles,
  activeProjectBrowserEnabled,
  isPreviewOpen,
  isGitPanelOpen,
  onTogglePreviewPanel,
  onToggleGitPanel,
  showHeaderGitDiffStats,
  activeGitAddedLines,
  activeGitRemovedLines,
  onOpenSettingsWindow,
  onMinimizeWindow,
  onToggleMaximizeWindow,
  onCloseWindow,
  appendLog
}: MainHeaderProps) => {
  const useWindowsStyleHeader = isWindows || !isMacOS;
  const [showTerminalAlternatives, setShowTerminalAlternatives] = useState(false);
  const [launchingSystemTerminalId, setLaunchingSystemTerminalId] = useState<string | null>(null);
  const platformShortcutModifier = isMacOS ? "Cmd" : "Ctrl";
  const tooltipText = (label: string, detail: string, shortcut?: string) =>
    [label, detail, shortcut ? `Shortcut: ${shortcut}` : null].filter(Boolean).join("\n");
  const availableSystemTerminals = useMemo(
    () => systemTerminals.filter((terminal) => terminal.available),
    [systemTerminals]
  );
  const defaultSystemTerminal = useMemo(
    () => systemTerminals.find((terminal) => terminal.isDefault),
    [systemTerminals]
  );
  const alternativeSystemTerminals = useMemo(() => {
    const defaultId = defaultSystemTerminal?.id;
    return availableSystemTerminals.filter((terminal) => terminal.id !== defaultId);
  }, [availableSystemTerminals, defaultSystemTerminal]);
  const launchSystemTerminal = (terminalId?: string) => {
    const launchId = terminalId ?? defaultSystemTerminal?.id ?? "default-terminal";
    setLaunchingSystemTerminalId(launchId);
    const resolvedTerminalId = terminalId ?? defaultSystemTerminal?.id;
    onOpenProjectTerminal(resolvedTerminalId)
      .catch((error) => appendLog(`Open terminal failed: ${String(error)}`))
      .finally(() => {
        window.setTimeout(() => {
          setLaunchingSystemTerminalId((current) => (current === launchId ? null : current));
        }, 520);
      });
  };

  return (
    <header
    className={`drag-region window-header flex h-12 items-center justify-between border-b border-border/90 px-3 ${
      isMacOS ? "window-header-macos" : useWindowsStyleHeader ? "window-header-windows" : ""
    }`}
  >
    <div className="flex items-center gap-2 text-sm font-semibold tracking-tight text-slate-100">
      <img src={appIconSrc} alt="GameraCode icon" className="h-8 w-8 rounded-xl object-cover" />
      <span>GameraCode</span>
      <div className="relative no-drag" ref={changelogRef}>
        <button
          className="app-tooltip-target header-pill px-1.5 py-0.5 text-[10px] font-medium"
          data-app-tooltip={tooltipText("What's New", `Open release notes for ${appVersionLabel}.`)}
          aria-label={`What's new in ${appVersionLabel}`}
          onClick={() => setIsChangelogOpen((prev) => !prev)}
        >
          {appVersionLabel}
        </button>
        {isChangelogOpen && (
          <div className="changelog-pop">
            <div className="changelog-pop-title">What&apos;s New in {appVersionLabel}</div>
            <ul className="changelog-pop-list">
              {changelogItems.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
      <div className="workspace-segmented-control no-drag">
        {workspaces.map((workspace) => {
          const isActive = workspace.id === activeWorkspaceId;
          const workspaceLabel = workspace.name.trim() || "Workspace";
          const hasAnyStatus = workspace.runningCount > 0 || workspace.reviewCount > 0 || workspace.finishedCount > 0;
          return (
            <button
              key={workspace.id}
              className={`workspace-segment ${isActive ? "active" : ""}`}
              onClick={() => onSelectWorkspace(workspace.id)}
              title={workspaceLabel}
              type="button"
              style={{
                backgroundColor: isActive ? hexToRgba(workspace.color, 0.3) : hexToRgba(workspace.color, 0.15)
              }}
            >
              <span className="workspace-segment-name">{workspaceLabel}</span>
              {hasAnyStatus ? (
                <span className="workspace-segment-meta" aria-hidden="true">
                  {workspace.runningCount > 0 ? (
                    <span className="workspace-segment-count count-running">{workspace.runningCount}</span>
                  ) : null}
                  {workspace.reviewCount > 0 ? (
                    <span className="workspace-segment-count count-review">{workspace.reviewCount}</span>
                  ) : null}
                  {workspace.finishedCount > 0 ? (
                    <span className="workspace-segment-count count-finished">{workspace.finishedCount}</span>
                  ) : null}
                </span>
              ) : null}
              <span
                className="workspace-segment-settings"
                onClick={(event) => {
                  event.stopPropagation();
                  onOpenWorkspaceSettings(workspace.id);
                }}
                role="button"
                tabIndex={0}
                onKeyDown={(event) => {
                  if (event.key !== "Enter" && event.key !== " ") {
                    return;
                  }
                  event.preventDefault();
                  event.stopPropagation();
                  onOpenWorkspaceSettings(workspace.id);
                }}
              >
                <FaCog className="text-[10px]" />
              </span>
            </button>
          );
        })}
        <button
          className="workspace-segment workspace-segment-add app-tooltip-target"
          type="button"
          data-app-tooltip={tooltipText("New Workspace", "Create a workspace and optionally move projects into it.")}
          onClick={onOpenNewWorkspaceModal}
          aria-label="Create workspace"
        >
          <FaPlus className="text-[10px]" />
        </button>
      </div>
    </div>
    <div className="no-drag flex items-center gap-2">
      {updateMessage && <span className="hidden text-xs text-slate-400 md:inline">{updateMessage}</span>}
      {showUpdatePrompt ? (
        <>
          <button
            className="btn-ghost app-tooltip-target"
            data-app-tooltip={tooltipText("Install Update", "Download and install the available update.")}
            aria-label="Install available update"
            onClick={onApplyUpdate}
            disabled={updateInstallPending}
          >
            {updateInstallPending ? "Installing..." : "Install now"}
          </button>
          <button
            className="btn-ghost app-tooltip-target"
            data-app-tooltip={tooltipText("Later", "Dismiss this update prompt until next launch.")}
            aria-label="Remind me later about update"
            onClick={onDismissUpdate}
            disabled={updateInstallPending}
          >
            Later
          </button>
        </>
      ) : null}
      {activeProjectWebLinks.map((link) => (
        <button
          key={link.id}
          className="btn-ghost app-tooltip-target"
          data-app-tooltip={tooltipText(link.name || "Open Link", `Open: ${link.url}`)}
          aria-label={link.name || link.url}
          onClick={() =>
            onOpenProjectWebLink(link).catch((error) => appendLog(`Open web link failed: ${String(error)}`))
          }
        >
          <span className="inline-flex items-center gap-1">
            <FaExternalLinkAlt className="text-[10px]" />
            {link.name || "Link"}
          </span>
        </button>
      ))}
      <div className="relative" ref={terminalMenuRef}>
        <button
          ref={terminalMenuTriggerRef}
          className="btn-ghost app-tooltip-target inline-flex items-center gap-1"
          data-app-tooltip={tooltipText("Terminal Menu", "Open, switch, and manage project terminals.", `${platformShortcutModifier}+T`)}
          aria-label="Open terminal menu"
          onClick={() => setIsTerminalMenuOpen((prev) => !prev)}
          disabled={!activeProjectId}
        >
          <span className="inline-flex items-center gap-1">
            <FaTerminal className="text-[10px]" />
            Terminal
            {activeProjectId ? (
              <span className="rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] text-slate-300">
                {activeRunningTerminalsCount}/{activeProjectTerminals.length}
              </span>
            ) : null}
          </span>
          <FaChevronDown className="text-[10px] text-slate-500" />
        </button>
        {isTerminalMenuOpen && (
          <div ref={terminalMenuContentRef} className="terminal-menu-pop" onKeyDown={moveTerminalMenuFocus}>
            <div className="terminal-menu-row flex items-center gap-2">
              <button
                type="button"
                className={`min-w-0 flex-1 text-left ${launchingSystemTerminalId === (defaultSystemTerminal?.id ?? "default-terminal") ? "terminal-launching" : ""}`}
                onClick={() => {
                  launchSystemTerminal();
                  setIsTerminalMenuOpen(false);
                  setShowTerminalAlternatives(false);
                }}
              >
                <span className="inline-flex items-center gap-1.5">
                  <TerminalGlyph terminalId={defaultSystemTerminal?.id ?? "auto"} />
                  Open {defaultSystemTerminal?.label ?? "Terminal"}
                  {launchingSystemTerminalId === (defaultSystemTerminal?.id ?? "default-terminal") ? (
                    <span className="loading-ring" aria-hidden="true" />
                  ) : null}
                </span>
              </button>
              {alternativeSystemTerminals.length > 0 ? (
                <button
                  type="button"
                  className="btn-ghost app-tooltip-target h-6 px-1.5 py-0 text-[10px]"
                  data-app-tooltip={
                    showTerminalAlternatives
                      ? tooltipText("Terminal Options", "Hide alternative terminal launchers.")
                      : tooltipText("Terminal Options", "Show alternative terminal launchers.")
                  }
                  aria-label={showTerminalAlternatives ? "Hide terminal options" : "Show terminal options"}
                  onClick={() => {
                    setShowTerminalAlternatives((prev) => !prev);
                  }}
                >
                  <FaChevronRight
                    className={`terminal-options-toggle-icon text-[10px] text-slate-400 ${showTerminalAlternatives ? "is-open" : ""}`}
                  />
                </button>
              ) : null}
            </div>
            <div className={`terminal-system-options ${showTerminalAlternatives ? "is-open" : ""}`}>
              {alternativeSystemTerminals.map((terminal, index) => (
                <button
                  key={terminal.id}
                  className={`terminal-menu-row pl-6 ${showTerminalAlternatives ? "terminal-system-option-row" : ""} ${launchingSystemTerminalId === terminal.id ? "terminal-launching" : ""}`}
                  style={showTerminalAlternatives ? { animationDelay: `${index * 28}ms` } : undefined}
                  onClick={() => {
                    launchSystemTerminal(terminal.id);
                    setIsTerminalMenuOpen(false);
                    setShowTerminalAlternatives(false);
                  }}
                >
                  <span className="inline-flex items-center gap-1.5">
                    <TerminalGlyph terminalId={terminal.id} />
                    Open {terminal.label}
                    {launchingSystemTerminalId === terminal.id ? (
                      <span className="loading-ring" aria-hidden="true" />
                    ) : null}
                  </span>
                </button>
              ))}
            </div>
            {availableSystemTerminals.length === 0 ? <div className="terminal-menu-empty">No system terminals detected.</div> : null}
            <button
              className="terminal-menu-row"
              onClick={() => {
                onOpenTerminalDashboardPopout();
                setIsTerminalMenuOpen(false);
              }}
            >
              {isTerminalDashboardPoppedOut ? "Focus Terminal Dashboard" : "Open Terminal Dashboard"}
            </button>
            <div className="terminal-menu-divider" />
            {activeProjectTerminals.length === 0 ? (
              <div className="terminal-menu-empty">No dev terminals configured.</div>
            ) : (
              <>
                <div className="terminal-menu-meta">Running {activeRunningTerminalsCount}/{activeProjectTerminals.length}</div>
                {activeProjectTerminals.map((terminal) => (
                  <div
                    key={`menu-${terminal.commandId}`}
                    className="terminal-menu-item app-tooltip-target"
                    data-app-tooltip={tooltipText("Pop Out Terminal", "Open this terminal in a dedicated window.")}
                    role="button"
                    tabIndex={0}
                    onClick={() => {
                      onOpenTerminalPopout(terminal);
                      setIsTerminalMenuOpen(false);
                    }}
                    onKeyDown={(event) => {
                      if (event.key !== "Enter" && event.key !== " ") {
                        return;
                      }
                      event.preventDefault();
                      onOpenTerminalPopout(terminal);
                      setIsTerminalMenuOpen(false);
                    }}
                  >
                    <div className="terminal-menu-row">
                      <span className="truncate">
                        {terminal.name}
                        {terminal.useForPreview ? " (Browser)" : ""}
                      </span>
                      <span className="terminal-menu-status">{terminal.running ? "Running" : "Stopped"}</span>
                    </div>
                    <div className="terminal-menu-actions">
                      <button
                        className="btn-ghost px-2 py-1 text-[10px]"
                        onClick={(event) => {
                          event.stopPropagation();
                          onStartTerminal(terminal.commandId).catch((error) =>
                            appendLog(`Terminal start failed: ${String(error)}`)
                          );
                        }}
                      >
                        {terminal.running ? "Restart" : "Start"}
                      </button>
                      <button
                        className="btn-ghost px-2 py-1 text-[10px]"
                        onClick={(event) => {
                          event.stopPropagation();
                          onCopyTerminalOutput(terminal.name, terminal.outputTail || "");
                        }}
                        disabled={!terminal.outputTail?.trim()}
                      >
                        Copy
                      </button>
                      {terminal.running ? (
                        <button
                          className="btn-ghost px-2 py-1 text-[10px]"
                          onClick={(event) => {
                            event.stopPropagation();
                            onStopTerminal(terminal.commandId).catch((error) =>
                              appendLog(`Terminal stop failed: ${String(error)}`)
                            );
                          }}
                        >
                          Stop
                        </button>
                      ) : null}
                    </div>
                  </div>
                ))}
              </>
            )}
          </div>
        )}
      </div>
      <button
        className="btn-ghost app-tooltip-target"
        data-app-tooltip={tooltipText("Project Files", "Open the active project folder in your file explorer.")}
        aria-label="Open project files"
        onClick={() => onOpenProjectFiles().catch((error) => appendLog(`Open files failed: ${String(error)}`))}
        disabled={!activeProjectId}
      >
        <span className="inline-flex items-center gap-1"><FaFolderOpen className="text-[10px]" />Files</span>
      </button>
      {activeProjectBrowserEnabled && (
        <button
          className="btn-ghost app-tooltip-target"
          data-app-tooltip={
            isPreviewOpen
              ? tooltipText("Preview Panel", "Hide the live preview panel.")
              : tooltipText("Preview Panel", "Show the live preview panel.")
          }
          aria-label={isPreviewOpen ? "Hide preview panel" : "Show preview panel"}
          onClick={onTogglePreviewPanel}
        >
          <span className="inline-flex items-center gap-1"><FaEye className="text-[10px]" />{isPreviewOpen ? "Hide Preview" : "Preview"}</span>
        </button>
      )}
      <button
        className="btn-ghost app-tooltip-target"
        data-app-tooltip={
          isGitPanelOpen ? tooltipText("Git Panel", "Hide the git panel.") : tooltipText("Git Panel", "Show the git panel.")
        }
        aria-label={isGitPanelOpen ? "Hide git panel" : "Show git panel"}
        onClick={onToggleGitPanel}
      >
        <span className="inline-flex items-center gap-1">
          <FaCodeBranch className="text-[10px]" />
          {isGitPanelOpen ? "Hide Git" : "Git"}
          {showHeaderGitDiffStats ? (
            <span className="git-header-diff-badge header-pill px-1.5 py-0.5 text-[10px]">
              <span className="text-emerald-300">+{activeGitAddedLines}</span>
              <span className="px-1 text-slate-500">/</span>
              <span className="text-rose-300">-{activeGitRemovedLines}</span>
            </span>
          ) : null}
        </span>
      </button>
      <button
        className="sidebar-settings-btn app-tooltip-target"
        data-app-tooltip={tooltipText("Settings", "Open application settings.", `${platformShortcutModifier}+I`)}
        aria-label="Open app settings"
        onClick={() => {
          onOpenSettingsWindow().catch((error) => {
            appendLog(`Open settings window failed: ${String(error)}`);
          });
        }}
      >
        <span className="inline-flex items-center gap-1"><FaCog className="text-[11px]" />Settings</span>
      </button>
      {useWindowsStyleHeader ? (
        <div className="window-controls ml-1">
          <button
            className="window-control-btn app-tooltip-target"
            data-app-tooltip={tooltipText("Minimize", "Minimize the app window.")}
            aria-label="Minimize window"
            onClick={() => void onMinimizeWindow()}
          >
            <FaWindowMinimize className="window-control-icon" />
          </button>
          <button
            className="window-control-btn app-tooltip-target"
            data-app-tooltip={tooltipText("Maximize / Restore", "Toggle maximized window state.")}
            aria-label="Maximize or restore window"
            onClick={() => void onToggleMaximizeWindow()}
          >
            {isWindowMaximized ? <FaWindowRestore className="window-control-icon" /> : <FaWindowMaximize className="window-control-icon" />}
          </button>
          <button
            className="window-control-btn window-control-close app-tooltip-target"
            data-app-tooltip={tooltipText("Close", "Close the app window.")}
            aria-label="Close window"
            onClick={() => void onCloseWindow()}
          >
            <FaTimes className="window-control-icon" />
          </button>
        </div>
      ) : null}
    </div>
  </header>
  );
};

export const MainHeader = memo(MainHeaderComponent);
