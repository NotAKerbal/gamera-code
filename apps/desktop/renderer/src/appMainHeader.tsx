import { memo, useEffect, useMemo, useRef, useState, type Dispatch, type MouseEvent as ReactMouseEvent, type RefObject, type SetStateAction } from "react";
import {
  FaApple,
  FaChevronDown,
  FaChevronLeft,
  FaCodeBranch,
  FaCog,
  FaCode,
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
  onRenameWorkspace: (workspaceId: string) => Promise<void>;
  onSetWorkspaceColor: (workspaceId: string, color: string) => Promise<void>;
  onDeleteWorkspace: (workspaceId: string) => Promise<void>;
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
  activeProjectId: string | null;
  activeProjectTerminals: HeaderTerminal[];
  systemTerminals: SystemTerminalOption[];
  onOpenProjectTerminal: (terminalId?: string) => Promise<void>;
  onOpenTerminalPopout: (terminal: HeaderTerminal) => void;
  onAcknowledgeTerminalError: (commandId: string) => void;
  onOpenProjectSettings: (commandId?: string) => Promise<void>;
  onStartTerminal: (commandId: string) => Promise<void>;
  onStopTerminal: (commandId: string) => Promise<void>;
  onCopyTerminalOutput: (name: string, output: string) => void;
  onOpenProjectFiles: () => Promise<void>;
  activeProjectBrowserEnabled: boolean;
  isCodePanelOpen: boolean;
  isPreviewOpen: boolean;
  isGitPanelOpen: boolean;
  isGitPushBusy: boolean;
  onToggleCodePanel: () => void;
  onTogglePreviewPanel: () => void;
  onOpenGitPanel: () => void;
  onPushGitChanges: () => void;
  showHeaderGitDiffStats: boolean;
  activeGitAddedLines: number;
  activeGitRemovedLines: number;
  onOpenSettingsWindow: () => Promise<void>;
  onMinimizeWindow: () => void | Promise<void>;
  onToggleMaximizeWindow: () => void | Promise<void>;
  onCloseWindow: () => void | Promise<void>;
  appendLog: (line: string) => void;
};

const WORKSPACE_COLOR_PRESETS = [
  "#64748b",
  "#2563eb",
  "#059669",
  "#d97706",
  "#dc2626",
  "#7c3aed"
];

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
  onRenameWorkspace,
  onSetWorkspaceColor,
  onDeleteWorkspace,
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
  activeProjectId,
  activeProjectTerminals,
  systemTerminals,
  onOpenProjectTerminal,
  onOpenTerminalPopout,
  onAcknowledgeTerminalError,
  onOpenProjectSettings,
  onStartTerminal,
  onStopTerminal,
  onCopyTerminalOutput,
  onOpenProjectFiles,
  activeProjectBrowserEnabled,
  isCodePanelOpen,
  isPreviewOpen,
  isGitPanelOpen,
  isGitPushBusy,
  onToggleCodePanel,
  onTogglePreviewPanel,
  onOpenGitPanel,
  onPushGitChanges,
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
  const actionMenuRef = useRef<HTMLDivElement | null>(null);
  const workspaceMenuRef = useRef<HTMLDivElement | null>(null);
  const [openTerminalActionMenuId, setOpenTerminalActionMenuId] = useState<string | null>(null);
  const [workspaceContextMenu, setWorkspaceContextMenu] = useState<{ workspaceId: string; x: number; y: number } | null>(null);
  const [runningTerminalActionId, setRunningTerminalActionId] = useState<string | null>(null);
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
  const contextWorkspace = useMemo(
    () => (workspaceContextMenu ? workspaces.find((workspace) => workspace.id === workspaceContextMenu.workspaceId) ?? null : null),
    [workspaces, workspaceContextMenu]
  );
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
  const toggleProjectTerminal = (terminal: HeaderTerminal) => {
    const commandId = terminal.commandId.trim();
    if (!commandId) {
      appendLog(`Terminal ${terminal.running ? "stop" : "start"} failed: missing command id for ${terminal.name}`);
      return;
    }
    const actionId = `${terminal.commandId}:${terminal.running ? "stop" : "start"}`;
    setRunningTerminalActionId(actionId);
    const task = terminal.running ? onStopTerminal(commandId) : onStartTerminal(commandId);
    task
      .catch((error) => appendLog(`Terminal ${terminal.running ? "stop" : "start"} failed: ${String(error)}`))
      .finally(() => {
        setRunningTerminalActionId((current) => (current === actionId ? null : current));
      });
  };
  const runNamedTerminalAction = (terminal: HeaderTerminal, action: "restart" | "view" | "copy") => {
    const commandId = terminal.commandId.trim();
    if ((action === "restart" || action === "view" || action === "copy") && !commandId) {
      appendLog(`Terminal ${action} failed: missing command id for ${terminal.name}`);
      return;
    }
    const actionId = `${terminal.commandId}:${action}`;
    setRunningTerminalActionId(actionId);
    const task =
      action === "restart"
        ? onStartTerminal(commandId)
        : action === "view"
          ? Promise.resolve(onOpenTerminalPopout(terminal))
          : Promise.resolve(onCopyTerminalOutput(terminal.name, terminal.outputTail || ""));
    task
      .catch((error) => appendLog(`Terminal ${action} failed: ${String(error)}`))
      .finally(() => {
        setRunningTerminalActionId((current) => (current === actionId ? null : current));
      });
  };

  useEffect(() => {
    if (!openTerminalActionMenuId) {
      return;
    }
    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!actionMenuRef.current?.contains(target)) {
        setOpenTerminalActionMenuId(null);
      }
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpenTerminalActionMenuId(null);
      }
    };
    window.addEventListener("mousedown", handlePointerDown);
    window.addEventListener("keydown", handleEscape);
    return () => {
      window.removeEventListener("mousedown", handlePointerDown);
      window.removeEventListener("keydown", handleEscape);
    };
  }, [openTerminalActionMenuId]);

  useEffect(() => {
    setOpenTerminalActionMenuId(null);
  }, [activeProjectId]);

  useEffect(() => {
    if (!workspaceContextMenu) {
      return;
    }
    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!workspaceMenuRef.current?.contains(target)) {
        setWorkspaceContextMenu(null);
      }
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setWorkspaceContextMenu(null);
      }
    };
    window.addEventListener("mousedown", handlePointerDown);
    window.addEventListener("keydown", handleEscape);
    return () => {
      window.removeEventListener("mousedown", handlePointerDown);
      window.removeEventListener("keydown", handleEscape);
    };
  }, [workspaceContextMenu]);

  useEffect(() => {
    if (!workspaceContextMenu) {
      return;
    }
    if (!workspaces.some((workspace) => workspace.id === workspaceContextMenu.workspaceId)) {
      setWorkspaceContextMenu(null);
    }
  }, [workspaces, workspaceContextMenu]);

  const openWorkspaceContextMenuAt = (workspaceId: string, xInput: number, yInput: number) => {
    const menuWidth = 196;
    const menuHeight = 178;
    const x = Math.min(xInput, Math.max(8, window.innerWidth - menuWidth - 8));
    const y = Math.min(yInput, Math.max(8, window.innerHeight - menuHeight - 8));
    setWorkspaceContextMenu({ workspaceId, x, y });
  };
  const openWorkspaceContextMenu = (event: ReactMouseEvent<HTMLButtonElement>, workspaceId: string) => {
    event.preventDefault();
    event.stopPropagation();
    openWorkspaceContextMenuAt(workspaceId, event.clientX, event.clientY);
  };

  const openTerminalOutput = (terminal: HeaderTerminal) => {
    try {
      onOpenTerminalPopout(terminal);
    } catch (error) {
      appendLog(`Open terminal output failed: ${String(error)}`);
    }
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
              onClick={() => {
                setWorkspaceContextMenu(null);
                onSelectWorkspace(workspace.id);
              }}
              onContextMenu={(event) => openWorkspaceContextMenu(event, workspace.id)}
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
                  event.preventDefault();
                  event.stopPropagation();
                  const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
                  openWorkspaceContextMenuAt(workspace.id, rect.right + 4, rect.bottom + 4);
                }}
                role="button"
                tabIndex={0}
                onKeyDown={(event) => {
                  if (event.key !== "Enter" && event.key !== " ") {
                    return;
                  }
                  event.preventDefault();
                  event.stopPropagation();
                  const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
                  openWorkspaceContextMenuAt(workspace.id, rect.right + 4, rect.bottom + 4);
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
      {workspaceContextMenu ? (
        <div
          ref={workspaceMenuRef}
          className="thread-context-menu is-open"
          style={{ left: `${workspaceContextMenu.x}px`, top: `${workspaceContextMenu.y}px` }}
        >
          <button
            type="button"
            className="thread-context-menu-item"
            onClick={() => {
              onRenameWorkspace(workspaceContextMenu.workspaceId).catch((error) => {
                appendLog(`Workspace rename failed: ${String(error)}`);
              });
              setWorkspaceContextMenu(null);
            }}
          >
            Rename workspace
          </button>
          <button
            type="button"
            className="thread-context-menu-item"
            onClick={() => {
              onDeleteWorkspace(workspaceContextMenu.workspaceId).catch((error) => {
                appendLog(`Workspace delete failed: ${String(error)}`);
              });
              setWorkspaceContextMenu(null);
            }}
            disabled={workspaces.length <= 1}
          >
            Delete workspace
          </button>
          <div className="thread-context-menu-divider" />
          <div className="thread-context-menu-colors" role="group" aria-label="Workspace color">
            {WORKSPACE_COLOR_PRESETS.map((color) => {
              const selected = (contextWorkspace?.color ?? "").toLowerCase() === color.toLowerCase();
              return (
                <button
                  key={color}
                  type="button"
                  className={`thread-context-color-btn ${selected ? "is-selected" : ""}`}
                  style={{ backgroundColor: color }}
                  onClick={() => {
                    onSetWorkspaceColor(workspaceContextMenu.workspaceId, color).catch((error) => {
                      appendLog(`Workspace color update failed: ${String(error)}`);
                    });
                    setWorkspaceContextMenu(null);
                  }}
                  aria-label={`Set workspace color ${color}`}
                  title={color}
                />
              );
            })}
          </div>
        </div>
      ) : null}
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
      <div className="terminal-header-controls">
        <div className="workspace-segmented-control terminal-actions-group no-drag">
            {activeProjectTerminals.map((terminal) => {
              const isMenuOpen = openTerminalActionMenuId === terminal.commandId;
              const busyToggleId = `${terminal.commandId}:${terminal.running ? "stop" : "start"}`;
              const hasCompleted = !terminal.running && typeof terminal.lastExitCode === "number";
              const isSuccess = hasCompleted && terminal.lastExitCode === 0;
              const isError = hasCompleted && terminal.lastExitCode !== 0;
              const actionTooltip = terminal.running
                ? tooltipText("Stop Action", "This action is running. Click to stop it.")
                : isError
                  ? tooltipText("View Error Output", "The last run failed. Click to open output and clear the error state.")
                  : isSuccess
                    ? tooltipText("View Final Output", "The last run completed successfully. Click to view the final output.")
                    : tooltipText("Start Action", "This action is idle. Click to start it.");
              const statusClass = isSuccess
                ? "terminal-action-segment-success"
                : isError
                  ? "terminal-action-segment-error"
                  : terminal.running
                    ? "terminal-action-segment-running"
                    : "";
              return (
                <div
                  key={`terminal-action-${terminal.commandId}`}
                  className={`workspace-segment ${statusClass ? `active ${statusClass}` : ""} terminal-action-segment ${isError ? "terminal-action-segment-has-dismiss" : ""}`}
                  ref={isMenuOpen ? actionMenuRef : null}
                >
                  <button
                    type="button"
                    className="terminal-action-main app-tooltip-target"
                    data-app-tooltip={actionTooltip}
                    onClick={() => {
                      if (terminal.running) {
                        toggleProjectTerminal(terminal);
                        return;
                      }
                      if (hasCompleted) {
                        if (isError) {
                          const commandId = terminal.commandId.trim();
                          if (commandId) {
                            onAcknowledgeTerminalError(commandId);
                          }
                        }
                        openTerminalOutput(terminal);
                        return;
                      }
                      toggleProjectTerminal(terminal);
                    }}
                    disabled={runningTerminalActionId === busyToggleId}
                    title={terminal.name}
                  >
                    <span className="workspace-segment-name truncate">
                      {terminal.name}
                    </span>
                  </button>
                  <div className={`terminal-action-controls ${isMenuOpen ? "is-open" : ""}`}>
                    {isError ? (
                      <button
                        type="button"
                        className="terminal-action-dismiss-error app-tooltip-target"
                        aria-label={`Dismiss error for ${terminal.name}`}
                        data-app-tooltip={tooltipText("Dismiss Error", "Clear this error state without opening the output modal.")}
                      onClick={(event) => {
                        event.stopPropagation();
                        const commandId = terminal.commandId.trim();
                        if (commandId) {
                          onAcknowledgeTerminalError(commandId);
                        }
                      }}
                    >
                        <FaTimes className="text-[10px] text-slate-400" />
                      </button>
                    ) : null}
                    <button
                      type="button"
                      className={`terminal-action-more ${isMenuOpen ? "is-open" : ""}`}
                      aria-label={`Open actions for ${terminal.name}`}
                      onClick={() => setOpenTerminalActionMenuId((current) => (current === terminal.commandId ? null : terminal.commandId))}
                    >
                      <FaChevronDown className="text-[10px] text-slate-400" />
                    </button>
                  </div>
                {isMenuOpen ? (
                  <div className="project-action-pop terminal-action-pop">
                    <button
                      className="project-action-item"
                      onClick={() => {
                        runNamedTerminalAction(terminal, "view");
                        setOpenTerminalActionMenuId(null);
                      }}
                    >
                      View output
                    </button>
                    <button
                      className="project-action-item"
                      onClick={() => {
                        runNamedTerminalAction(terminal, "restart");
                        setOpenTerminalActionMenuId(null);
                      }}
                      disabled={runningTerminalActionId === `${terminal.commandId}:restart`}
                    >
                      Restart
                    </button>
                    <button
                      className="project-action-item"
                      onClick={() => {
                        runNamedTerminalAction(terminal, "copy");
                        setOpenTerminalActionMenuId(null);
                      }}
                      disabled={!terminal.outputTail?.trim()}
                    >
                      Copy output
                    </button>
                    <button
                      className="project-action-item"
                      onClick={() => {
                        onOpenProjectSettings(terminal.commandId).catch((error) =>
                          appendLog(`Open action settings failed: ${String(error)}`)
                        );
                        setOpenTerminalActionMenuId(null);
                      }}
                    >
                      Settings
                    </button>
                  </div>
                ) : null}
              </div>
            );
          })}
          <button
            className="workspace-segment workspace-segment-add app-tooltip-target"
            type="button"
            data-app-tooltip={
              activeProjectTerminals.length > 0
                ? tooltipText("Action Settings", "Open settings for this project's actions.")
                : tooltipText("Add Action", "Open action settings to add your first action.")
            }
            onClick={() => {
              onOpenProjectSettings().catch((error) => appendLog(`Open action settings failed: ${String(error)}`));
            }}
            aria-label={activeProjectTerminals.length > 0 ? "Open action settings" : "Add action"}
            disabled={!activeProjectId}
          >
            {activeProjectTerminals.length > 0 ? (
              <FaCog className="text-[10px]" />
            ) : (
              <span className="inline-flex items-center gap-1">
                <FaPlus className="text-[10px]" />
                Add Action
              </span>
            )}
          </button>
        </div>
        <button
          className={`btn-ghost app-tooltip-target inline-flex items-center gap-1 ${launchingSystemTerminalId === (defaultSystemTerminal?.id ?? "default-terminal") ? "terminal-launching" : ""}`}
          data-app-tooltip={tooltipText("Open Terminal", "Open your default system terminal for this project.", `${platformShortcutModifier}+T`)}
          aria-label="Open default terminal"
          onClick={() => launchSystemTerminal()}
          disabled={!activeProjectId || availableSystemTerminals.length === 0}
        >
          <span className="inline-flex items-center gap-1">
            <TerminalGlyph terminalId={defaultSystemTerminal?.id ?? "auto"} />
            Terminal
            {launchingSystemTerminalId === (defaultSystemTerminal?.id ?? "default-terminal") ? (
              <span className="loading-ring" aria-hidden="true" />
            ) : null}
          </span>
        </button>
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
          isCodePanelOpen
            ? tooltipText("Code Panel", "Code panel is already active.")
            : tooltipText("Code Panel", "Switch to the code panel.")
        }
        aria-label={isCodePanelOpen ? "Code panel active" : "Show code panel"}
        onClick={onToggleCodePanel}
      >
        <span className="inline-flex items-center gap-1"><FaCode className="text-[10px]" />Code</span>
      </button>
      <div className="git-header-segmented-control no-drag">
        <button
          className="git-header-main-btn app-tooltip-target"
          data-app-tooltip={tooltipText("Push", "Stage all changes, create an AI commit message, commit, and push.")}
          aria-label="Stage, commit, and push changes"
          onClick={onPushGitChanges}
          disabled={!activeProjectId || isGitPushBusy}
        >
          <span className="inline-flex items-center gap-1">
            <FaCodeBranch className="text-[10px]" />
            Push
            {isGitPushBusy ? <span className="loading-ring" aria-hidden="true" /> : null}
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
          className="git-header-panel-btn app-tooltip-target"
          data-app-tooltip={
            isGitPanelOpen
              ? tooltipText("Git Panel", "Close the git panel on the right sidebar.")
              : tooltipText("Git Panel", "Open the git panel on the right sidebar.")
          }
          aria-label={isGitPanelOpen ? "Close git panel" : "Open git panel"}
          onClick={onOpenGitPanel}
          disabled={!activeProjectId}
        >
          <FaChevronLeft
            className={`text-[10px] transition-transform duration-200 ease-out ${
              isGitPanelOpen ? "rotate-180" : "rotate-0"
            }`}
          />
        </button>
      </div>
      <button
        className="sidebar-settings-btn app-tooltip-target inline-flex h-8 w-8 items-center justify-center px-0"
        data-app-tooltip={tooltipText("Settings", "Open application settings.", `${platformShortcutModifier}+I`)}
        aria-label="Open app settings"
        onClick={() => {
          onOpenSettingsWindow().catch((error) => {
            appendLog(`Open settings window failed: ${String(error)}`);
          });
        }}
      >
        <FaCog className="text-[11px]" />
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
