import { memo, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import { FaTimes, FaTrashAlt } from "react-icons/fa";
import type {
  GitRepositoryCandidate,
  Project,
  Workspace,
  SubthreadPolicy,
  ProjectTerminalSwitchBehavior,
  ProjectWebLink,
  SkillRecord
} from "@code-app/shared";
import {
  PROJECT_SWITCH_BEHAVIOR_OPTIONS,
  SUBTHREAD_POLICY_OPTIONS,
  sanitizeProjectDirName,
  type RenameDialogState
} from "./appCore";

type ProjectTemplateId = "nextjs" | "electron";

type ProjectCommand = { id: string; name: string; command: string; autoStart: boolean; useForPreview: boolean };
type ProjectSettingsTab = "general" | "env" | "commands" | "links" | "skills";
type ProjectSettingsDraft = {
  projectName: string;
  projectWorkspaceTargetId: string;
  projectSettingsBrowserEnabled: boolean;
  projectSettingsEnvText: string;
  projectSettingsCommands: ProjectCommand[];
  projectSettingsWebLinks: ProjectWebLink[];
  projectSwitchBehaviorOverride: ProjectTerminalSwitchBehavior | "";
  projectSubthreadPolicyOverride: SubthreadPolicy | "";
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

type ProjectSettingsModalProps = {
  activeProjectId: string;
  initialDraft: ProjectSettingsDraft;
  workspaces: Workspace[];
  skillsByProjectId: Record<string, SkillRecord[]>;
  skillEditorPath: string;
  skillEditorContent: string;
  setSkillEditorContent: Dispatch<SetStateAction<string>>;
  skillEditorSaving: boolean;
  saveSkillEditor: () => Promise<void>;
  removingProject: boolean;
  onClose: () => void;
  onRemoveProject: () => Promise<void>;
  onSaveProjectSettings: (draft: ProjectSettingsDraft) => Promise<void>;
  onMoveProjectWorkspace: (workspaceId: string) => Promise<void>;
  onToggleProjectSkillEnabled: (path: string, enabled: boolean) => Promise<void>;
  onOpenSkillEditor: (path: string) => Promise<void>;
  appendLog: (line: string) => void;
};

export const ProjectSettingsModal = memo(({
  activeProjectId,
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
  onOpenSkillEditor,
  appendLog
}: ProjectSettingsModalProps) => {
  const [projectSettingsTab, setProjectSettingsTab] = useState<ProjectSettingsTab>("general");
  const [projectSettingsProjectName, setProjectSettingsProjectName] = useState(initialDraft.projectName);
  const [projectWorkspaceTargetId, setProjectWorkspaceTargetId] = useState(initialDraft.projectWorkspaceTargetId);
  const [projectSettingsBrowserEnabled, setProjectSettingsBrowserEnabled] = useState(initialDraft.projectSettingsBrowserEnabled);
  const [projectSettingsEnvText, setProjectSettingsEnvText] = useState(initialDraft.projectSettingsEnvText);
  const [projectSettingsCommands, setProjectSettingsCommands] = useState<ProjectCommand[]>(initialDraft.projectSettingsCommands);
  const [projectSettingsWebLinks, setProjectSettingsWebLinks] = useState<ProjectWebLink[]>(initialDraft.projectSettingsWebLinks);
  const [projectSwitchBehaviorOverride, setProjectSwitchBehaviorOverride] = useState<ProjectTerminalSwitchBehavior | "">(
    initialDraft.projectSwitchBehaviorOverride
  );
  const [projectSubthreadPolicyOverride, setProjectSubthreadPolicyOverride] = useState<SubthreadPolicy | "">(
    initialDraft.projectSubthreadPolicyOverride
  );

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
                className={projectSettingsTab === "commands" ? "settings-nav-btn mt-1 is-active" : "settings-nav-btn mt-1"}
                onClick={() => setProjectSettingsTab("commands")}
              >
                <span className="settings-nav-label">Dev Commands</span>
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
                <div className="text-sm text-muted">Switch behavior override</div>
                <select
                  className="input text-xs"
                  value={projectSwitchBehaviorOverride}
                  onChange={(event) => setProjectSwitchBehaviorOverride(event.target.value as ProjectTerminalSwitchBehavior | "")}
                >
                  <option value="">Use app default</option>
                  {PROJECT_SWITCH_BEHAVIOR_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="mx-2 border-t border-border/70" />
              <div className="mx-2 grid items-center gap-3 px-2 py-3 md:grid-cols-[220px_minmax(0,1fr)]">
                <div className="text-sm text-muted">Sub-thread policy override</div>
                <select
                  className="input text-xs"
                  value={projectSubthreadPolicyOverride}
                  onChange={(event) => setProjectSubthreadPolicyOverride(event.target.value as SubthreadPolicy | "")}
                >
                  <option value="">Use app default</option>
                  {SUBTHREAD_POLICY_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
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
              <div className="mx-2 border-t border-border/70" />
              <div className="mx-2 grid items-center gap-3 px-2 py-3 md:grid-cols-[220px_minmax(0,1fr)]">
                <div className="text-sm text-muted">In-app browser</div>
                <ToggleButton
                  enabled={projectSettingsBrowserEnabled}
                  className="md:justify-self-end"
                  onLabel="Enabled"
                  offLabel="Disabled"
                  onToggle={setProjectSettingsBrowserEnabled}
                />
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

          {projectSettingsTab === "commands" && (
            <section className="rounded-xl border border-border/80 bg-black/20 py-2">
              <div className="mb-1 px-4 text-xs uppercase tracking-wide text-muted">Dev Commands</div>
              <div className="mx-2 space-y-2 px-2 py-3">
                {projectSettingsCommands.map((command, index) => (
                  <div key={command.id || index} className="grid gap-2 md:grid-cols-[140px_1fr_96px_96px_28px]">
                    <input
                      className="input text-xs"
                      value={command.name}
                      placeholder="Name"
                      onChange={(event) =>
                        setProjectSettingsCommands((prev) =>
                          prev.map((item, idx) => (idx === index ? { ...item, name: event.target.value } : item))
                        )
                      }
                    />
                    <input
                      className="input text-xs"
                      value={command.command}
                      placeholder="Command"
                      onChange={(event) =>
                        setProjectSettingsCommands((prev) =>
                          prev.map((item, idx) => (idx === index ? { ...item, command: event.target.value } : item))
                        )
                      }
                    />
                    <div className="project-settings-toggle-inline">
                      <ToggleButton
                        enabled={command.autoStart}
                        className="settings-toggle-btn-compact"
                        onLabel="Auto"
                        offLabel="Auto"
                        onToggle={(enabled) =>
                          setProjectSettingsCommands((prev) =>
                            prev.map((item, idx) => (idx === index ? { ...item, autoStart: enabled } : item))
                          )
                        }
                      />
                    </div>
                    {projectSettingsBrowserEnabled ? (
                      <ToggleButton
                        enabled={command.useForPreview}
                        className="settings-toggle-btn-compact"
                        onLabel="Browser"
                        offLabel="Browser"
                        onToggle={(enabled) => {
                          if (!enabled) {
                            return;
                          }
                          setProjectSettingsCommands((prev) =>
                            prev.map((item, idx) => ({ ...item, useForPreview: idx === index }))
                          );
                        }}
                      />
                    ) : (
                      <div />
                    )}
                    <button
                      className="btn-secondary px-0"
                      onClick={() => setProjectSettingsCommands((prev) => prev.filter((_, idx) => idx !== index))}
                      disabled={projectSettingsCommands.length <= 1}
                      title="Remove command"
                    >
                      <FaTrashAlt className="mx-auto text-[12px]" />
                    </button>
                  </div>
                ))}

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
                          autoStart: false,
                          useForPreview: false
                        }
                      ])
                    }
                  >
                    Add command
                  </button>
                  <p className="text-xs text-slate-400">
                    {projectSettingsBrowserEnabled
                      ? "Choose auto-start commands and exactly one Browser command for preview URL detection."
                      : "Choose which commands auto-start when entering this project."}
                  </p>
                </div>
              </div>
            </section>
          )}

          {projectSettingsTab === "links" && (
            <section className="rounded-xl border border-border/80 bg-black/20 py-2">
              <div className="mb-1 px-4 text-xs uppercase tracking-wide text-muted">Header Web Links</div>
              <div className="mx-2 space-y-2 px-2 py-3">
                {projectSettingsWebLinks.map((link, index) => (
                  <div key={link.id || index} className="grid gap-2 md:grid-cols-[140px_1fr_28px]">
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
                      className="btn-secondary px-0"
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
                  {(skillsByProjectId[activeProjectId] ?? []).filter((skill) => skill.scope === "repo").length === 0 ? (
                    <p className="text-xs text-slate-400">No project-scoped skills found for this repository.</p>
                  ) : (
                    (skillsByProjectId[activeProjectId] ?? [])
                      .filter((skill) => skill.scope === "repo")
                      .map((skill) => (
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
                      <button className="btn-primary h-8 px-3 py-0 text-xs" onClick={saveSkillEditor} disabled={skillEditorSaving}>
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
                projectWorkspaceTargetId,
                projectSettingsBrowserEnabled,
                projectSettingsEnvText,
                projectSettingsCommands,
                projectSettingsWebLinks,
                projectSwitchBehaviorOverride,
                projectSubthreadPolicyOverride
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
