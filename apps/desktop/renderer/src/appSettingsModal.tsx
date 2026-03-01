import { memo, useEffect, useState, type CSSProperties, type Dispatch, type SetStateAction } from "react";
import { FaTimes } from "react-icons/fa";
import type {
  AppTheme,
  AppSettings,
  CodexApprovalMode,
  CodexCollaborationMode,
  CodexModelReasoningEffort,
  CodexSandboxMode,
  CodexThreadOptions,
  CodexWebSearchMode,
  PermissionMode,
  ProjectTerminalSwitchBehavior,
  SystemTerminalOption,
  SkillRecord
} from "@code-app/shared";
import {
  APPROVAL_OPTIONS,
  COLLABORATION_OPTIONS,
  MODEL_SUGGESTIONS,
  PROJECT_SWITCH_BEHAVIOR_OPTIONS,
  SUBTHREAD_POLICY_OPTIONS,
  THEME_OPTIONS,
  REASONING_OPTIONS,
  SANDBOX_OPTIONS,
  WEB_SEARCH_OPTIONS,
  type AppSettingsTab
} from "./appCore";

type SettingsModalProps = {
  initialDraft: {
    settings: AppSettings;
    composerOptions: CodexThreadOptions;
    settingsEnvText: string;
    settingsTab: AppSettingsTab;
  };
  isSettingsWindow: boolean;
  isMacOS: boolean;
  isWindows: boolean;
  appIconSrc: string;
  appSkills: SkillRecord[];
  systemTerminals: SystemTerminalOption[];
  skillEditorPath: string;
  skillEditorContent: string;
  setSkillEditorContent: Dispatch<SetStateAction<string>>;
  skillEditorSaving: boolean;
  settingsSaveNotice: string;
  settingsSaving: boolean;
  onClose: () => void;
  onCloseWindow: () => void | Promise<void>;
  onSaveSettings: (draft: { settings: AppSettings; composerOptions: CodexThreadOptions; settingsEnvText: string }) => void | Promise<void>;
  onSaveSkillEditor: () => void | Promise<void>;
  onToggleAppSkillEnabled: (path: string, enabled: boolean) => Promise<void>;
  onOpenSkillEditor: (path: string) => Promise<void>;
  onPickDefaultProjectDirectory: () => Promise<string | null>;
  appendLog: (line: string) => void;
};

type ToggleButtonProps = {
  enabled: boolean;
  onToggle: (next: boolean) => void;
  className?: string;
  onLabel?: string;
  offLabel?: string;
};

const ToggleButton = ({ enabled, onToggle, className = "", onLabel = "On", offLabel = "Off" }: ToggleButtonProps) => (
  <button
    type="button"
    role="switch"
    aria-checked={enabled}
    className={`settings-toggle-btn ${enabled ? "is-enabled" : ""} ${className}`.trim()}
    onClick={() => onToggle(!enabled)}
  >
    <span className="settings-toggle-knob" aria-hidden="true" />
    <span>{enabled ? onLabel : offLabel}</span>
  </button>
);

const THEME_PREVIEW_STYLES: Record<AppTheme, CSSProperties> = {
  midnight: {
    ["--preview-shell-start" as string]: "#1b1b1b",
    ["--preview-shell-end" as string]: "#0a0a0a",
    ["--preview-sidebar-start" as string]: "#151515",
    ["--preview-sidebar-end" as string]: "#121212",
    ["--preview-border" as string]: "rgba(82, 82, 91, 0.9)",
    ["--preview-thread" as string]: "rgba(39, 39, 42, 0.85)",
    ["--preview-thread-active" as string]: "rgba(63, 63, 70, 0.95)",
    ["--preview-text" as string]: "rgba(241, 245, 249, 0.95)",
    ["--preview-muted" as string]: "rgba(148, 163, 184, 0.8)"
  },
  graphite: {
    ["--preview-shell-start" as string]: "#1d2433",
    ["--preview-shell-end" as string]: "#0b1220",
    ["--preview-sidebar-start" as string]: "#172030",
    ["--preview-sidebar-end" as string]: "#111827",
    ["--preview-border" as string]: "rgba(100, 116, 139, 0.95)",
    ["--preview-thread" as string]: "rgba(30, 41, 59, 0.88)",
    ["--preview-thread-active" as string]: "rgba(51, 65, 85, 0.98)",
    ["--preview-text" as string]: "rgba(241, 245, 249, 0.96)",
    ["--preview-muted" as string]: "rgba(148, 163, 184, 0.88)"
  },
  dawn: {
    ["--preview-shell-start" as string]: "#f4efe6",
    ["--preview-shell-end" as string]: "#ece4d6",
    ["--preview-sidebar-start" as string]: "#ebe2d1",
    ["--preview-sidebar-end" as string]: "#e2d7c2",
    ["--preview-border" as string]: "rgba(161, 138, 107, 0.45)",
    ["--preview-thread" as string]: "rgba(222, 207, 181, 0.9)",
    ["--preview-thread-active" as string]: "rgba(208, 188, 154, 0.96)",
    ["--preview-text" as string]: "rgba(56, 43, 28, 0.95)",
    ["--preview-muted" as string]: "rgba(115, 90, 60, 0.72)"
  },
  linen: {
    ["--preview-shell-start" as string]: "#f8fafc",
    ["--preview-shell-end" as string]: "#eef2f7",
    ["--preview-sidebar-start" as string]: "#f1f5f9",
    ["--preview-sidebar-end" as string]: "#e7edf4",
    ["--preview-border" as string]: "rgba(100, 116, 139, 0.34)",
    ["--preview-thread" as string]: "rgba(226, 232, 240, 0.95)",
    ["--preview-thread-active" as string]: "rgba(203, 213, 225, 0.98)",
    ["--preview-text" as string]: "rgba(30, 41, 59, 0.95)",
    ["--preview-muted" as string]: "rgba(71, 85, 105, 0.7)"
  },
  "orange-cat": {
    ["--preview-shell-start" as string]: "#41220f",
    ["--preview-shell-end" as string]: "#1f1109",
    ["--preview-sidebar-start" as string]: "#4b2811",
    ["--preview-sidebar-end" as string]: "#311a0c",
    ["--preview-border" as string]: "rgba(251, 146, 60, 0.55)",
    ["--preview-thread" as string]: "rgba(120, 53, 15, 0.72)",
    ["--preview-thread-active" as string]: "rgba(154, 52, 18, 0.92)",
    ["--preview-text" as string]: "rgba(255, 237, 213, 0.98)",
    ["--preview-muted" as string]: "rgba(254, 215, 170, 0.82)"
  }
};

export const SettingsModal = memo(({
  initialDraft,
  isSettingsWindow,
  isMacOS,
  isWindows,
  appIconSrc,
  appSkills,
  systemTerminals,
  skillEditorPath,
  skillEditorContent,
  setSkillEditorContent,
  skillEditorSaving,
  settingsSaveNotice,
  settingsSaving,
  onClose,
  onCloseWindow,
  onSaveSettings,
  onSaveSkillEditor,
  onToggleAppSkillEnabled,
  onOpenSkillEditor,
  onPickDefaultProjectDirectory,
  appendLog
}: SettingsModalProps) => {
  const [settingsTab, setSettingsTab] = useState<AppSettingsTab>(initialDraft.settingsTab);
  const [settings, setSettings] = useState<AppSettings>(initialDraft.settings);
  const [composerOptions, setComposerOptions] = useState<CodexThreadOptions>(initialDraft.composerOptions);
  const [settingsEnvText, setSettingsEnvText] = useState(initialDraft.settingsEnvText);

  useEffect(() => {
    setSettingsTab(initialDraft.settingsTab);
    setSettings(initialDraft.settings);
    setComposerOptions(initialDraft.composerOptions);
    setSettingsEnvText(initialDraft.settingsEnvText);
  }, [initialDraft]);

  const useWindowsStyleHeader = isWindows || !isMacOS;
  return (
    <div
      className={
        isSettingsWindow ? "fixed inset-0 z-40 theme-settings-surface" : "fixed inset-0 z-40 flex items-center justify-center bg-black/60 p-4"
      }
    >
    <div className={isSettingsWindow ? "relative flex h-full w-full flex-col theme-settings-surface" : "relative flex h-[42rem] max-h-[calc(100vh-2rem)] w-full max-w-3xl flex-col rounded-2xl border border-border bg-surface p-4 shadow-neon"}>
      {isSettingsWindow ? (
        <header
          className={`drag-region window-header flex h-12 shrink-0 items-center justify-between border-b border-border/90 px-3 ${
            isMacOS ? "window-header-macos" : useWindowsStyleHeader ? "window-header-windows" : ""
          }`}
        >
          <div className="flex items-center gap-2 text-sm font-semibold tracking-tight text-slate-100">
            <img src={appIconSrc} alt="GameraCode icon" className="h-8 w-8 rounded-xl object-cover" />
            <span>GameraCode - Settings</span>
          </div>
          <div className="no-drag flex items-center gap-2">
            {useWindowsStyleHeader ? (
              <div className="window-controls ml-1">
                <button className="window-control-btn window-control-close" onClick={() => void onCloseWindow()} title="Close">
                  <FaTimes className="window-control-icon" />
                </button>
              </div>
            ) : null}
          </div>
        </header>
      ) : (
        <div className="mb-4 flex shrink-0 items-center justify-between">
          <h3 className="text-lg font-semibold">Settings</h3>
          <button className="btn-secondary" onClick={onClose}>
            Close
          </button>
        </div>
      )}

      <div className={`flex min-h-0 flex-1 flex-col gap-4 md:flex-row ${isSettingsWindow ? "p-4" : ""}`}>
        <aside className="shrink-0 md:w-52">
          <div className="rounded-xl border border-border bg-black/20 p-2">
            <button
              className={settingsTab === "general" ? "settings-nav-btn is-active" : "settings-nav-btn"}
              onClick={() => setSettingsTab("general")}
            >
              <span className="settings-nav-label">General</span>
            </button>
            <button
              className={settingsTab === "codex" ? "settings-nav-btn mt-1 is-active" : "settings-nav-btn mt-1"}
              onClick={() => setSettingsTab("codex")}
            >
              <span className="settings-nav-label">Codex Defaults</span>
            </button>
            <button
              className={settingsTab === "env" ? "settings-nav-btn mt-1 is-active" : "settings-nav-btn mt-1"}
              onClick={() => setSettingsTab("env")}
            >
              <span className="settings-nav-label">Environment</span>
            </button>
            <button
              className={settingsTab === "skills" ? "settings-nav-btn mt-1 is-active" : "settings-nav-btn mt-1"}
              onClick={() => setSettingsTab("skills")}
            >
              <span className="settings-nav-label">Skills</span>
            </button>
          </div>
        </aside>

        <div key={`settings-tab-${settingsTab}`} className="settings-tab-panel min-h-0 flex-1 overflow-y-auto pr-1">
          {settingsTab === "general" && (
            <div className="space-y-3">
              <section className="rounded-xl border border-border/80 bg-black/20 py-2">
                <div className="mb-1 px-4 text-xs uppercase tracking-wide text-muted">App</div>
                <div className="mx-2 grid items-center gap-3 px-2 py-3 md:grid-cols-[220px_minmax(0,1fr)]">
                  <div className="text-sm text-muted">Permission mode</div>
                  <select
                    className="input"
                    value={settings.permissionMode}
                    onChange={(event) =>
                      setSettings((prev) => ({
                        ...prev,
                        permissionMode: event.target.value as PermissionMode
                      }))
                    }
                  >
                    <option value="prompt_on_risk">Prompt on risk</option>
                    <option value="always_ask">Always ask</option>
                    <option value="auto_allow">Auto allow</option>
                  </select>
                </div>
                <div className="mx-2 border-t border-border/70" />
                <div className="mx-2 grid items-center gap-3 px-2 py-3 md:grid-cols-[220px_minmax(0,1fr)]">
                  <div className="text-sm text-muted">Auto-rename new threads</div>
                  <ToggleButton
                    enabled={settings.autoRenameThreadTitles ?? true}
                    className="md:justify-self-end"
                    onToggle={(enabled) =>
                      setSettings((prev) => ({
                        ...prev,
                        autoRenameThreadTitles: enabled
                      }))
                    }
                  />
                </div>
                <div className="mx-2 border-t border-border/70" />
                <div className="mx-2 grid items-center gap-3 px-2 py-3 md:grid-cols-[220px_minmax(0,1fr)]">
                  <div className="text-sm text-muted">Show thread descriptions</div>
                  <ToggleButton
                    enabled={settings.showThreadSummaries ?? true}
                    className="md:justify-self-end"
                    onToggle={(enabled) =>
                      setSettings((prev) => ({
                        ...prev,
                        showThreadSummaries: enabled
                      }))
                    }
                  />
                </div>
              </section>

              <section className="rounded-xl border border-border/80 bg-black/20 py-2">
                <div className="mb-1 px-4 text-xs uppercase tracking-wide text-muted">Theme</div>
                <div className="mx-2 grid items-center gap-3 px-2 py-3 md:grid-cols-[220px_minmax(0,1fr)]">
                  <div className="text-sm text-muted">App theme</div>
                  <select
                    className="input"
                    value={settings.theme ?? "midnight"}
                    onChange={(event) =>
                      setSettings((prev) => ({
                        ...prev,
                        theme: event.target.value as AppTheme
                      }))
                    }
                  >
                    {THEME_OPTIONS.map((theme) => (
                      <option key={theme.value} value={theme.value}>
                        {theme.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="mx-2 px-2 pb-3">
                  <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                    {THEME_OPTIONS.map((theme) => {
                      const isActive = (settings.theme ?? "midnight") === theme.value;
                      return (
                        <button
                          key={theme.value}
                          type="button"
                          className={`theme-preview-option ${isActive ? "is-selected" : ""}`}
                          onClick={() =>
                            setSettings((prev) => ({
                              ...prev,
                              theme: theme.value
                            }))
                          }
                        >
                          <div className="theme-preview-canvas" style={THEME_PREVIEW_STYLES[theme.value]}>
                            <div className="theme-preview-sidebar">
                              <div className="theme-preview-sidebar-title" />
                              <div className="theme-preview-thread is-active" />
                              <div className="theme-preview-thread" />
                            </div>
                            <div className="theme-preview-main">
                              <div className="theme-preview-message" />
                              <div className="theme-preview-message short" />
                            </div>
                          </div>
                          <div className="mt-2 flex items-center justify-between text-xs">
                            <span className="font-medium">{theme.label}</span>
                            <span className="text-muted">{isActive ? "Selected" : "Preview"}</span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div className="mx-2 border-t border-border/70" />
                <div className="mx-2 grid items-center gap-3 px-2 py-3 md:grid-cols-[220px_minmax(0,1fr)]">
                  <div className="text-sm text-muted">Use turtle spinners</div>
                  <ToggleButton
                    enabled={settings.useTurtleSpinners ?? false}
                    className="md:justify-self-end"
                    onToggle={(enabled) =>
                      setSettings((prev) => ({
                        ...prev,
                        useTurtleSpinners: enabled
                      }))
                    }
                  />
                </div>
                <div className="mx-2 border-t border-border/70" />
                <div className="mx-2 grid items-center gap-3 px-2 py-3 md:grid-cols-[220px_minmax(0,1fr)]">
                  <div className="text-sm text-muted">Expand/contract activity trace groups</div>
                  <ToggleButton
                    enabled={settings.condenseActivityTimeline ?? true}
                    className="md:justify-self-end"
                    onToggle={(enabled) =>
                      setSettings((prev) => ({
                        ...prev,
                        condenseActivityTimeline: enabled
                      }))
                    }
                  />
                </div>
              </section>

              <section className="rounded-xl border border-border/80 bg-black/20 py-2">
                <div className="mb-1 px-4 text-xs uppercase tracking-wide text-muted">Projects</div>
                <div className="mx-2 grid items-center gap-3 px-2 py-3 md:grid-cols-[220px_minmax(0,1fr)]">
                  <div className="text-sm text-muted">Default project directory</div>
                  <div className="flex gap-2">
                    <input
                      className="input text-xs"
                      value={settings.defaultProjectDirectory ?? ""}
                      placeholder="/path/to/projects"
                      onChange={(event) =>
                        setSettings((prev) => ({
                          ...prev,
                          defaultProjectDirectory: event.target.value
                        }))
                      }
                    />
                    <button
                      className="btn-secondary whitespace-nowrap"
                      onClick={() => {
                        onPickDefaultProjectDirectory().then((picked) => {
                          if (!picked) {
                            return;
                          }
                          setSettings((prev) => ({
                            ...prev,
                            defaultProjectDirectory: picked
                          }));
                        }).catch((error) => {
                          appendLog(`Pick project directory failed: ${String(error)}`);
                        });
                      }}
                    >
                      Choose
                    </button>
                  </div>
                </div>
              </section>
            </div>
          )}

          {settingsTab === "codex" && (
            <div className="space-y-3">
              <section className="rounded-xl border border-border/80 bg-black/20 py-2">
                <div className="mb-1 px-4 text-xs uppercase tracking-wide text-muted">Defaults For New Threads</div>
                <div className="mx-2 grid items-center gap-3 px-2 py-3 md:grid-cols-[220px_minmax(0,1fr)]">
                  <div className="text-sm text-muted">Model</div>
                  <input
                    list="model-suggestions"
                    className="input text-xs"
                    value={composerOptions.model ?? ""}
                    placeholder="Model (default)"
                    onChange={(event) =>
                      setComposerOptions((prev) => ({
                        ...prev,
                        model: event.target.value.trim() || undefined
                      }))
                    }
                  />
                </div>
                <div className="mx-2 border-t border-border/70" />
                <div className="mx-2 grid items-center gap-3 px-2 py-3 md:grid-cols-[220px_minmax(0,1fr)]">
                  <div className="text-sm text-muted">Collaboration mode</div>
                  <select
                    className="input text-xs"
                    value={composerOptions.collaborationMode ?? "plan"}
                    onChange={(event) =>
                      setComposerOptions((prev) => ({
                        ...prev,
                        collaborationMode: event.target.value as CodexCollaborationMode
                      }))
                    }
                  >
                    {COLLABORATION_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="mx-2 border-t border-border/70" />
                <div className="mx-2 grid items-center gap-3 px-2 py-3 md:grid-cols-[220px_minmax(0,1fr)]">
                  <div className="text-sm text-muted">Reasoning effort</div>
                  <select
                    className="input text-xs"
                    value={composerOptions.modelReasoningEffort ?? "medium"}
                    onChange={(event) =>
                      setComposerOptions((prev) => ({
                        ...prev,
                        modelReasoningEffort: event.target.value as CodexModelReasoningEffort
                      }))
                    }
                  >
                    {REASONING_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="mx-2 border-t border-border/70" />
                <div className="mx-2 grid items-center gap-3 px-2 py-3 md:grid-cols-[220px_minmax(0,1fr)]">
                  <div className="text-sm text-muted">Sandbox mode</div>
                  <select
                    className="input text-xs"
                    value={composerOptions.sandboxMode ?? "workspace-write"}
                    onChange={(event) =>
                      setComposerOptions((prev) => ({
                        ...prev,
                        sandboxMode: event.target.value as CodexSandboxMode
                      }))
                    }
                  >
                    {SANDBOX_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="mx-2 border-t border-border/70" />
                <div className="mx-2 grid items-center gap-3 px-2 py-3 md:grid-cols-[220px_minmax(0,1fr)]">
                  <div className="text-sm text-muted">Approval policy</div>
                  <select
                    className="input text-xs"
                    value={composerOptions.approvalPolicy ?? "on-request"}
                    onChange={(event) =>
                      setComposerOptions((prev) => ({
                        ...prev,
                        approvalPolicy: event.target.value as CodexApprovalMode
                      }))
                    }
                  >
                    {APPROVAL_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="mx-2 border-t border-border/70" />
                <div className="mx-2 grid items-center gap-3 px-2 py-3 md:grid-cols-[220px_minmax(0,1fr)]">
                  <div className="text-sm text-muted">Web search mode</div>
                  <select
                    className="input text-xs"
                    value={composerOptions.webSearchMode ?? "cached"}
                    onChange={(event) =>
                      setComposerOptions((prev) => ({
                        ...prev,
                        webSearchMode: event.target.value as CodexWebSearchMode
                      }))
                    }
                  >
                    {WEB_SEARCH_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="mx-2 border-t border-border/70" />
                <div className="mx-2 grid items-center gap-3 px-2 py-3 md:grid-cols-[220px_minmax(0,1fr)]">
                  <div className="text-sm text-muted">Network access</div>
                  <ToggleButton
                    enabled={composerOptions.networkAccessEnabled ?? true}
                    className="md:justify-self-end"
                    onToggle={(enabled) =>
                      setComposerOptions((prev) => ({
                        ...prev,
                        networkAccessEnabled: enabled
                      }))
                    }
                  />
                </div>
                <div className="mx-2 border-t border-border/70" />
                <div className="mx-2 grid items-center gap-3 px-2 py-3 md:grid-cols-[220px_minmax(0,1fr)]">
                  <div className="text-sm text-muted">Sub-thread spawn policy</div>
                  <select
                    className="input text-xs"
                    value={settings.subthreadPolicyDefault ?? "ask"}
                    onChange={(event) =>
                      setSettings((prev) => ({
                        ...prev,
                        subthreadPolicyDefault: event.target.value as "manual" | "ask" | "auto"
                      }))
                    }
                  >
                    {SUBTHREAD_POLICY_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
              </section>

              <section className="rounded-xl border border-border/80 bg-black/20 py-2">
                <div className="mb-1 px-4 text-xs uppercase tracking-wide text-muted">Terminal</div>
                <div className="mx-2 grid items-center gap-3 px-2 py-3 md:grid-cols-[220px_minmax(0,1fr)]">
                  <div className="text-sm text-muted">Project switch terminal behavior</div>
                  <select
                    className="input text-xs"
                    value={settings.projectTerminalSwitchBehaviorDefault ?? "start_stop"}
                    onChange={(event) =>
                      setSettings((prev) => ({
                        ...prev,
                        projectTerminalSwitchBehaviorDefault: event.target.value as ProjectTerminalSwitchBehavior
                      }))
                    }
                  >
                    {PROJECT_SWITCH_BEHAVIOR_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="mx-2 border-t border-border/70" />
                <div className="mx-2 grid items-center gap-3 px-2 py-3 md:grid-cols-[220px_minmax(0,1fr)]">
                  <div className="text-sm text-muted">Preferred system terminal</div>
                  <select
                    className="input text-xs"
                    value={settings.preferredSystemTerminalId ?? ""}
                    onChange={(event) =>
                      setSettings((prev) => ({
                        ...prev,
                        preferredSystemTerminalId: event.target.value
                      }))
                    }
                  >
                    <option value="">Auto (first available)</option>
                    {systemTerminals
                      .filter((terminal) => terminal.available)
                      .map((terminal) => (
                        <option key={terminal.id} value={terminal.id}>
                          {terminal.label}
                        </option>
                      ))}
                  </select>
                </div>
              </section>
            </div>
          )}

          {settingsTab === "env" && (
            <section className="rounded-xl border border-border/80 bg-black/20 py-2">
              <div className="mb-1 px-4 text-xs uppercase tracking-wide text-muted">Environment Variables</div>
              <div className="mx-2 grid items-start gap-3 px-2 py-3 md:grid-cols-[220px_minmax(0,1fr)]">
                <div className="pt-2 text-sm text-muted">.env.local format</div>
                <textarea
                  className="input h-56 font-mono text-xs"
                  value={settingsEnvText}
                  onChange={(event) => setSettingsEnvText(event.target.value)}
                  placeholder={`NEXT_PUBLIC_API_URL=https://api.example.com\nFEATURE_FLAG=true`}
                />
              </div>
            </section>
          )}

          {settingsTab === "skills" && (
            <div className="space-y-3">
              <section className="rounded-xl border border-border/80 bg-black/20 py-2">
                <div className="mb-1 px-4 text-xs uppercase tracking-wide text-muted">App Skills</div>
                <div className="mx-2 space-y-2 px-2 py-3">
                  {appSkills.length === 0 ? (
                    <p className="text-xs text-slate-400">No app skills discovered.</p>
                  ) : (
                    appSkills.map((skill) => (
                      <div key={skill.path} className="rounded border border-border/70 bg-black/20 p-2 text-xs">
                        <div className="flex items-center justify-between gap-2">
                          <div className="min-w-0">
                            <div className="truncate text-sm text-slate-100">{skill.name}</div>
                            <div className="truncate text-slate-400">{skill.path}</div>
                          </div>
                          <ToggleButton
                            enabled={skill.enabled}
                            className="settings-toggle-btn-compact whitespace-nowrap"
                            onToggle={(enabled) => {
                              onToggleAppSkillEnabled(skill.path, enabled).catch((error) =>
                                appendLog(`Skill toggle failed: ${String(error)}`)
                              );
                            }}
                          />
                        </div>
                        <div className="mt-1 text-slate-300">{skill.description}</div>
                        <div className="mt-2">
                          <button
                            className="btn-ghost h-7 px-2 py-0 text-xs"
                            onClick={() => {
                              onOpenSkillEditor(skill.path).catch((error) =>
                                appendLog(`Open skill failed: ${String(error)}`)
                              );
                            }}
                          >
                            Edit SKILL.md
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </section>
              {skillEditorPath && (
                <section className="rounded-xl border border-border/80 bg-black/20 py-2">
                  <div className="mb-1 px-4 text-xs uppercase tracking-wide text-muted">Skill Editor</div>
                  <div className="mx-2 space-y-2 px-2 py-3">
                    <div className="truncate font-mono text-[11px] text-slate-400">{skillEditorPath}</div>
                    <textarea
                      className="input h-56 font-mono text-xs"
                      value={skillEditorContent}
                      onChange={(event) => setSkillEditorContent(event.target.value)}
                    />
                    <div className="flex justify-end">
                      <button className="btn-primary h-8 px-3 py-0 text-xs" onClick={onSaveSkillEditor} disabled={skillEditorSaving}>
                        {skillEditorSaving ? "Saving..." : "Save Skill"}
                      </button>
                    </div>
                  </div>
                </section>
              )}
            </div>
          )}
        </div>
      </div>

      <datalist id="model-suggestions">
        {MODEL_SUGGESTIONS.map((model) => (
          <option key={model} value={model} />
        ))}
      </datalist>

      <div className="settings-floating-actions">
        {settingsSaveNotice ? (
          <div
            className={`settings-floating-notice ${
              settingsSaveNotice.startsWith("Settings save failed:") ? "is-error" : "is-success"
            }`}
          >
            {settingsSaveNotice}
          </div>
        ) : null}
        <button
          className="btn-secondary"
          onClick={() => {
            if (isSettingsWindow) {
              void onCloseWindow();
              return;
            }
            onClose();
          }}
        >
          Cancel
        </button>
        <button
          className="btn-primary"
          onClick={() => onSaveSettings({ settings, composerOptions, settingsEnvText })}
          disabled={settingsSaving}
        >
          {settingsSaving ? "Saving..." : "Save"}
        </button>
      </div>
    </div>
  </div>
  );
});
