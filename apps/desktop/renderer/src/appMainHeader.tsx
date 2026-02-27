import { useMemo, useState, type Dispatch, type KeyboardEvent as ReactKeyboardEvent, type RefObject, type SetStateAction } from "react";
import {
  FaApple,
  FaChevronDown,
  FaChevronRight,
  FaCodeBranch,
  FaCog,
  FaExternalLinkAlt,
  FaEye,
  FaFolderOpen,
  FaSyncAlt,
  FaTerminal,
  FaTimes,
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
  changelogItems: string[];
  changelogRef: RefObject<HTMLDivElement | null>;
  isChangelogOpen: boolean;
  setIsChangelogOpen: Dispatch<SetStateAction<boolean>>;
  updateMessage: string;
  activeProjectWebLinks: ProjectWebLink[];
  onOpenProjectWebLink: (link: ProjectWebLink) => Promise<void>;
  onCheckUpdates: () => void;
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
    terminalId === "konsole" ||
    terminalId === "xfce4-terminal"
  ) {
    return <FaLinux className="text-[10px] text-slate-400" />;
  }
  return <FaTerminal className="text-[10px] text-slate-400" />;
};

export const MainHeader = ({
  isMacOS,
  isWindows,
  isWindowMaximized,
  appIconSrc,
  appVersionLabel,
  changelogItems,
  changelogRef,
  isChangelogOpen,
  setIsChangelogOpen,
  updateMessage,
  activeProjectWebLinks,
  onOpenProjectWebLink,
  onCheckUpdates,
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
  const [showTerminalAlternatives, setShowTerminalAlternatives] = useState(false);
  const [launchingSystemTerminalId, setLaunchingSystemTerminalId] = useState<string | null>(null);
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
    onOpenProjectTerminal(terminalId)
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
      isMacOS ? "window-header-macos" : isWindows ? "window-header-windows" : ""
    }`}
  >
    <div className="flex items-center gap-2 text-sm font-semibold tracking-tight text-slate-100">
      <img src={appIconSrc} alt="GameraCode icon" className="h-8 w-8 rounded-xl object-cover" />
      <span>GameraCode</span>
      <div className="relative no-drag" ref={changelogRef}>
        <button
          className="rounded bg-zinc-800/80 px-1.5 py-0.5 text-[10px] font-medium text-slate-400 transition hover:bg-zinc-700/90 hover:text-slate-200"
          onClick={() => setIsChangelogOpen((prev) => !prev)}
          title={`What's new in ${appVersionLabel}`}
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
    </div>
    <div className="no-drag flex items-center gap-2">
      {updateMessage && <span className="hidden text-xs text-slate-400 md:inline">{updateMessage}</span>}
      {activeProjectWebLinks.map((link) => (
        <button
          key={link.id}
          className="btn-ghost"
          title={`${link.name || link.url} (${link.url})`}
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
      <button className="btn-ghost" onClick={onCheckUpdates} title="Check for updates">
        <span className="inline-flex items-center gap-1"><FaSyncAlt className="text-[10px]" />Updates</span>
      </button>
      <div className="relative" ref={terminalMenuRef}>
        <button
          ref={terminalMenuTriggerRef}
          className="btn-ghost inline-flex items-center gap-1"
          title="Select project terminal"
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
                  className="btn-ghost h-6 px-1.5 py-0 text-[10px]"
                  title={showTerminalAlternatives ? "Hide terminal options" : "Show terminal options"}
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
                    className="terminal-menu-item"
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
                    title="Pop out terminal"
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
        className="btn-ghost"
        title="Open project folder in file explorer"
        onClick={() => onOpenProjectFiles().catch((error) => appendLog(`Open files failed: ${String(error)}`))}
        disabled={!activeProjectId}
      >
        <span className="inline-flex items-center gap-1"><FaFolderOpen className="text-[10px]" />Files</span>
      </button>
      {activeProjectBrowserEnabled && (
        <button className="btn-ghost" title={isPreviewOpen ? "Hide preview panel" : "Show preview panel"} onClick={onTogglePreviewPanel}>
          <span className="inline-flex items-center gap-1"><FaEye className="text-[10px]" />{isPreviewOpen ? "Hide Preview" : "Preview"}</span>
        </button>
      )}
      <button className="btn-ghost" title={isGitPanelOpen ? "Hide git panel" : "Show git panel"} onClick={onToggleGitPanel}>
        <span className="inline-flex items-center gap-1">
          <FaCodeBranch className="text-[10px]" />
          {isGitPanelOpen ? "Hide Git" : "Git"}
          {showHeaderGitDiffStats ? (
            <span className="git-header-diff-badge rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] text-slate-300">
              <span className="text-emerald-300">+{activeGitAddedLines}</span>
              <span className="px-1 text-slate-500">/</span>
              <span className="text-rose-300">-{activeGitRemovedLines}</span>
            </span>
          ) : null}
        </span>
      </button>
      <button
        className="sidebar-settings-btn"
        onClick={() => {
          onOpenSettingsWindow().catch((error) => {
            appendLog(`Open settings window failed: ${String(error)}`);
          });
        }}
        title="Open app settings"
      >
        <span className="inline-flex items-center gap-1"><FaCog className="text-[11px]" />Settings</span>
      </button>
      {isWindows ? (
        <div className="window-controls ml-1">
          <button className="window-control-btn" onClick={() => void onMinimizeWindow()} title="Minimize">
            <FaWindowMinimize className="window-control-icon" />
          </button>
          <button className="window-control-btn" onClick={() => void onToggleMaximizeWindow()} title="Maximize or restore">
            {isWindowMaximized ? <FaWindowRestore className="window-control-icon" /> : <FaWindowMaximize className="window-control-icon" />}
          </button>
          <button className="window-control-btn window-control-close" onClick={() => void onCloseWindow()} title="Close">
            <FaTimes className="window-control-icon" />
          </button>
        </div>
      ) : null}
    </div>
  </header>
  );
};
