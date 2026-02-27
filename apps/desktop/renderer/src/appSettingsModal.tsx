import type { Dispatch, SetStateAction } from "react";
import { FaTimes } from "react-icons/fa";
import type {
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
  REASONING_OPTIONS,
  SANDBOX_OPTIONS,
  WEB_SEARCH_OPTIONS,
  type AppSettingsTab
} from "./appCore";

type SettingsModalProps = {
  isSettingsWindow: boolean;
  isMacOS: boolean;
  isWindows: boolean;
  appIconSrc: string;
  settingsTab: AppSettingsTab;
  setSettingsTab: Dispatch<SetStateAction<AppSettingsTab>>;
  settings: AppSettings;
  setSettings: Dispatch<SetStateAction<AppSettings>>;
  composerOptions: CodexThreadOptions;
  setComposerOptions: Dispatch<SetStateAction<CodexThreadOptions>>;
  settingsEnvText: string;
  setSettingsEnvText: Dispatch<SetStateAction<string>>;
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
  onSaveSettings: () => void | Promise<void>;
  onSaveSkillEditor: () => void | Promise<void>;
  onToggleAppSkillEnabled: (path: string, enabled: boolean) => Promise<void>;
  onOpenSkillEditor: (path: string) => Promise<void>;
  onPickDefaultProjectDirectory: () => Promise<void>;
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

export const SettingsModal = ({
  isSettingsWindow,
  isMacOS,
  isWindows,
  appIconSrc,
  settingsTab,
  setSettingsTab,
  settings,
  setSettings,
  composerOptions,
  setComposerOptions,
  settingsEnvText,
  setSettingsEnvText,
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
}: SettingsModalProps) => (
  <div className={isSettingsWindow ? "fixed inset-0 z-40 bg-[#0f0f10]" : "fixed inset-0 z-40 flex items-center justify-center bg-black/60 p-4"}>
    <div className={isSettingsWindow ? "flex h-full w-full flex-col bg-[#0f0f10]" : "flex w-full max-w-3xl flex-col rounded-2xl border border-border bg-surface p-4 shadow-neon"}>
      {isSettingsWindow ? (
        <header
          className={`drag-region window-header flex h-12 shrink-0 items-center justify-between border-b border-border/90 px-3 ${
            isMacOS ? "window-header-macos" : isWindows ? "window-header-windows" : ""
          }`}
        >
          <div className="flex items-center gap-2 text-sm font-semibold tracking-tight text-slate-100">
            <img src={appIconSrc} alt="GameraCode icon" className="h-8 w-8 rounded-xl object-cover" />
            <span>GameraCode - Settings</span>
          </div>
          <div className="no-drag flex items-center gap-2">
            {isWindows ? (
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
              className={settingsTab === "general" ? "btn-secondary w-full justify-start text-left text-xs" : "btn-ghost w-full justify-start text-left text-xs"}
              onClick={() => setSettingsTab("general")}
            >
              General
            </button>
            <button
              className={settingsTab === "codex" ? "btn-secondary mt-1 w-full justify-start text-left text-xs" : "btn-ghost mt-1 w-full justify-start text-left text-xs"}
              onClick={() => setSettingsTab("codex")}
            >
              Codex Defaults
            </button>
            <button
              className={settingsTab === "env" ? "btn-secondary mt-1 w-full justify-start text-left text-xs" : "btn-ghost mt-1 w-full justify-start text-left text-xs"}
              onClick={() => setSettingsTab("env")}
            >
              Environment
            </button>
            <button
              className={settingsTab === "skills" ? "btn-secondary mt-1 w-full justify-start text-left text-xs" : "btn-ghost mt-1 w-full justify-start text-left text-xs"}
              onClick={() => setSettingsTab("skills")}
            >
              Skills
            </button>
          </div>
        </aside>

        <div className="min-h-0 flex-1 overflow-y-auto pr-1">
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
                        onPickDefaultProjectDirectory().catch((error) => {
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

      <div className="mt-4 flex shrink-0 items-center gap-2 border-t border-border pt-4">
        <div
          className={`mr-auto text-xs ${
            settingsSaveNotice.startsWith("Settings save failed:") ? "text-rose-300" : "text-emerald-300"
          }`}
        >
          {settingsSaveNotice}
        </div>
        {!isSettingsWindow && (
          <button className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
        )}
        <button className="btn-primary" onClick={onSaveSettings} disabled={settingsSaving}>
          {settingsSaving ? "Saving..." : "Save"}
        </button>
      </div>
    </div>
  </div>
);
