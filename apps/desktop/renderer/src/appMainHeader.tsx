import type { Dispatch, KeyboardEvent as ReactKeyboardEvent, RefObject, SetStateAction } from "react";
import {
  FaChevronDown,
  FaCodeBranch,
  FaCog,
  FaExternalLinkAlt,
  FaEye,
  FaFolderOpen,
  FaSyncAlt,
  FaTerminal,
  FaTimes,
  FaWindowMaximize,
  FaWindowMinimize,
  FaWindowRestore
} from "react-icons/fa";
import type { ProjectTerminalState, ProjectWebLink } from "@code-app/shared";

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
  isTerminalDashboardPoppedOut: boolean;
  onOpenProjectTerminal: () => Promise<void>;
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
}: MainHeaderProps) => (
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
            <button
              className="terminal-menu-row"
              onClick={() => {
                onOpenProjectTerminal().catch((error) => appendLog(`Open terminal failed: ${String(error)}`));
                setIsTerminalMenuOpen(false);
              }}
            >
              Open Native Shell
            </button>
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
