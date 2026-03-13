import { memo, useMemo, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import { FaChevronDown, FaGripVertical, FaStop, FaTimes, FaTrashAlt } from "react-icons/fa";
import type {
  GitRepositoryCandidate,
  Project,
  Workspace,
  ProjectWebLink,
  SkillRecord
} from "@code-app/shared";
import {
  THREAD_COLOR_PRESETS,
  sanitizeProjectDirName,
  type RenameDialogState
} from "./appCore";

type ProjectTemplateId = "nextjs" | "electron";

type ProjectCommand = { id: string; name: string; command: string; autoStart: boolean; hotkey?: string; inDropdown: boolean };
type ProjectSettingsTab = "general" | "env" | "links" | "skills";
type ProjectSettingsDraft = {
  projectName: string;
  projectColor: string;
  projectWorkspaceTargetId: string;
  projectSettingsEnvText: string;
  projectSettingsWebLinks: ProjectWebLink[];
};

type ProjectActionsSettingsDraft = {
  focusCommandId?: string;
  projectSettingsCommands: Array<ProjectCommand & { stayRunning: boolean }>;
};
type OtherProjectRunningActionGroup = {
  projectId: string;
  projectName: string;
  actions: Array<{
    commandId: string;
    name: string;
    updatedAt: string;
  }>;
};

const normalizeHotkeyKey = (key: string): string => {
  const trimmed = key.trim();
  if (!trimmed) {
    return "";
  }
  const lower = trimmed.toLowerCase();
  if (lower === " ") return "Space";
  if (lower === "esc") return "Escape";
  if (lower === "arrowup") return "ArrowUp";
  if (lower === "arrowdown") return "ArrowDown";
  if (lower === "arrowleft") return "ArrowLeft";
  if (lower === "arrowright") return "ArrowRight";
  if (lower === "enter") return "Enter";
  if (lower === "tab") return "Tab";
  if (lower === "home") return "Home";
  if (lower === "end") return "End";
  if (lower === "pageup") return "PageUp";
  if (lower === "pagedown") return "PageDown";
  if (lower === "insert") return "Insert";
  if (lower === "delete") return "Delete";
  if (lower === "backspace") return "Backspace";
  if (lower === "+") return "Plus";
  if (lower === "-") return "Minus";
  if (lower === "=") return "Equal";
  if (lower === ",") return "Comma";
  if (lower === ".") return "Period";
  if (lower === "/") return "Slash";
  if (lower === "\\") return "Backslash";
  if (lower === ";") return "Semicolon";
  if (lower === "'") return "Quote";
  if (lower === "`") return "Backquote";
  if (lower === "[") return "BracketLeft";
  if (lower === "]") return "BracketRight";
  if (/^f([1-9]|1\d|2[0-4])$/.test(lower)) {
    return lower.toUpperCase();
  }
  if (trimmed.length === 1) {
    return trimmed.toUpperCase();
  }
  return trimmed[0]!.toUpperCase() + trimmed.slice(1);
};

const formatActionHotkeyFromEvent = (event: KeyboardEvent): string | null => {
  const key = normalizeHotkeyKey(event.key);
  if (!key || key === "Meta" || key === "Control" || key === "Shift" || key === "Alt") {
    return null;
  }
  if (!event.metaKey && !event.ctrlKey) {
    return null;
  }
  const parts: string[] = [];
  if (event.metaKey || event.ctrlKey) {
    parts.push("Mod");
  }
  if (event.altKey) {
    parts.push("Alt");
  }
  if (event.shiftKey) {
    parts.push("Shift");
  }
  // Prevent bare printable keys from becoming global shortcuts.
  if (parts.length === 0 && key.length === 1) {
    return null;
  }
  parts.push(key);
  return parts.join("+");
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

const WORKSPACE_COLOR_PRESETS = [
  "#64748b",
  "#2563eb",
  "#059669",
  "#d97706",
  "#dc2626",
  "#7c3aed"
];
const PROJECT_COLOR_PRESETS = ["#64748b", ...THREAD_COLOR_PRESETS];

type ProjectSettingsModalProps = {
  activeProjectId: string;
  activeProjectPath: string;
  initialDraft: ProjectSettingsDraft;
  workspaces: Workspace[];
  skillsByProjectId: Record<string, SkillRecord[]>;
  skillEditorPath: string;
  skillEditorContent: string;
  setSkillEditorContent: Dispatch<SetStateAction<string>>;
  skillEditorSaving: boolean;
  saveSkillEditor: () => Promise<boolean>;
  removingProject: boolean;
  onClose: () => void;
  onRemoveProject: () => Promise<void>;
  onSaveProjectSettings: (draft: ProjectSettingsDraft) => Promise<void>;
  onMoveProjectWorkspace: (workspaceId: string) => Promise<void>;
  onToggleProjectSkillEnabled: (path: string, enabled: boolean) => Promise<void>;
  onRefreshProjectSkills: () => Promise<void>;
  onCreateProjectSkill: (name: string) => Promise<void>;
  onOpenSkillEditor: (path: string) => Promise<void>;
  appendLog: (line: string) => void;
};

export const ProjectSettingsModal = memo(({
  activeProjectId,
  activeProjectPath,
  initialDraft,
  workspaces,
  skillsByProjectId,
  skillEditorPath,
  skillEditorContent,
  setSkillEditorContent,
  skillEditorSaving,
  saveSkillEditor,
  removingProject,
  onClose,
  onRemoveProject,
  onSaveProjectSettings,
  onMoveProjectWorkspace,
  onToggleProjectSkillEnabled,
  onRefreshProjectSkills,
  onCreateProjectSkill,
  onOpenSkillEditor,
  appendLog
}: ProjectSettingsModalProps) => {
  const [projectSettingsTab, setProjectSettingsTab] = useState<ProjectSettingsTab>("general");
  const [projectSettingsProjectName, setProjectSettingsProjectName] = useState(initialDraft.projectName);
  const [projectSettingsProjectColor, setProjectSettingsProjectColor] = useState(initialDraft.projectColor);
  const [projectWorkspaceTargetId, setProjectWorkspaceTargetId] = useState(initialDraft.projectWorkspaceTargetId);
  const [projectSettingsEnvText, setProjectSettingsEnvText] = useState(initialDraft.projectSettingsEnvText);
  const [projectSettingsWebLinks, setProjectSettingsWebLinks] = useState<ProjectWebLink[]>(initialDraft.projectSettingsWebLinks);
  const [newProjectSkillName, setNewProjectSkillName] = useState("");
  const [projectSkillsBusy, setProjectSkillsBusy] = useState(false);
  const [skillEditorNotice, setSkillEditorNotice] = useState("");
  const normalizedProjectPath = activeProjectPath.replace(/\\/g, "/").toLowerCase();
  const projectScopedSkills = (skillsByProjectId[activeProjectId] ?? []).filter((skill) => {
    if (skill.scope === "repo") {
      return true;
    }
    const normalizedSkillPath = skill.path.replace(/\\/g, "/").toLowerCase();
    return (
      normalizedSkillPath.startsWith(`${normalizedProjectPath}/`) &&
      normalizedSkillPath.includes("/.agents/skills/")
    );
  });

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 p-4">
      <div className="flex h-[42rem] max-h-[calc(100vh-2rem)] w-full max-w-5xl flex-col rounded-2xl border border-border bg-surface p-4 shadow-neon">
        <div className="mb-4 flex shrink-0 items-center justify-between">
          <h3 className="text-lg font-semibold">Project Settings</h3>
          <button className="btn-secondary" onClick={onClose}>
            <span className="inline-flex items-center gap-1"><FaTimes className="text-[11px]" />Close</span>
          </button>
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-4 md:flex-row">
          <aside className="shrink-0 md:w-52">
            <div className="rounded-xl border border-border bg-black/20 p-2">
              <button
                className={projectSettingsTab === "general" ? "settings-nav-btn is-active" : "settings-nav-btn"}
                onClick={() => setProjectSettingsTab("general")}
              >
                <span className="settings-nav-label">General</span>
              </button>
              <button
                className={projectSettingsTab === "env" ? "settings-nav-btn mt-1 is-active" : "settings-nav-btn mt-1"}
                onClick={() => setProjectSettingsTab("env")}
              >
                <span className="settings-nav-label">Environment</span>
              </button>
              <button
                className={projectSettingsTab === "links" ? "settings-nav-btn mt-1 is-active" : "settings-nav-btn mt-1"}
                onClick={() => setProjectSettingsTab("links")}
              >
                <span className="settings-nav-label">Web Links</span>
              </button>
              <button
                className={projectSettingsTab === "skills" ? "settings-nav-btn mt-1 is-active" : "settings-nav-btn mt-1"}
                onClick={() => setProjectSettingsTab("skills")}
              >
                <span className="settings-nav-label">Skills</span>
              </button>
            </div>
          </aside>

          <div key={`project-settings-tab-${projectSettingsTab}`} className="settings-tab-panel min-h-0 flex-1 overflow-y-auto pr-1">
          {projectSettingsTab === "general" && (
            <section className="rounded-xl border border-border/80 bg-black/20 py-2">
              <div className="mb-1 px-4 text-xs uppercase tracking-wide text-muted">Project</div>
              <div className="mx-2 grid items-center gap-3 px-2 py-3 md:grid-cols-[220px_minmax(0,1fr)]">
                <div className="text-sm text-muted">Project name</div>
                <input
                  className="input text-xs"
                  value={projectSettingsProjectName}
                  onChange={(event) => setProjectSettingsProjectName(event.target.value)}
                  placeholder="Project name"
                />
              </div>
              <div className="mx-2 border-t border-border/70" />
              <div className="mx-2 grid items-center gap-3 px-2 py-3 md:grid-cols-[220px_minmax(0,1fr)]">
                <div className="text-sm text-muted">Folder color</div>
                <div className="thread-context-menu-colors" role="group" aria-label="Project color">
                  {PROJECT_COLOR_PRESETS.map((color) => {
                    const selected = projectSettingsProjectColor.toLowerCase() === color.toLowerCase();
                    return (
                      <button
                        key={color}
                        type="button"
                        className={`thread-context-color-btn ${selected ? "is-selected" : ""}`}
                        style={{ backgroundColor: color }}
                        onClick={() => setProjectSettingsProjectColor(color)}
                        aria-label={`Set project color ${color}`}
                        title={color}
                      />
                    );
                  })}
                </div>
              </div>
              <div className="mx-2 border-t border-border/70" />
              <div className="mx-2 grid items-center gap-3 px-2 py-3 md:grid-cols-[220px_minmax(0,1fr)]">
                <div className="text-sm text-muted">Workspace</div>
                <div className="flex items-center gap-2">
                  <select
                    className="input text-xs"
                    value={projectWorkspaceTargetId}
                    onChange={(event) => setProjectWorkspaceTargetId(event.target.value)}
                  >
                    {workspaces.map((workspace) => (
                      <option key={workspace.id} value={workspace.id}>
                        {workspace.name}
                      </option>
                    ))}
                  </select>
                  <button
                    className="btn-secondary h-8 px-2 py-0 text-xs whitespace-nowrap"
                    onClick={() => {
                      onMoveProjectWorkspace(projectWorkspaceTargetId).catch((error) => {
                        appendLog(`Move workspace failed: ${String(error)}`);
                      });
                    }}
                  >
                    Move Workspace
                  </button>
                </div>
              </div>
            </section>
          )}

          {projectSettingsTab === "env" && (
            <section className="rounded-xl border border-border/80 bg-black/20 py-2">
              <div className="mb-1 px-4 text-xs uppercase tracking-wide text-muted">Environment Variables</div>
              <div className="mx-2 px-2 py-3">
                <textarea
                  className="input h-44 font-mono text-xs"
                  value={projectSettingsEnvText}
                  onChange={(event) => setProjectSettingsEnvText(event.target.value)}
                  placeholder={`VITE_API_BASE=https://api.example.com\nLOG_LEVEL=debug`}
                />
              </div>
            </section>
          )}

          {projectSettingsTab === "links" && (
            <section className="rounded-xl border border-border/80 bg-black/20 py-2">
              <div className="mb-1 px-4 text-xs uppercase tracking-wide text-muted">Header Web Links</div>
              <div className="mx-2 space-y-2 px-2 py-3">
                {projectSettingsWebLinks.map((link, index) => (
                  <div key={link.id || index} className="grid gap-2 md:grid-cols-[140px_1fr_40px]">
                    <input
                      className="input text-xs"
                      value={link.name}
                      placeholder="Name"
                      onChange={(event) =>
                        setProjectSettingsWebLinks((prev) =>
                          prev.map((item, idx) => (idx === index ? { ...item, name: event.target.value } : item))
                        )
                      }
                    />
                    <input
                      className="input text-xs"
                      value={link.url}
                      placeholder="https://example.com"
                      onChange={(event) =>
                        setProjectSettingsWebLinks((prev) =>
                          prev.map((item, idx) => (idx === index ? { ...item, url: event.target.value } : item))
                        )
                      }
                    />
                    <button
                      className="btn-secondary h-9 w-9 px-0"
                      onClick={() => setProjectSettingsWebLinks((prev) => prev.filter((_, idx) => idx !== index))}
                      title="Remove web link"
                    >
                      <FaTrashAlt className="mx-auto text-[12px]" />
                    </button>
                  </div>
                ))}

                <button
                  className="btn-secondary"
                  onClick={() =>
                    setProjectSettingsWebLinks((prev) => [
                      ...prev,
                      {
                        id: `link-${crypto.randomUUID()}`,
                        name: "",
                        url: ""
                      }
                    ])
                  }
                >
                  Add web link
                </button>
              </div>
            </section>
          )}

          {projectSettingsTab === "skills" && (
            <div className="space-y-3">
              <section className="rounded-xl border border-border/80 bg-black/20 py-2">
                <div className="mb-1 px-4 text-xs uppercase tracking-wide text-muted">Skills</div>
                <div className="mx-2 space-y-2 px-2 py-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      className="input h-8 min-w-[14rem] flex-1 text-xs"
                      value={newProjectSkillName}
                      onChange={(event) => setNewProjectSkillName(event.target.value)}
                      placeholder="new-skill-name"
                    />
                    <button
                      className="btn-secondary h-8 px-2 py-0 text-xs"
                      disabled={projectSkillsBusy}
                      onClick={() => {
                        const nextName = newProjectSkillName.trim();
                        if (!nextName) {
                          appendLog("Skill create failed: Skill name is required.");
                          return;
                        }
                        setProjectSkillsBusy(true);
                        onCreateProjectSkill(nextName)
                          .then(() => setNewProjectSkillName(""))
                          .catch((error) => {
                            appendLog(`Skill create failed: ${String(error)}`);
                          })
                          .finally(() => {
                            setProjectSkillsBusy(false);
                          });
                      }}
                    >
                      Add Skill
                    </button>
                    <button
                      className="btn-ghost h-8 px-2 py-0 text-xs"
                      disabled={projectSkillsBusy}
                      onClick={() => {
                        setProjectSkillsBusy(true);
                        onRefreshProjectSkills()
                          .catch((error) => {
                            appendLog(`Skill refresh failed: ${String(error)}`);
                          })
                          .finally(() => {
                            setProjectSkillsBusy(false);
                          });
                      }}
                    >
                      Refresh
                    </button>
                  </div>
                  <p className="text-xs text-slate-400">
                    Creates project skills at <code>.agents/skills/&lt;name&gt;/SKILL.md</code>.
                  </p>
                  {projectScopedSkills.length === 0 ? (
                    <p className="text-xs text-slate-400">No project-scoped skills found for this repository.</p>
                  ) : (
                    projectScopedSkills.map((skill) => (
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
                                onToggleProjectSkillEnabled(skill.path, enabled).catch((error) =>
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
                      className="input h-44 font-mono text-xs"
                      value={skillEditorContent}
                      onChange={(event) => setSkillEditorContent(event.target.value)}
                    />
                    <div className="flex justify-end">
                      <button
                        className="btn-primary h-8 px-3 py-0 text-xs"
                        onClick={() => {
                          saveSkillEditor()
                            .then((ok) => {
                              setSkillEditorNotice(ok ? "Saved." : "Save failed. Check logs.");
                            })
                            .catch((error) => {
                              setSkillEditorNotice(`Save failed: ${String(error)}`);
                            });
                        }}
                        disabled={skillEditorSaving}
                      >
                        {skillEditorSaving ? "Saving..." : "Save Skill"}
                      </button>
                    </div>
                    {skillEditorNotice ? <p className="text-xs text-slate-400">{skillEditorNotice}</p> : null}
                  </div>
                </section>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="mt-4 flex shrink-0 items-center justify-between gap-2 border-t border-border pt-4">
        <button
          className="btn-danger"
          onClick={() => {
            onRemoveProject().catch((error) => {
              appendLog(`Project remove failed: ${String(error)}`);
            });
          }}
          disabled={removingProject}
        >
          {removingProject ? "Removing..." : "Remove Project"}
        </button>
        <div className="flex items-center gap-2">
          <button className="btn-secondary" onClick={onClose} disabled={removingProject}>
            Cancel
          </button>
          <button
            className="btn-primary"
            onClick={() => {
              onSaveProjectSettings({
                projectName: projectSettingsProjectName,
                projectColor: projectSettingsProjectColor,
                projectWorkspaceTargetId,
                projectSettingsEnvText,
                projectSettingsWebLinks
              }).catch((error) => {
                appendLog(`Project settings save failed: ${String(error)}`);
              });
            }}
            disabled={removingProject}
          >
            Save
          </button>
        </div>
      </div>
    </div>
  </div>
  );
});

type ProjectActionsSettingsModalProps = {
  initialDraft: ProjectActionsSettingsDraft;
  otherProjectRunningActions: OtherProjectRunningActionGroup[];
  onStopOtherProjectTerminal: (projectId: string, commandId: string) => Promise<void>;
  onStopAllOtherProjectTerminals: (projectId: string) => Promise<void>;
  onClose: () => void;
  onSave: (draft: ProjectActionsSettingsDraft) => Promise<void>;
  appendLog: (line: string) => void;
};

export const ProjectActionsSettingsModal = memo(({
  initialDraft,
  otherProjectRunningActions,
  onStopOtherProjectTerminal,
  onStopAllOtherProjectTerminals,
  onClose,
  onSave,
  appendLog
}: ProjectActionsSettingsModalProps) => {
  type DragSection = "action-bar" | "dropdown";
  const [projectSettingsCommands, setProjectSettingsCommands] = useState<Array<ProjectCommand & { stayRunning: boolean }>>(
    initialDraft.projectSettingsCommands
  );
  const [capturingHotkeyCommandId, setCapturingHotkeyCommandId] = useState<string | null>(null);
  const [draggedCommandId, setDraggedCommandId] = useState<string | null>(null);
  const [draggedCommandSection, setDraggedCommandSection] = useState<DragSection | null>(null);
  const [dragTarget, setDragTarget] = useState<{
    section: DragSection;
    index: number;
    mode: "before" | "append";
  } | null>(null);
  const [isOtherProjectsOpen, setIsOtherProjectsOpen] = useState(false);
  const [runningOtherProjectActionId, setRunningOtherProjectActionId] = useState<string | null>(null);
  const [runningOtherProjectStopAllId, setRunningOtherProjectStopAllId] = useState<string | null>(null);
  const canReorder = !Boolean(initialDraft.focusCommandId);
  const focusedCommandIndex = initialDraft.focusCommandId
    ? projectSettingsCommands.findIndex((command) => command.id === initialDraft.focusCommandId)
    : -1;
  const focusedCommand = focusedCommandIndex >= 0 ? projectSettingsCommands[focusedCommandIndex] : null;
  const filteredByFocus = initialDraft.focusCommandId
    ? projectSettingsCommands.filter((command) => command.id === initialDraft.focusCommandId)
    : projectSettingsCommands;
  const filteredCommands = filteredByFocus.length > 0 ? filteredByFocus : projectSettingsCommands;
  const actionBarCommands = useMemo(
    () => filteredCommands.filter((command) => !command.inDropdown),
    [filteredCommands]
  );
  const dropdownCommands = useMemo(
    () => filteredCommands.filter((command) => command.inDropdown),
    [filteredCommands]
  );
  const updateCommandHotkey = (commandId: string, hotkey: string) => {
    setProjectSettingsCommands((prev) =>
      prev.map((item) => (item.id === commandId ? { ...item, hotkey } : item))
    );
  };
  const clearDragState = () => {
    setDraggedCommandId(null);
    setDraggedCommandSection(null);
    setDragTarget(null);
  };
  const reorderCommands = (
    sourceCommandId: string,
    sourceSection: DragSection,
    sourceIndex: number,
    targetSection: DragSection,
    targetIndex: number,
    targetMode: "before" | "append"
  ) => {
    if (!canReorder) {
      return;
    }
    const sourceIndexFromState = projectSettingsCommands.findIndex((command) => command.id === sourceCommandId);
    if (sourceIndexFromState < 0 || sourceIndex < 0) {
      return;
    }
    const sourceCommand = projectSettingsCommands[sourceIndexFromState];
    const shouldShift = targetMode === "before" && sourceSection === targetSection && sourceIndex < targetIndex;
    const normalizedTargetIndex = shouldShift ? Math.max(0, targetIndex - 1) : targetIndex;
    setProjectSettingsCommands((prev) => {
      const nextSource = [...prev];
      const [movedCommandRaw] = nextSource.splice(sourceIndexFromState, 1);
      if (!movedCommandRaw) {
        return prev;
      }
      const movedCommand: ProjectCommand & { stayRunning: boolean } = {
        ...movedCommandRaw,
        inDropdown: targetSection === "dropdown"
      };
      const targetInSection = movedCommand.inDropdown;
      const targetSectionCommands = nextSource.filter((command) => (targetInSection ? command.inDropdown : !command.inDropdown));
      const clampedTargetIndex = Math.max(0, Math.min(normalizedTargetIndex, targetSectionCommands.length));
      let insertionIndex = nextSource.length;
      if (clampedTargetIndex < targetSectionCommands.length) {
        let seen = 0;
        for (let i = 0; i < nextSource.length; i += 1) {
          const command = nextSource[i];
          if (!command) {
            continue;
          }
          if (targetInSection ? command.inDropdown : !command.inDropdown) {
            if (seen === clampedTargetIndex) {
              insertionIndex = i;
              break;
            }
            seen += 1;
          }
        }
      }
      const nextCommands = [...nextSource];
      nextCommands.splice(Math.max(0, Math.min(insertionIndex, nextCommands.length)), 0, movedCommand);
      return nextCommands;
    });
  };
  const removeCommand = (commandId: string) => {
    setProjectSettingsCommands((prev) => prev.filter((item) => item.id !== commandId));
    if (capturingHotkeyCommandId === commandId) {
      setCapturingHotkeyCommandId(null);
    }
  };

  const renderActionsSection = ({
    title,
    section
  }: {
    title: string;
    section: DragSection;
  }) => {
    const commandsInSection = section === "action-bar" ? actionBarCommands : dropdownCommands;
    return (
      <section className="rounded-xl border border-border/80 bg-black/20">
        <div className="mb-1 px-4 py-2 text-xs uppercase tracking-wide text-muted">{title}</div>
        <div
          className="space-y-2 px-2 py-2"
          onDragOver={(event) => {
            if (!canReorder) {
              return;
            }
            event.preventDefault();
            event.dataTransfer.dropEffect = "move";
            setDragTarget({
              section,
              index: commandsInSection.length,
              mode: "append"
            });
          }}
          onDrop={(event) => {
            if (!canReorder || !draggedCommandId || draggedCommandSection === null) {
              return;
            }
            event.preventDefault();
            const sourceCommandId = event.dataTransfer.getData("text/plain") || draggedCommandId;
            const sourceSection = draggedCommandSection;
            const sourceIndex = sourceSection === "action-bar"
              ? actionBarCommands.findIndex((command) => command.id === sourceCommandId)
              : dropdownCommands.findIndex((command) => command.id === sourceCommandId);
            if (sourceCommandId) {
              reorderCommands(
                sourceCommandId,
                sourceSection,
                sourceIndex,
                section,
                commandsInSection.length,
                "append"
              );
            }
            clearDragState();
          }}
        >
          {commandsInSection.length === 0 ? (
            <p className="rounded-xl border border-dashed border-border/80 bg-black/10 px-4 py-6 text-xs text-slate-400">
              {section === "action-bar" ? "No actions on action bar." : "No actions in overflow."}
            </p>
          ) : null}
          {commandsInSection.map((command, index) => {
            const isDropTarget = dragTarget?.section === section && dragTarget.index === index && dragTarget.mode === "before";
            return (
              <div
                key={command.id || index}
                className={`grid gap-2 md:grid-cols-[28px_120px_1fr_64px_96px_92px_40px_40px] ${isDropTarget ? "rounded-lg border border-border/80 bg-black/20 p-1" : ""}`}
                onDragOver={(event) => {
                  if (!canReorder || draggedCommandId === null || draggedCommandSection === null) {
                    return;
                  }
                  event.preventDefault();
                  event.dataTransfer.dropEffect = "move";
                  setDragTarget({
                    section,
                    index,
                    mode: "before"
                  });
                }}
                onDrop={(event) => {
                  if (!canReorder || !draggedCommandId || draggedCommandSection === null) {
                    return;
                  }
                  event.preventDefault();
                  const sourceCommandId = event.dataTransfer.getData("text/plain") || draggedCommandId;
                  const sourceSection = draggedCommandSection;
                  const sourceIndex = sourceSection === "action-bar"
                    ? actionBarCommands.findIndex((command) => command.id === sourceCommandId)
                    : dropdownCommands.findIndex((command) => command.id === sourceCommandId);
                  if (sourceCommandId) {
                    reorderCommands(
                      sourceCommandId,
                      sourceSection,
                      sourceIndex,
                      section,
                      index,
                      "before"
                    );
                  }
                  clearDragState();
                }}
              >
                <button
                  type="button"
                  className={`inline-flex h-9 w-7 items-center justify-center rounded-md border border-border/70 bg-black/20 text-slate-400 transition hover:bg-black/35 hover:text-slate-200 ${
                    canReorder ? "cursor-grab active:cursor-grabbing" : "cursor-default opacity-60"
                  }`}
                  title="Drag to reorder"
                  tabIndex={-1}
                  aria-hidden="true"
                  draggable={canReorder}
                  onDragStart={(event) => {
                    if (!canReorder) {
                      return;
                    }
                    setDraggedCommandId(command.id);
                    setDraggedCommandSection(section);
                    event.dataTransfer.effectAllowed = "move";
                    event.dataTransfer.setData("text/plain", command.id);
                  }}
                  onDragEnd={clearDragState}
                >
                  <FaGripVertical className="text-[11px]" />
                </button>
                <input
                  className="input text-xs"
                  value={command.name}
                  placeholder="Name"
                  onChange={(event) =>
                    setProjectSettingsCommands((prev) =>
                      prev.map((item) => (item.id === command.id ? { ...item, name: event.target.value } : item))
                    )
                  }
                />
                <input
                  className="input text-xs"
                  value={command.command}
                  placeholder="Command"
                  onChange={(event) =>
                    setProjectSettingsCommands((prev) =>
                      prev.map((item) => (item.id === command.id ? { ...item, command: event.target.value } : item))
                    )
                  }
                />
                <button
                  type="button"
                  className={`input h-9 px-2 py-0 text-left text-[10px] font-mono ${capturingHotkeyCommandId === command.id ? "border-accent/80" : ""}`}
                  onClick={() => setCapturingHotkeyCommandId(command.id)}
                  onBlur={() => {
                    if (capturingHotkeyCommandId === command.id) {
                      setCapturingHotkeyCommandId(null);
                    }
                  }}
                  onKeyDown={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    if (event.key === "Backspace" || event.key === "Delete") {
                      updateCommandHotkey(command.id, "");
                      setCapturingHotkeyCommandId(null);
                      return;
                    }
                    if (event.key === "Escape" && !event.metaKey && !event.ctrlKey && !event.altKey && !event.shiftKey) {
                      setCapturingHotkeyCommandId(null);
                      return;
                    }
                    const nextHotkey = formatActionHotkeyFromEvent(event.nativeEvent);
                    if (!nextHotkey) {
                      return;
                    }
                    updateCommandHotkey(command.id, nextHotkey);
                    setCapturingHotkeyCommandId(null);
                  }}
                >
                  {capturingHotkeyCommandId === command.id
                    ? "Press..."
                    : command.hotkey?.trim() || "Set"}
                </button>
                <div className="project-settings-toggle-inline">
                  <button
                    type="button"
                    className={`action-auto-btn ${command.autoStart ? "is-enabled" : ""}`}
                    aria-pressed={command.autoStart}
                    onClick={() =>
                      setProjectSettingsCommands((prev) =>
                        prev.map((item) => (item.id === command.id ? { ...item, autoStart: !item.autoStart } : item))
                      )
                    }
                  >
                    {command.autoStart ? "Auto on" : "Auto off"}
                  </button>
                </div>
                <div className="project-settings-toggle-inline">
                  <button
                    type="button"
                    className={`action-stay-btn ${command.stayRunning ? "is-enabled" : ""}`}
                    aria-pressed={command.stayRunning}
                    onClick={() =>
                      setProjectSettingsCommands((prev) =>
                        prev.map((item) => (item.id === command.id ? { ...item, stayRunning: !item.stayRunning } : item))
                      )
                    }
                  >
                    {command.stayRunning ? "Stay running" : "Stop on idle"}
                  </button>
                </div>
                  <button
                    className="btn-secondary h-9 w-9 px-0"
                    onClick={() => {
                      setProjectSettingsCommands((prev) =>
                        prev.map((item) => (item.id === command.id ? { ...item, inDropdown: !item.inDropdown } : item))
                      );
                    }}
                    title={command.inDropdown ? "Move to action bar" : "Move to dropdown"}
                    disabled={!canReorder}
                  >
                    <FaTimes className="mx-auto text-[12px]" />
                  </button>
                  <button
                    className="btn-secondary h-9 w-9 px-0"
                    onClick={() => removeCommand(command.id)}
                    title="Remove command"
                    disabled={!canReorder}
                  >
                    <FaTrashAlt className="mx-auto text-[12px]" />
                  </button>
              </div>
            );
          })}
        </div>
      </section>
    );
  };

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-4xl rounded-2xl border border-border bg-surface p-4 shadow-neon">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold">Action Settings</h3>
          <button className="btn-secondary" onClick={onClose}>
            <span className="inline-flex items-center gap-1"><FaTimes className="text-[11px]" />Close</span>
          </button>
        </div>
        <div className="space-y-2">
            {focusedCommand ? (
              <div className="space-y-3">
                <div>
                  <div className="mb-1 text-xs uppercase tracking-wide text-muted">Title</div>
                  <input
                    className="input text-xs"
                    value={focusedCommand.name}
                    placeholder="Action title"
                    onChange={(event) =>
                      setProjectSettingsCommands((prev) =>
                        prev.map((item, idx) => (idx === focusedCommandIndex ? { ...item, name: event.target.value } : item))
                      )
                    }
                  />
                </div>
                <div>
                  <div className="mb-1 text-xs uppercase tracking-wide text-muted">Description / Command</div>
                  <textarea
                    className="input h-36 font-mono text-xs"
                    value={focusedCommand.command}
                    placeholder="npm run dev -- --host"
                    onChange={(event) =>
                      setProjectSettingsCommands((prev) =>
                        prev.map((item, idx) => (idx === focusedCommandIndex ? { ...item, command: event.target.value } : item))
                      )
                    }
                  />
                </div>
                <div>
                  <div className="mb-1 text-xs uppercase tracking-wide text-muted">Hotkey</div>
                  <button
                    type="button"
                    className={`input text-left text-xs ${capturingHotkeyCommandId === focusedCommand.id ? "border-accent/80" : ""}`}
                    onClick={() => setCapturingHotkeyCommandId(focusedCommand.id)}
                    onBlur={() => {
                      if (capturingHotkeyCommandId === focusedCommand.id) {
                        setCapturingHotkeyCommandId(null);
                      }
                    }}
                    onKeyDown={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      if (event.key === "Backspace" || event.key === "Delete") {
                        updateCommandHotkey(focusedCommand.id, "");
                        setCapturingHotkeyCommandId(null);
                        return;
                      }
                      if (event.key === "Escape" && !event.metaKey && !event.ctrlKey && !event.altKey && !event.shiftKey) {
                        setCapturingHotkeyCommandId(null);
                        return;
                      }
                      const nextHotkey = formatActionHotkeyFromEvent(event.nativeEvent);
                      if (!nextHotkey) {
                        return;
                      }
                      updateCommandHotkey(focusedCommand.id, nextHotkey);
                      setCapturingHotkeyCommandId(null);
                    }}
                  >
                    {capturingHotkeyCommandId === focusedCommand.id
                      ? "Press Ctrl/Cmd + key..."
                      : focusedCommand.hotkey?.trim() || "Set hotkey"}
                  </button>
                </div>
                <div className="grid gap-2 md:grid-cols-2">
                  <button
                    type="button"
                    className={`action-auto-btn app-tooltip-target ${focusedCommand.autoStart ? "is-enabled" : ""}`}
                    aria-pressed={focusedCommand.autoStart}
                    onClick={() =>
                      setProjectSettingsCommands((prev) =>
                        prev.map((item, idx) => (idx === focusedCommandIndex ? { ...item, autoStart: !item.autoStart } : item))
                      )
                    }
                  >
                    {focusedCommand.autoStart ? "Auto on" : "Auto off"}
                  </button>
                  <button
                    type="button"
                    className={`action-stay-btn app-tooltip-target ${focusedCommand.stayRunning ? "is-enabled" : ""}`}
                    aria-pressed={focusedCommand.stayRunning}
                    onClick={() =>
                      setProjectSettingsCommands((prev) =>
                        prev.map((item, idx) => (idx === focusedCommandIndex ? { ...item, stayRunning: !item.stayRunning } : item))
                      )
                    }
                  >
                    {focusedCommand.stayRunning ? "Stay running" : "Stop on idle"}
                  </button>
                </div>
                <div className="flex justify-end">
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => removeCommand(focusedCommand.id)}
                    title="Remove action"
                  >
                    <span className="inline-flex items-center gap-1"><FaTrashAlt className="text-[12px]" />Delete action</span>
                  </button>
                </div>
              </div>
            ) : null}
            {!focusedCommand ? (
            <>
            <div className="space-y-4">
              {actionBarCommands.length === 0 && dropdownCommands.length === 0 ? (
                <div className="rounded-xl border border-dashed border-border/70 bg-black/10 px-4 py-6 text-sm text-slate-400">
                  No actions configured for this project.
                </div>
              ) : null}
              {actionBarCommands.length > 0 || dropdownCommands.length > 0 ? (
                <>
                  {renderActionsSection({
                    title: "Action Bar",
                    section: "action-bar"
                  })}
                  {renderActionsSection({
                    title: "Actions Dropdown",
                    section: "dropdown"
                  })}
                </>
              ) : null}
            </div>
            </>
            ) : null}

            <section className="rounded-xl border border-border/80 bg-black/20">
              <button
                type="button"
                className="other-projects-toggle other-projects-toggle--section"
                aria-expanded={isOtherProjectsOpen}
                onClick={() => setIsOtherProjectsOpen((current) => !current)}
              >
                <span>Other Projects</span>
                <FaChevronDown className={`other-projects-chevron ${isOtherProjectsOpen ? "is-open" : ""}`} />
              </button>
              <div className={`other-projects-panel other-projects-panel--section ${isOtherProjectsOpen ? "is-open" : ""}`}>
                <div className="other-projects-panel-inner">
                  {otherProjectRunningActions.length > 0 ? (
                    <div className="other-projects-list">
                      {otherProjectRunningActions.map((project) => (
                        <section key={project.projectId} className="other-projects-group">
                          <div className="other-projects-group-header">
                            <div className="other-projects-group-title">{project.projectName}</div>
                            <button
                              type="button"
                              className="other-projects-stop-all"
                              disabled={runningOtherProjectStopAllId === project.projectId}
                              onClick={() => {
                                setRunningOtherProjectStopAllId(project.projectId);
                                onStopAllOtherProjectTerminals(project.projectId)
                                  .catch((error) => appendLog(`Stop all actions failed: ${String(error)}`))
                                  .finally(() => {
                                    setRunningOtherProjectStopAllId((current) => (current === project.projectId ? null : current));
                                  });
                              }}
                            >
                              {runningOtherProjectStopAllId === project.projectId ? "Stopping..." : "Stop all"}
                            </button>
                          </div>
                          <div className="other-projects-group-actions">
                            {project.actions.map((action) => (
                              <div key={`${project.projectId}:${action.commandId}`} className="other-projects-action-row">
                                <div className="other-projects-action-name" title={action.name}>
                                  {action.name}
                                </div>
                                <button
                                  type="button"
                                  className="other-projects-action-stop"
                                  disabled={runningOtherProjectActionId === `${project.projectId}:${action.commandId}`}
                                  onClick={() => {
                                    const actionId = `${project.projectId}:${action.commandId}`;
                                    setRunningOtherProjectActionId(actionId);
                                    onStopOtherProjectTerminal(project.projectId, action.commandId)
                                      .catch((error) => appendLog(`Stop action failed: ${String(error)}`))
                                      .finally(() => {
                                        setRunningOtherProjectActionId((current) => (current === actionId ? null : current));
                                      });
                                  }}
                                >
                                  <FaStop className="text-[9px]" />
                                  {runningOtherProjectActionId === `${project.projectId}:${action.commandId}` ? "Stopping..." : "Stop"}
                                </button>
                              </div>
                            ))}
                          </div>
                        </section>
                      ))}
                    </div>
                  ) : (
                    <div className="other-projects-empty">No running actions in other projects.</div>
                  )}
                </div>
              </div>
            </section>

            {!initialDraft.focusCommandId ? (
            <div className="flex flex-wrap items-center gap-2">
              <button
                className="btn-secondary"
                onClick={() =>
                  setProjectSettingsCommands((prev) => [
                    ...prev,
                    {
                      id: `cmd-${crypto.randomUUID()}`,
                      name: `Command ${prev.length + 1}`,
                      command: "",
                      inDropdown: false,
                      autoStart: false,
                      stayRunning: false,
                      hotkey: ""
                    }
                  ])
                }
              >
                Add action
              </button>
              <p className="text-xs text-slate-400">
                `Auto` starts when entering a project. `Stay` prevents stop on workspace/project switch.
              </p>
              <p className="text-xs text-slate-400">
                Click the hotkey field and press `Ctrl/Cmd + key`. Backspace/Delete clears it.
              </p>
            </div>
            ) : null}
        </div>
        <div className="mt-4 flex items-center justify-end gap-2">
          <button className="btn-secondary" onClick={onClose}>Cancel</button>
          <button
            className="btn-primary"
            onClick={() => {
              onSave({
                projectSettingsCommands
              }).catch((error) => {
                appendLog(`Action settings save failed: ${String(error)}`);
              });
            }}
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
});

type NewProjectModalProps = {
  defaultProjectDirectory?: string;
  templateOptions: Array<{
    id: ProjectTemplateId;
    label: string;
    description: string;
    language: string;
  }>;
  creatingProject: boolean;
  onClose: () => void;
  onSubmit: (input: { name: string; monorepo: boolean; templateIds: ProjectTemplateId[] }) => Promise<void>;
  appendLog: (line: string) => void;
};

export const NewProjectModal = ({
  defaultProjectDirectory,
  templateOptions,
  creatingProject,
  onClose,
  onSubmit,
  appendLog
}: NewProjectModalProps) => {
  const [newProjectName, setNewProjectName] = useState("");
  const [newProjectIsMonorepo, setNewProjectIsMonorepo] = useState(false);
  const [newProjectTemplateIds, setNewProjectTemplateIds] = useState<ProjectTemplateId[]>([]);
  const [showTemplatePicker, setShowTemplatePicker] = useState(false);
  const languageFilters = Array.from(new Set(templateOptions.map((template) => template.language)));
  const [activeLanguageFilter, setActiveLanguageFilter] = useState<string>("All");
  const filteredTemplateOptions = templateOptions.filter((template) =>
    activeLanguageFilter === "All" ? true : template.language === activeLanguageFilter
  );
  const isNameValid = Boolean(sanitizeProjectDirName(newProjectName));
  const canCreate = isNameValid && (newProjectIsMonorepo || newProjectTemplateIds.length <= 1);

  const submit = () => {
    onSubmit({
      name: newProjectName,
      monorepo: newProjectIsMonorepo,
      templateIds: newProjectTemplateIds
    }).catch((error) => {
      appendLog(`Create project failed: ${String(error)}`);
    });
  };

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-2xl rounded-2xl border border-border bg-surface p-4 shadow-neon">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold">New Project</h3>
          <button
            className="btn-secondary"
            onClick={() => {
              if (!creatingProject) {
                onClose();
              }
            }}
          >
            Close
          </button>
        </div>

        <p className="mb-2 text-xs text-slate-400">{defaultProjectDirectory ?? ""}</p>
        <label className="mb-2 block text-sm text-muted">Project name</label>
        <input
          autoFocus
          className="input mb-4"
          value={newProjectName}
          placeholder="my-project"
          onChange={(event) => setNewProjectName(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              if (!creatingProject) {
                submit();
              }
            }
          }}
        />

        <div className="mb-4 rounded-lg border border-border/70 bg-black/20 p-3">
          <div className="mb-2 text-xs uppercase tracking-wide text-muted">Repository Structure</div>
          <div className="grid gap-2 sm:grid-cols-2">
            <button
              type="button"
              className={newProjectIsMonorepo ? "btn-ghost text-xs" : "btn-secondary text-xs"}
              onClick={() => {
                setNewProjectIsMonorepo(false);
                setNewProjectTemplateIds((prev) => prev.slice(0, 1));
              }}
              disabled={creatingProject}
            >
              Single App Repo
            </button>
            <button
              type="button"
              className={newProjectIsMonorepo ? "btn-secondary text-xs" : "btn-ghost text-xs"}
              onClick={() => setNewProjectIsMonorepo(true)}
              disabled={creatingProject}
            >
              Monorepo
            </button>
          </div>
          <p className="mt-2 text-xs text-slate-300">
            {newProjectIsMonorepo
              ? "Choose monorepo when you expect multiple apps/packages in one repo with shared dependencies."
              : "Choose single app when you want the simplest setup for one product with minimal tooling overhead."}
          </p>
        </div>

        <div className="mb-4 rounded-lg border border-border/70 bg-black/20 p-3">
          <button
            type="button"
            className="btn-secondary h-8 px-3 py-0 text-xs"
            onClick={() => setShowTemplatePicker((prev) => !prev)}
            disabled={creatingProject}
          >
            {showTemplatePicker ? "Hide templates" : "Add a template"}
          </button>
          <p className="mt-2 text-xs text-slate-400">
            Templates are optional. Start blank or add one now and we will scaffold best-practice defaults.
          </p>

          <div
            className={`grid transition-all duration-300 ease-out ${showTemplatePicker ? "grid-rows-[1fr] opacity-100 mt-3" : "grid-rows-[0fr] opacity-0 mt-0"}`}
            aria-hidden={!showTemplatePicker}
          >
            <div className="min-h-0 overflow-hidden">
              <div className="mb-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  className={
                    activeLanguageFilter === "All"
                      ? "btn-secondary inline-flex h-7 items-center justify-center px-2 py-0 text-center text-xs leading-none"
                      : "btn-ghost inline-flex h-7 items-center justify-center px-2 py-0 text-center text-xs leading-none"
                  }
                  onClick={() => setActiveLanguageFilter("All")}
                  disabled={creatingProject}
                >
                  All
                </button>
                {languageFilters.map((language) => (
                  <button
                    key={language}
                    type="button"
                    className={
                      activeLanguageFilter === language
                        ? "btn-secondary inline-flex h-7 items-center justify-center px-2 py-0 text-center text-xs leading-none"
                        : "btn-ghost inline-flex h-7 items-center justify-center px-2 py-0 text-center text-xs leading-none"
                    }
                    onClick={() => setActiveLanguageFilter(language)}
                    disabled={creatingProject}
                  >
                    {language}
                  </button>
                ))}
              </div>

              <div className="grid gap-2 sm:grid-cols-2">
                {filteredTemplateOptions.map((template) => {
                  const isSelected = newProjectTemplateIds.includes(template.id);
                  return (
                    <button
                      key={template.id}
                      type="button"
                      className={`rounded-lg border p-3 text-left text-xs transition ${
                        isSelected
                          ? "border-slate-300 bg-slate-300/10 text-slate-100"
                          : "border-border/70 bg-black/25 text-slate-300 hover:border-border"
                      }`}
                      onClick={() => {
                        setNewProjectTemplateIds((prev) => {
                          if (prev.includes(template.id)) {
                            return prev.filter((id) => id !== template.id);
                          }
                          if (newProjectIsMonorepo) {
                            return [...prev, template.id];
                          }
                          return [template.id];
                        });
                      }}
                      disabled={creatingProject}
                    >
                      <div className="text-sm font-medium">{template.label}</div>
                      <div className="mt-1 text-slate-400">{template.description}</div>
                      <div className="mt-2 text-[11px] text-slate-500">
                        {template.id === "nextjs"
                          ? "Choose when you want a modern web app with SSR/SSG and routing out of the box."
                          : "Choose when you want a desktop app with native windowing and local system access."}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {newProjectTemplateIds.length > 0 && (
            <p className="mt-3 text-xs text-slate-300">
              Selected:{" "}
              {newProjectTemplateIds
                .map((templateId) => templateOptions.find((template) => template.id === templateId)?.label ?? templateId)
                .join(", ")}
            </p>
          )}
        </div>

        <div className="flex justify-end gap-2">
          <button className="btn-secondary" onClick={onClose} disabled={creatingProject}>
            Cancel
          </button>
          <button
            className="btn-primary"
            onClick={submit}
            disabled={creatingProject || !canCreate}
          >
            {creatingProject ? "Creating..." : "Create"}
          </button>
        </div>
      </div>
    </div>
  );
};

type ImportProjectModalProps = {
  defaultProjectDirectory?: string;
  importProjectQuery: string;
  setImportProjectQuery: Dispatch<SetStateAction<string>>;
  shouldShowCloneAction: boolean;
  importLoading: boolean;
  importBusyPath: string | null;
  cloneBusy: boolean;
  importCandidatesFiltered: GitRepositoryCandidate[];
  projects: Project[];
  onClose: () => void;
  onLoadImportCandidates: () => Promise<void>;
  onCloneProjectFromQuery: () => Promise<void>;
  onImportProjectFromPath: (path: string) => Promise<void>;
  appendLog: (line: string) => void;
};

export const ImportProjectModal = ({
  defaultProjectDirectory,
  importProjectQuery,
  setImportProjectQuery,
  shouldShowCloneAction,
  importLoading,
  importBusyPath,
  cloneBusy,
  importCandidatesFiltered,
  projects,
  onClose,
  onLoadImportCandidates,
  onCloneProjectFromQuery,
  onImportProjectFromPath,
  appendLog
}: ImportProjectModalProps) => (
  <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 p-4">
    <div className="w-full max-w-2xl rounded-2xl border border-border bg-surface p-4 shadow-neon">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-lg font-semibold">Import Project</h3>
        <button
          className="btn-secondary"
          onClick={() => {
            if (!importLoading && !importBusyPath && !cloneBusy) {
              onClose();
            }
          }}
        >
          Close
        </button>
      </div>

      <p className="mb-2 text-xs text-slate-400">
        Search local git repos in <span className="font-mono">{defaultProjectDirectory}</span> or paste a git URL to clone.
      </p>

      <div className="mb-3 flex items-center gap-2">
        <input
          autoFocus
          className="input"
          value={importProjectQuery}
          placeholder="Search local repos or paste git URL"
          onChange={(event) => setImportProjectQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && shouldShowCloneAction && !cloneBusy) {
              event.preventDefault();
              onCloneProjectFromQuery().catch((error) => {
                appendLog(`Clone project failed: ${String(error)}`);
              });
            }
          }}
        />
        <button
          className="btn-ghost whitespace-nowrap"
          onClick={() => {
            onLoadImportCandidates().catch((error) => {
              appendLog(`Reload import candidates failed: ${String(error)}`);
            });
          }}
          disabled={importLoading || cloneBusy || Boolean(importBusyPath)}
        >
          Refresh
        </button>
        <button
          className="btn-primary whitespace-nowrap"
          onClick={() => {
            onCloneProjectFromQuery().catch((error) => {
              appendLog(`Clone project failed: ${String(error)}`);
            });
          }}
          disabled={!shouldShowCloneAction || cloneBusy || importLoading || Boolean(importBusyPath)}
        >
          {cloneBusy ? "Cloning..." : "Clone URL"}
        </button>
      </div>

      <div className="max-h-80 space-y-2 overflow-y-auto rounded-lg border border-border bg-black/20 p-2">
        {importLoading ? (
          <p className="px-2 py-2 text-sm text-slate-400">Scanning repositories...</p>
        ) : importCandidatesFiltered.length === 0 ? (
          <p className="px-2 py-2 text-sm text-slate-400">No git repositories found for this search.</p>
        ) : (
          importCandidatesFiltered.map((candidate) => {
            const existingProject = projects.find((project) => project.path === candidate.path) ?? null;
            const isBusy = importBusyPath === candidate.path;
            return (
              <div key={candidate.path} className="rounded-lg border border-border/70 bg-black/25 p-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-slate-100">{candidate.name}</div>
                    <div className="truncate font-mono text-xs text-slate-400">{candidate.path}</div>
                    {candidate.remoteUrl && (
                      <div className="truncate font-mono text-xs text-slate-500">{candidate.remoteUrl}</div>
                    )}
                  </div>
                  <button
                    className="btn-ghost whitespace-nowrap"
                    onClick={() => {
                      onImportProjectFromPath(candidate.path).catch((error) => {
                        appendLog(`Import project failed: ${String(error)}`);
                      });
                    }}
                    disabled={Boolean(importBusyPath) || cloneBusy || importLoading}
                  >
                    {isBusy ? "Importing..." : existingProject ? "Open" : "Import"}
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  </div>
);

type RenameThreadModalProps = {
  renameDialog: RenameDialogState;
  setRenameDialog: Dispatch<SetStateAction<RenameDialogState | null>>;
  submitRenameDialog: () => Promise<void>;
  appendLog: (line: string) => void;
};

type WorkspaceModalProps = {
  mode: "create" | "edit";
  workspaces: Workspace[];
  projects: Project[];
  editingWorkspaceId: string | null;
  initialDraft: {
    name: string;
    color: string;
    moveProjectIds: string[];
  };
  onClose: () => void;
  onSave: (draft: { name: string; color: string; moveProjectIds: string[] }) => Promise<void>;
  onDelete: () => Promise<void>;
  appendLog: (line: string) => void;
};

export const WorkspaceModal = ({
  mode,
  workspaces,
  projects,
  editingWorkspaceId,
  initialDraft,
  onClose,
  onSave,
  onDelete,
  appendLog
}: WorkspaceModalProps) => {
  const [draftName, setDraftName] = useState(initialDraft.name);
  const [draftColor, setDraftColor] = useState(initialDraft.color);
  const [draftMoveProjectIds, setDraftMoveProjectIds] = useState<string[]>(initialDraft.moveProjectIds);

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-2xl rounded-2xl border border-border bg-surface p-4 shadow-neon">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-lg font-semibold">{mode === "create" ? "New Workspace" : "Workspace Settings"}</h3>
      </div>

        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs uppercase tracking-wide text-muted">Name</label>
            <input className="input text-sm" value={draftName} onChange={(event) => setDraftName(event.target.value)} placeholder="Workspace name" />
          </div>
          <div>
            <label className="mb-1 block text-xs uppercase tracking-wide text-muted">Color</label>
            <div className="flex items-center gap-2">
              {WORKSPACE_COLOR_PRESETS.map((color) => {
                const selected = draftColor.toLowerCase() === color.toLowerCase();
                return (
                  <button
                    key={color}
                    type="button"
                    className={`h-9 w-9 rounded-lg border ${selected ? "border-slate-100" : "border-border/80"}`}
                    style={{ backgroundColor: color }}
                    onClick={() => setDraftColor(color)}
                    aria-label={`Select workspace color ${color}`}
                    title={color}
                  />
                );
              })}
            </div>
          </div>
        </div>

        {mode === "create" && (
          <div className="mt-4 rounded-xl border border-border/80 bg-black/20 p-3">
            <div className="mb-2 text-xs uppercase tracking-wide text-muted">Move Projects Into This Workspace</div>
            <div className="max-h-48 space-y-1 overflow-y-auto pr-1">
              {projects.length === 0 ? (
                <p className="text-xs text-slate-400">No projects available.</p>
              ) : (
                projects.map((project) => (
                  <label key={project.id} className="project-settings-toggle">
                    <input
                      type="checkbox"
                      checked={draftMoveProjectIds.includes(project.id)}
                      onChange={(event) => {
                        setDraftMoveProjectIds((prev) =>
                          event.target.checked ? [...prev, project.id] : prev.filter((id) => id !== project.id)
                        );
                      }}
                    />
                    <span>{project.name}</span>
                  </label>
                ))
              )}
            </div>
          </div>
        )}

        <div className="mt-4 flex items-center justify-between">
          {mode === "edit" ? (
            <button
              className="btn-danger"
              onClick={() => {
                if (workspaces.length <= 1) {
                  appendLog("Cannot delete the last workspace.");
                  return;
                }
                onDelete().catch((error) => appendLog(`Workspace delete failed: ${String(error)}`));
              }}
              disabled={!editingWorkspaceId || workspaces.length <= 1}
            >
              Delete Workspace
            </button>
          ) : <div />}
          <div className="flex items-center gap-2">
            <button className="btn-secondary" onClick={onClose}>Cancel</button>
            <button
              className="btn-primary"
              onClick={() => {
                onSave({
                  name: draftName,
                  color: draftColor,
                  moveProjectIds: draftMoveProjectIds
                }).catch((error) => appendLog(`Workspace save failed: ${String(error)}`));
              }}
            >
              {mode === "create" ? "Create Workspace" : "Save Workspace"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export const RenameThreadModal = ({
  renameDialog,
  setRenameDialog,
  submitRenameDialog,
  appendLog
}: RenameThreadModalProps) => (
  <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 p-4">
    <div className="w-full max-w-md rounded-2xl border border-border bg-surface p-4 shadow-neon">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-lg font-semibold">Rename Thread</h3>
        <button className="btn-secondary" onClick={() => setRenameDialog(null)}>
          Close
        </button>
      </div>
      <input
        className="input mb-4"
        value={renameDialog.value}
        onChange={(event) =>
          setRenameDialog((prev) => (prev ? { ...prev, value: event.target.value } : prev))
        }
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            submitRenameDialog().catch((error) => {
              appendLog(`Thread rename failed: ${String(error)}`);
            });
          }
        }}
        autoFocus
        placeholder="Thread title"
      />
      <div className="flex justify-end gap-2">
        <button className="btn-secondary" onClick={() => setRenameDialog(null)}>
          Cancel
        </button>
        <button
          className="btn-primary"
          onClick={() => {
            submitRenameDialog().catch((error) => {
              appendLog(`Thread rename failed: ${String(error)}`);
            });
          }}
        >
          Save
        </button>
      </div>
    </div>
  </div>
);

type ActivityLogOverlayProps = {
  logs: string[];
  onClear: () => void;
};

export const ActivityLogOverlay = ({ logs, onClear }: ActivityLogOverlayProps) => (
  <div className="fixed bottom-4 right-4 z-30 w-[460px] max-h-60 overflow-y-auto rounded-xl border border-border bg-black/80 p-3 font-mono text-xs text-slate-200">
    <div className="mb-2 flex items-center justify-between">
      <span className="uppercase tracking-wider text-muted">Activity</span>
      <button className="btn-secondary text-xs" onClick={onClear}>
        Clear
      </button>
    </div>
    <div className="space-y-1">
      {logs.slice(-80).map((line, index) => (
        <div key={`${line}-${index}`}>{line}</div>
      ))}
    </div>
  </div>
);
