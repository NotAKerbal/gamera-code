import {
  memo,
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ClipboardEventHandler,
  type DragEventHandler,
  type MouseEvent as ReactMouseEvent,
  type KeyboardEventHandler
} from "react";
import {
  FitAddon as GhosttyFitAddon,
  OSC8LinkProvider,
  Terminal as GhosttyWebTerminal,
  UrlRegexProvider,
  init as initGhostty
} from "ghostty-web";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { Terminal as XtermTerminal } from "@xterm/xterm";
import "@xterm/xterm/css/xterm.css";
import {
  FaArchive,
  FaArrowUp,
  FaChevronDown,
  FaChevronLeft,
  FaChevronRight,
  FaCodeBranch,
  FaCog,
  FaEye,
  FaFolder,
  FaMicrophone,
  FaNetworkWired,
  FaPen,
  FaFolderOpen,
  FaPaperPlane,
  FaPlus,
  FaSave,
  FaStop,
  FaSyncAlt,
  FaTerminal,
  FaTimes,
  FaThumbtack,
  FaTrashAlt,
  FaBoxOpen,
  FaWindowMaximize,
  FaWindowMinimize,
  FaWindowRestore
} from "react-icons/fa";
import appIconDark from "./assets/icon_rounded.png";
import appIconLight from "./assets/icon_light.png";
import type {
  AppSettings,
  CodexCollaborationMode,
  CodexModelReasoningEffort,
  CodexSandboxMode,
  CodexThreadOptions,
  HarnessId,
  GitHistoryCommit,
  GitRepositoryCandidate,
  GitOutgoingCommit,
  GitState,
  InstallStatus,
  CodexAuthStatus,
  MessageEvent,
  OpenCodeAuthStatus,
  OrchestrationChild,
  OrchestrationRun,
  PermissionMode,
  PreviewEvent,
  PromptAttachment,
  Project,
  ProjectFileEntry,
  ProjectSetupEvent,
  ProjectSettings,
  ProjectWebLink,
  ProjectTerminalEvent,
  ProjectTerminalState,
  SystemTerminalOption,
  SessionEvent,
  SkillRecord,
  Thread,
  ThreadEventsPage,
  Workspace
} from "@code-app/shared";
import {
  APP_VERSION_LABEL,
  BRANCH_LIST_OVERSCAN,
  BRANCH_ROW_HEIGHT_PX,
  CHANGELOG_ITEMS,
  COLLABORATION_OPTIONS,
  CUSTOM_QUESTION_OPTION_VALUE,
  DEFAULT_SETTINGS,
  FILE_INDEX_LOAD_LIMIT,
  FILE_MENTION_MATCH_LIMIT,
  GENERIC_THREAD_TITLES,
  HIDDEN_ACTIVITY_CATEGORIES,
  HISTORY_USER_PROMPT_WINDOW,
  INSTALL_DETAIL_LABELS,
  MARKDOWN_REMARK_PLUGINS,
  MAX_ATTACHMENTS,
  PROJECT_SWITCH_BEHAVIOR_OPTIONS,
  REASONING_OPTIONS,
  REQUIRED_SETUP_KEYS,
  SANDBOX_OPTIONS,
  SHOW_TERMINAL,
  SKILL_MENTION_MATCH_LIMIT,
  SUPPORTED_HARNESSES,
  THREAD_COLOR_PRESETS,
  THREAD_SUMMARY_STORAGE_KEY,
  areSkillReferencesEqual,
  asRecord,
  asString,
  basename,
  buildExplorationLabel,
  buildPromptInputWithMentionedFiles,
  buildRunGroupLabel,
  bumpThreadToFrontById,
  clipPath,
  codexOptionsKey,
  detectActiveFileMention,
  detectActiveSkillMention,
  diffLineClass,
  envVarsToText,
  eventToActivityEntry,
  extractCommandFromTitle,
  extractSkillsFromInput,
  fileToDataUrl,
  findDuplicateBasenames,
  flattenThreadRows,
  formatModelDisplayName,
  getHarnessOptionsFromSettings,
  getSupportedHarness,
  harnessSupports,
  formatMentionFileLabel,
  formatRelative,
  getProjectNameFromPath,
  getTerminalPopoutKey,
  isEditableKeyboardTarget,
  isCodeWindowContext,
  isExplorationCommand,
  isLikelyGitRepositoryUrl,
  isSettingsWindowContext,
  formatThreadActivityTimestamp,
  mergeActivityEntry,
  mergePendingQuestions,
  normalizeMessageAttachments,
  normalizePendingUserQuestions,
  normalizePromptAfterSkillExtraction,
  normalizeWebLinkUrl,
  parseEnvText,
  parseHistoryBatch,
  parseStoredActivityEvent,
  pendingQuestionEquals,
  readStoredActiveProjectId,
  readStoredActiveWorkspaceId,
  readStoredProjectListOpenById,
  readStoredThreadSummaries,
  safeHref,
  sanitizeForDisplay,
  sanitizeProjectDirName,
  sanitizeReasoningTrace,
  splitAssistantContentSegments,
  summarizePlanMarkdown,
  shouldDropDisplayLine,
  suggestThreadSummary,
  suggestThreadTitle,
  summarizeRunStates,
  toCommandRuns,
  toFileChanges,
  todosToMarkdown,
  writeStoredActiveProjectId,
  writeStoredActiveWorkspaceId,
  writeStoredProjectListOpenById,
  type ActivityEntry,
  type ComposerAttachment,
  type ComposerDropdownKind,
  type FileMentionState,
  type GitActivityEntry,
  type PendingUserQuestion,
  type QueuedPrompt,
  type RenameDialogState,
  type SkillMentionState,
  type ThreadRunState,
  type PlanArtifact,
  type TimelineEventItem,
  type TimelineItem,
  type TimelineMessageItem,
  type UserQuestionAnswerState,
} from "./appCore";
import {
  MemoizedAssistantMarkdown,
  MemoizedTimelineItemsList,
  MemoizedUserMessageContent
} from "./appUi";
import {
  ActivityLogOverlay,
  ImportProjectModal,
  NewProjectModal,
  ProjectActionsSettingsModal,
  ProjectSettingsModal,
  RenameThreadModal,
  WorkspaceModal
} from "./appOverlays";

type ActionTerminalPopoutInstance = {
  terminal: GhosttyWebTerminal;
  fitAddon: GhosttyFitAddon;
  renderedOutput: string;
  projectId: string;
  commandId: string;
  terminalName: string;
};

const STARTER_PROMPT_CARDS = [
  {
    title: "Repository Risk Scan",
    description: "Get fast orientation on architecture and high-risk areas.",
    prompt: "Summarize this repository and list the top 3 risky areas.",
    Icon: FaTerminal
  },
  {
    title: "Test Failure Triage",
    description: "Run tests, isolate root causes, and produce a fix plan.",
    prompt: "Run tests, explain failures, and propose a minimal fix plan.",
    Icon: FaNetworkWired
  },
  {
    title: "Dead Code Sweep",
    description: "Identify safe removals and propose focused cleanup diffs.",
    prompt: "Find dead code and suggest safe removals with file-by-file diffs.",
    Icon: FaArchive
  },
  {
    title: "Regression Review",
    description: "Audit recent changes and find likely behavior regressions.",
    prompt: "Audit recent changes and call out regressions or missing tests.",
    Icon: FaCodeBranch
  }
] as const;

const normalizeSkillFrontmatterYaml = (content: string) => {
  const lines = content.split(/\r?\n/);
  let inFrontmatter = false;
  let frontmatterSeen = 0;
  let changed = false;
  const next = lines.map((line) => {
    if (line.trim() === "---") {
      frontmatterSeen += 1;
      inFrontmatter = frontmatterSeen === 1 ? true : false;
      return line;
    }
    if (!inFrontmatter) {
      return line;
    }
    const match = line.match(/^(\s*description:\s*)(.*)$/);
    if (!match) {
      return line;
    }
    const prefix = match[1] ?? "";
    const rawValue = (match[2] ?? "").trim();
    if (!rawValue || rawValue.startsWith('"') || rawValue.startsWith("'") || !rawValue.includes(":")) {
      return line;
    }
    const escaped = rawValue.replace(/"/g, '\\"');
    changed = true;
    return `${prefix}"${escaped}"`;
  });
  return {
    content: next.join("\n"),
    changed
  };
};
import { SettingsModal } from "./appSettingsModal";
import { SetupModal } from "./appSetupModal";
import { ComposerDropdownPortal } from "./appComposerDropdown";
import { BranchDropdownPortal } from "./appBranchDropdown";
import { MainHeader } from "./appMainHeader";
import { MonacoCodePanel } from "./MonacoCodePanel";

const api = window.desktopAPI as typeof window.desktopAPI & {
  audio: {
    transcribe: (input: {
      audioDataUrl: string;
      projectId?: string;
      model?: string;
      language?: string;
      prompt?: string;
    }) => Promise<{ text: string; model: string; language?: string; durationSeconds?: number }>;
  };
};
const platformHints = `${navigator.platform} ${navigator.userAgent}`.toLowerCase();
const isMacOS = platformHints.includes("mac");
const isWindows = platformHints.includes("win");
const useWindowsStyleHeader = !isMacOS;
type TooltipPlacement = "above" | "below";
const TOOLTIP_HOVER_DELAY_MS = 500;
const SHOW_VOICE_INPUT_BUTTON = false;
const RIGHT_PANEL_DEFAULT_WIDTH_PX = 520;
const RIGHT_PANEL_MIN_WIDTH_PX = 360;
const RIGHT_PANEL_MAX_WIDTH_PX = 920;
const CODE_WINDOW_PROJECT_ID_QUERY_KEY = "codeProjectId";

const readCodeWindowProjectId = () => {
  try {
    const value = new URLSearchParams(window.location.search).get(CODE_WINDOW_PROJECT_ID_QUERY_KEY);
    if (!value || !value.trim()) {
      return null;
    }
    return value;
  } catch {
    return null;
  }
};

type ActivityBundleRowProps = {
  rowId: string;
  chips: string[];
  tsMs: number;
  durationMs: number;
  items: TimelineItem[];
  defaultOpen: boolean;
  plansById: Record<string, PlanArtifact>;
  getTodoPlanByActivityId: (activityId: string) => PlanArtifact | undefined;
  onViewPlan: (planId: string) => void;
  onBuildPlan: (planId: string) => void;
  onCopyPlan: (planId: string) => void;
  onForkFromUserMessage?: (message: MessageEvent) => void;
};
type TimelinePlanRowProps = {
  item: TimelineEventItem;
  plansById: Record<string, PlanArtifact>;
  getTodoPlanByActivityId: (activityId: string) => PlanArtifact | undefined;
  onViewPlan: (planId: string) => void;
  onBuildPlan: (planId: string) => void;
  onCopyPlan: (planId: string) => void;
  onForkFromUserMessage?: (message: MessageEvent) => void;
};

type ProjectTemplateId = "nextjs" | "electron";

type NewProjectTemplateOption = {
  id: ProjectTemplateId;
  label: string;
  description: string;
  language: "TypeScript" | "JavaScript";
};

const NEW_PROJECT_TEMPLATE_OPTIONS: NewProjectTemplateOption[] = [
  {
    id: "nextjs",
    label: "Next.js",
    description: "App Router, TypeScript, and ESLint defaults.",
    language: "TypeScript"
  },
  {
    id: "electron",
    label: "Electron",
    description: "Electron + Vite + TypeScript starter.",
    language: "TypeScript"
  }
];

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

const normalizeActionHotkey = (value: string): string => {
  const tokens = value
    .split("+")
    .map((part) => part.trim())
    .filter(Boolean);
  if (tokens.length === 0) {
    return "";
  }
  let hasMod = false;
  let hasAlt = false;
  let hasShift = false;
  let key = "";
  for (const token of tokens) {
    const lower = token.toLowerCase();
    if (lower === "mod" || lower === "cmd" || lower === "command" || lower === "ctrl" || lower === "control" || lower === "meta") {
      hasMod = true;
      continue;
    }
    if (lower === "alt" || lower === "option") {
      hasAlt = true;
      continue;
    }
    if (lower === "shift") {
      hasShift = true;
      continue;
    }
    key = normalizeHotkeyKey(token);
  }
  if (!key || key === "Meta" || key === "Control" || key === "Shift" || key === "Alt") {
    return "";
  }
  const parts: string[] = [];
  if (hasMod) parts.push("Mod");
  if (hasAlt) parts.push("Alt");
  if (hasShift) parts.push("Shift");
  if (!hasMod) {
    return "";
  }
  parts.push(key);
  return parts.join("+");
};

const actionHotkeyFromKeyboardEvent = (event: KeyboardEvent): string => {
  const key = normalizeHotkeyKey(event.key);
  if (!key || key === "Meta" || key === "Control" || key === "Shift" || key === "Alt") {
    return "";
  }
  const parts: string[] = [];
  if (event.metaKey || event.ctrlKey) parts.push("Mod");
  if (event.altKey) parts.push("Alt");
  if (event.shiftKey) parts.push("Shift");
  if (parts.length === 0 && key.length === 1) {
    return "";
  }
  parts.push(key);
  return parts.join("+");
};

const ActivityBundleRow = ({
  rowId,
  chips,
  tsMs,
  durationMs,
  items,
  defaultOpen,
  plansById,
  getTodoPlanByActivityId,
  onViewPlan,
  onBuildPlan,
  onCopyPlan,
  onForkFromUserMessage
}: ActivityBundleRowProps) => {
  const [groupOpen, setGroupOpen] = useState(defaultOpen);

  useEffect(() => {
    if (defaultOpen) {
      setGroupOpen(true);
    }
  }, [defaultOpen]);

  const formattedTimestamp = formatThreadActivityTimestamp(tsMs);
  const formattedDuration = (() => {
    if (durationMs > 0 && durationMs < 1000) {
      return `${durationMs}ms`;
    }
    const totalSeconds = Math.max(0, Math.floor(durationMs / 1000));
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;

    if (minutes <= 0) {
      return `${totalSeconds}s`;
    }
    if (seconds <= 0) {
      return `${minutes}m`;
    }
    return `${minutes}m ${seconds}s`;
  })();

  return (
    <article className="timeline-item min-w-0 overflow-hidden">
      <section className={`activity-group activity-group-commands ${groupOpen ? "is-open" : ""}`}>
        <button
          type="button"
          className="activity-summary"
          aria-expanded={groupOpen}
          onClick={() => {
            setGroupOpen((prev) => !prev);
          }}
        >
          <span>Activity</span>
          {chips.map((chip, index) => (
            <span key={`${rowId}-chip-${index}`} className="summary-chip">
              {chip}
            </span>
          ))}
          <span className="ml-auto flex items-center gap-3">
            <span className="text-right text-[11px] text-slate-400">{formattedTimestamp}</span>
            <span className="text-right text-[11px] text-slate-400">{formattedDuration}</span>
            <FaChevronDown className={`accordion-chevron ${groupOpen ? "open" : ""}`} />
          </span>
        </button>
        <div className={`activity-bundle-collapse ${groupOpen ? "open" : ""}`} aria-hidden={!groupOpen}>
          <div className="activity-body">
            <MemoizedTimelineItemsList
              timelineItems={items}
              plansById={plansById}
              getTodoPlanByActivityId={getTodoPlanByActivityId}
              onViewPlan={onViewPlan}
              onBuildPlan={onBuildPlan}
              onCopyPlan={onCopyPlan}
              onForkFromUserMessage={onForkFromUserMessage}
              showDurations
            />
          </div>
        </div>
      </section>
    </article>
  );
};
const MemoizedActivityBundleRow = memo(ActivityBundleRow);
const TimelinePlanRow = ({
  item,
  plansById,
  getTodoPlanByActivityId,
  onViewPlan,
  onBuildPlan,
  onCopyPlan,
  onForkFromUserMessage
}: TimelinePlanRowProps) => {
  const singleItem = useMemo(() => [item], [item]);

  return (
    <MemoizedTimelineItemsList
      timelineItems={singleItem}
      plansById={plansById}
      getTodoPlanByActivityId={getTodoPlanByActivityId}
      onViewPlan={onViewPlan}
      onBuildPlan={onBuildPlan}
      onCopyPlan={onCopyPlan}
      onForkFromUserMessage={onForkFromUserMessage}
    />
  );
};
const MemoizedTimelinePlanRow = memo(TimelinePlanRow);

export const App = () => {
  const isSettingsWindow = isSettingsWindowContext();
  const isCodeWindow = isCodeWindowContext();
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [threads, setThreads] = useState<Thread[]>([]);
  const [activeWorkspaceId, setActiveWorkspaceId] = useState<string | null>(() => readStoredActiveWorkspaceId());
  const [activeProjectId, setActiveProjectId] = useState<string | null>(() => {
    const queryProjectId = isCodeWindow ? readCodeWindowProjectId() : null;
    if (queryProjectId) {
      return queryProjectId;
    }
    return readStoredActiveProjectId();
  });
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [messages, setMessages] = useState<MessageEvent[]>([]);
  const [terminalLines, setTerminalLines] = useState<string[]>([]);
  const terminalOutputRef = useRef<HTMLDivElement | null>(null);
  const terminalInstanceRef = useRef<XtermTerminal | null>(null);
  const terminalFitAddonRef = useRef<FitAddon | null>(null);
  const terminalRenderedOutputRef = useRef("");
  const [composerHasText, setComposerHasText] = useState(false);
  const [threadMenuProjectId, setThreadMenuProjectId] = useState<string | null>(null);
  const [showArchivedByProjectId, setShowArchivedByProjectId] = useState<Record<string, boolean>>({});
  const [showArchivedProjectsByWorkspaceId, setShowArchivedProjectsByWorkspaceId] = useState<Record<string, boolean>>({});
  const [projectListOpenById, setProjectListOpenById] = useState<Record<string, boolean>>(() => readStoredProjectListOpenById());
  const [hasLoadedProjectsOnce, setHasLoadedProjectsOnce] = useState(false);
  const [threadDraftTitle, setThreadDraftTitle] = useState("New thread");
  const [isProjectMenuOpen, setIsProjectMenuOpen] = useState(false);
  const [installStatus, setInstallStatus] = useState<InstallStatus | null>(null);
  const [codexAuthStatus, setCodexAuthStatus] = useState<CodexAuthStatus | null>(null);
  const [openCodeAuthStatus, setOpenCodeAuthStatus] = useState<OpenCodeAuthStatus | null>(null);
  const [isCodexAuthCardDismissed, setIsCodexAuthCardDismissed] = useState(false);
  const [codexLoginInFlight, setCodexLoginInFlight] = useState(false);
  const [codexLogoutInFlight, setCodexLogoutInFlight] = useState(false);
  const [openCodeLoginInFlight, setOpenCodeLoginInFlight] = useState(false);
  const [openCodeLogoutInFlight, setOpenCodeLogoutInFlight] = useState(false);
  const [showSetupModal, setShowSetupModal] = useState(false);
  const [setupPermissionGranted, setSetupPermissionGranted] = useState(false);
  const [setupInstalling, setSetupInstalling] = useState(false);
  const [setupLiveLines, setSetupLiveLines] = useState<string[]>([]);
  const [isSetupCardDismissed, setIsSetupCardDismissed] = useState(false);
  const setupLogEndRef = useRef<HTMLDivElement | null>(null);
  const setupLiveBufferRef = useRef<string[]>([]);
  const setupLiveFlushTimeoutRef = useRef<number | null>(null);
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [showSettings, setShowSettings] = useState(() => isSettingsWindowContext());
  const [appSettingsInitialDraft, setAppSettingsInitialDraft] = useState<{
    settings: AppSettings;
    composerOptions: CodexThreadOptions;
    settingsEnvText: string;
    settingsTab: "general" | "harnesses" | "codex" | "env" | "skills";
  }>({
    settings: DEFAULT_SETTINGS,
    composerOptions: getHarnessOptionsFromSettings(DEFAULT_SETTINGS, DEFAULT_SETTINGS.defaultHarnessId ?? "codex"),
    settingsEnvText: envVarsToText(DEFAULT_SETTINGS.envVars),
    settingsTab: "general"
  });
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [showProjectSettings, setShowProjectSettings] = useState(false);
  const [showProjectActionsSettings, setShowProjectActionsSettings] = useState(false);
  const [projectSettingsInitialDraft, setProjectSettingsInitialDraft] = useState<{
    projectName: string;
    projectColor: string;
    projectWorkspaceTargetId: string;
    projectSettingsEnvText: string;
    projectSettingsWebLinks: ProjectWebLink[];
  } | null>(null);
  const [projectActionsSettingsInitialDraft, setProjectActionsSettingsInitialDraft] = useState<{
    focusCommandId?: string;
    projectSettingsCommands: Array<{
      id: string;
      name: string;
      command: string;
      inDropdown: boolean;
      autoStart: boolean;
      stayRunning: boolean;
      hotkey?: string;
    }>;
  } | null>(null);
  const [showNewProjectModal, setShowNewProjectModal] = useState(false);
  const [showWorkspaceModal, setShowWorkspaceModal] = useState(false);
  const [workspaceModalMode, setWorkspaceModalMode] = useState<"create" | "edit">("create");
  const [workspaceEditingId, setWorkspaceEditingId] = useState<string | null>(null);
  const [workspaceModalInitialDraft, setWorkspaceModalInitialDraft] = useState<{
    name: string;
    color: string;
    moveProjectIds: string[];
  }>({
    name: "",
    color: "#64748b",
    moveProjectIds: []
  });
  const [showImportProjectModal, setShowImportProjectModal] = useState(false);
  const [renameDialog, setRenameDialog] = useState<RenameDialogState | null>(null);
  const [editingProjectId, setEditingProjectId] = useState<string | null>(null);
  const [editingProjectName, setEditingProjectName] = useState("");
  const [importProjectQuery, setImportProjectQuery] = useState("");
  const [importCandidates, setImportCandidates] = useState<GitRepositoryCandidate[]>([]);
  const [importLoading, setImportLoading] = useState(false);
  const [importBusyPath, setImportBusyPath] = useState<string | null>(null);
  const [cloneBusy, setCloneBusy] = useState(false);
  const [creatingProject, setCreatingProject] = useState(false);
  const [projectSetupById, setProjectSetupById] = useState<Record<string, ProjectSetupEvent>>({});
  const projectSetupClearTimeoutByIdRef = useRef<Record<string, number>>({});
  const [logs, setLogs] = useState<string[]>([]);
  const [updateAvailableVersion, setUpdateAvailableVersion] = useState<string | null>(null);
  const [updateDismissed, setUpdateDismissed] = useState(false);
  const [updateInstallPending, setUpdateInstallPending] = useState(false);
  const [activity, setActivity] = useState<ActivityEntry[]>([]);
  const tooltipTargetRef = useRef<HTMLElement | null>(null);
  const tooltipElementRef = useRef<HTMLDivElement | null>(null);
  const tooltipVisibleRef = useRef(false);
  const tooltipAnimationFrameRef = useRef<number | null>(null);
  const tooltipHoverTimeoutRef = useRef<number | null>(null);
  const tooltipTextRef = useRef("");
  const tooltipPlacementRef = useRef<TooltipPlacement>("below");
  const suppressedNativeTitleRef = useRef<{ target: HTMLElement; title: string } | null>(null);
  const [threadHistoryCursorById, setThreadHistoryCursorById] = useState<Record<string, number | undefined>>({});
  const [threadHistoryHasMoreById, setThreadHistoryHasMoreById] = useState<Record<string, boolean>>({});
  const [threadHistoryLoadingById, setThreadHistoryLoadingById] = useState<Record<string, boolean>>({});
  const [runStateByThreadId, setRunStateByThreadId] = useState<Record<string, ThreadRunState>>({});
  const [sendPendingByThreadId, setSendPendingByThreadId] = useState<Record<string, boolean>>({});
  const [composerDraftByThreadId, setComposerDraftByThreadId] = useState<Record<string, string>>({});
  const [queuedPromptsByThreadId, setQueuedPromptsByThreadId] = useState<Record<string, QueuedPrompt[]>>({});
  const [threadCompletionFlashById, setThreadCompletionFlashById] = useState<Record<string, boolean>>({});
  const [threadFinishedUnreadById, setThreadFinishedUnreadById] = useState<Record<string, boolean>>({});
  const [threadAwaitingInputById, setThreadAwaitingInputById] = useState<Record<string, boolean>>({});
  const [pendingUserQuestionsByThreadId, setPendingUserQuestionsByThreadId] = useState<Record<string, PendingUserQuestion[]>>({});
  const [pendingUserInputRequestIdByThreadId, setPendingUserInputRequestIdByThreadId] = useState<Record<string, string>>({});
  const [userQuestionAnswersByThreadId, setUserQuestionAnswersByThreadId] = useState<
    Record<string, Record<string, UserQuestionAnswerState>>
  >({});
  const [activeQuestionIndexByThreadId, setActiveQuestionIndexByThreadId] = useState<Record<string, number>>({});
  const [skillsByProjectId, setSkillsByProjectId] = useState<Record<string, SkillRecord[]>>({});
  const [appSkills, setAppSkills] = useState<SkillRecord[]>([]);
  const [skillEditorPath, setSkillEditorPath] = useState<string>("");
  const [skillEditorContent, setSkillEditorContent] = useState<string>("");
  const [skillEditorSaving, setSkillEditorSaving] = useState(false);
  const [threadSummaryById, setThreadSummaryById] = useState<Record<string, string>>(() => readStoredThreadSummaries());
  const [composerOptions, setComposerOptions] = useState<CodexThreadOptions>(
    getHarnessOptionsFromSettings(DEFAULT_SETTINGS, DEFAULT_SETTINGS.defaultHarnessId ?? "codex")
  );
  const [composerAttachments, setComposerAttachments] = useState<ComposerAttachment[]>([]);
  const [composerMentionedFiles, setComposerMentionedFiles] = useState<string[]>([]);
  const [composerMentionedSkills, setComposerMentionedSkills] = useState<Array<{ name: string; path: string }>>([]);
  const [isDraggingFiles, setIsDraggingFiles] = useState(false);
  const [projectFilesByProjectId, setProjectFilesByProjectId] = useState<Record<string, ProjectFileEntry[]>>({});
  const [fileMention, setFileMention] = useState<FileMentionState | null>(null);
  const [skillMention, setSkillMention] = useState<SkillMentionState | null>(null);
  const [projectSettingsById, setProjectSettingsById] = useState<Record<string, ProjectSettings>>({});
  const [projectTerminalById, setProjectTerminalById] = useState<Record<string, ProjectTerminalState>>({});
  const dismissedTerminalErrorStampByKeyRef = useRef<Record<string, string>>({});
  const [systemTerminals, setSystemTerminals] = useState<SystemTerminalOption[]>([]);
  const [projectPreviewUrlById, setProjectPreviewUrlById] = useState<Record<string, string>>({});
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [isGitPanelOpen, setIsGitPanelOpen] = useState(false);
  const [rightPanelWidthPx, setRightPanelWidthPx] = useState(RIGHT_PANEL_DEFAULT_WIDTH_PX);
  const [isPreviewPoppedOut, setIsPreviewPoppedOut] = useState(false);
  const [terminalPopoutByKey, setTerminalPopoutByKey] = useState<Record<string, boolean>>({});
  const [gitStateByProjectId, setGitStateByProjectId] = useState<Record<string, GitState>>({});
  const [gitOutgoingCommitsByProjectId, setGitOutgoingCommitsByProjectId] = useState<Record<string, GitOutgoingCommit[]>>({});
  const [gitIncomingCommitsByProjectId, setGitIncomingCommitsByProjectId] = useState<Record<string, GitOutgoingCommit[]>>({});
  const [gitSharedHistoryByProjectId, setGitSharedHistoryByProjectId] = useState<Record<string, GitHistoryCommit[]>>({});
  const [gitSharedHistoryExpandedByProjectId, setGitSharedHistoryExpandedByProjectId] = useState<Record<string, boolean>>({});
  const [gitSharedHistoryLoadingByProjectId, setGitSharedHistoryLoadingByProjectId] = useState<Record<string, boolean>>({});
  const [gitSelectedPathByProjectId, setGitSelectedPathByProjectId] = useState<Record<string, string | null>>({});
  const [gitBusyAction, setGitBusyAction] = useState<string | null>(null);
  const [gitPushProgressLabel, setGitPushProgressLabel] = useState<string | null>(null);
  const [isGitRefreshBusy, setIsGitRefreshBusy] = useState(false);
  const [gitInitRevealByProjectId, setGitInitRevealByProjectId] = useState<Record<string, boolean>>({});
  const [gitCommitIsGeneratingMessage, setGitCommitIsGeneratingMessage] = useState(false);
  const [gitBranchSearch, setGitBranchSearch] = useState("");
  const [branchListScrollTop, setBranchListScrollTop] = useState(0);
  const [branchListViewportHeight, setBranchListViewportHeight] = useState(208);
  const [gitActivityByProjectId, setGitActivityByProjectId] = useState<Record<string, GitActivityEntry[]>>({});
  const [gitActivityExpandedByProjectId, setGitActivityExpandedByProjectId] = useState<Record<string, boolean>>({});
  const [isGitPoppedOut, setIsGitPoppedOut] = useState(false);
  const [isCodePanelPoppedOut, setIsCodePanelPoppedOut] = useState(false);
  const planPopoutWindowRef = useRef<Window | null>(null);
  const [orchestrationRunsByParentId, setOrchestrationRunsByParentId] = useState<Record<string, OrchestrationRun[]>>({});
  const [orchestrationChildrenByRunId, setOrchestrationChildrenByRunId] = useState<Record<string, OrchestrationChild[]>>({});
  const [showRunningSubthreadsByThreadId, setShowRunningSubthreadsByThreadId] = useState<Record<string, boolean>>({});
  const [removingProject, setRemovingProject] = useState(false);
  const [isWindowMaximized, setIsWindowMaximized] = useState(false);
  const [isBranchDropdownOpen, setIsBranchDropdownOpen] = useState(false);
  const [isChangelogOpen, setIsChangelogOpen] = useState(false);
  const [isCtrlSwitchHintVisible, setIsCtrlSwitchHintVisible] = useState(false);
  const [isAltThreadSwitchHintVisible, setIsAltThreadSwitchHintVisible] = useState(false);
  const [branchDropdownPosition, setBranchDropdownPosition] = useState<{ bottom: number; left: number; width: number } | null>(null);
  const [composerDropdown, setComposerDropdown] = useState<{
    kind: ComposerDropdownKind;
    bottom: number;
    left: number;
    width: number;
  } | null>(null);
  const [isVoiceRecording, setIsVoiceRecording] = useState(false);
  const [isVoiceTranscribing, setIsVoiceTranscribing] = useState(false);
  const activeThreadIdRef = useRef<string | null>(null);
  const previousActiveThreadIdRef = useRef<string | null>(null);
  const composerRef = useRef("");
  const lastStartedOptionsKeyRef = useRef<string>("");
  const attachmentsRef = useRef<ComposerAttachment[]>([]);
  const imagePickerRef = useRef<HTMLInputElement | null>(null);
  const composerTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const fileMentionMenuRef = useRef<HTMLDivElement | null>(null);
  const skillMentionMenuRef = useRef<HTMLDivElement | null>(null);
  const previewWebviewRef = useRef<HTMLElement | null>(null);
  const branchTriggerRef = useRef<HTMLDivElement | null>(null);
  const branchListRef = useRef<HTMLDivElement | null>(null);
  const changelogRef = useRef<HTMLDivElement | null>(null);
  const branchDropdownMenuRef = useRef<HTMLDivElement | null>(null);
  const composerModelTriggerRef = useRef<HTMLButtonElement | null>(null);
  const composerEffortTriggerRef = useRef<HTMLButtonElement | null>(null);
  const composerModeTriggerRef = useRef<HTMLButtonElement | null>(null);
  const composerSandboxTriggerRef = useRef<HTMLButtonElement | null>(null);
  const gitCommitInputRef = useRef<HTMLInputElement | null>(null);
  const composerDropdownMenuRef = useRef<HTMLDivElement | null>(null);
  const composerMentionRafRef = useRef<number | null>(null);
  const composerResizeRafRef = useRef<number | null>(null);
  const composerFocusRafRef = useRef<number | null>(null);
  const threadCreateMenuRef = useRef<HTMLDivElement | null>(null);
  const threadCreateInputRef = useRef<HTMLInputElement | null>(null);
  const threadContextMenuRef = useRef<HTMLDivElement | null>(null);
  const threadContextMenuButtonRef = useRef<HTMLButtonElement | null>(null);
  const threadContextMenuRenameRef = useRef<HTMLButtonElement | null>(null);
  const threadContextMenuArchiveRef = useRef<HTMLButtonElement | null>(null);
  const threadContextMenuUnarchiveRef = useRef<HTMLButtonElement | null>(null);
  const threadContextMenuThreadIdRef = useRef<string | null>(null);
  const threadContextMenuCloseTimerRef = useRef<number | null>(null);
  const mainLayoutGridRef = useRef<HTMLDivElement | null>(null);
  const rightPanelResizeSessionRef = useRef<{ startX: number; startWidth: number } | null>(null);
  const rightPanelResizeRafRef = useRef<number | null>(null);
  const rightPanelPendingWidthRef = useRef(RIGHT_PANEL_DEFAULT_WIDTH_PX);
  const threadsRef = useRef<Thread[]>([]);
  const timelineViewportRef = useRef<HTMLElement | null>(null);
  const pendingHistoryScrollRestoreRef = useRef<{
    threadId: string;
    previousHeight: number;
    previousTop: number;
  } | null>(null);
  const runStateByThreadIdRef = useRef<Record<string, ThreadRunState>>({});
  const sendPendingByThreadIdRef = useRef<Record<string, boolean>>({});
  const threadAwaitingInputByIdRef = useRef<Record<string, boolean>>({});
  const pendingUserQuestionsByThreadIdRef = useRef<Record<string, PendingUserQuestion[]>>({});
  const pendingUserInputRequestIdByThreadIdRef = useRef<Record<string, string>>({});
  const queuedPromptsByThreadIdRef = useRef<Record<string, QueuedPrompt[]>>({});
  const queueProcessingThreadIdsRef = useRef<Set<string>>(new Set());
  const completionAudioContextRef = useRef<AudioContext | null>(null);
  const voiceRecorderRef = useRef<MediaRecorder | null>(null);
  const voiceStreamRef = useRef<MediaStream | null>(null);
  const voiceChunksRef = useRef<Blob[]>([]);
  const terminalPopoutWindowsRef = useRef<Record<string, Window | null>>({});
  const terminalPopoutInstancesRef = useRef<Record<string, ActionTerminalPopoutInstance>>({});
  const ghosttyInitPromiseRef = useRef<Promise<void> | null>(null);
  const isLightTheme = (settings.theme ?? "midnight") === "dawn" || (settings.theme ?? "midnight") === "linen";
  const appIconSrc = isLightTheme ? appIconLight : appIconDark;
  const appendLog = useCallback((line: string) => {
    setLogs((prev) => [...prev, line]);
  }, []);
  const buildMainLayoutGridTemplate = useCallback(
    (rightWidthPx: number) => ((isPreviewOpen || isGitPanelOpen) ? `300px minmax(0, 1fr) ${rightWidthPx}px` : "300px 1fr"),
    [isPreviewOpen, isGitPanelOpen]
  );
  const applyMainLayoutGridTemplate = useCallback(
    (rightWidthPx: number) => {
      const layout = mainLayoutGridRef.current;
      if (!layout || isSettingsWindow || isCodeWindow) {
        return;
      }
      layout.style.gridTemplateColumns = buildMainLayoutGridTemplate(rightWidthPx);
    },
    [buildMainLayoutGridTemplate, isCodeWindow, isSettingsWindow]
  );
  const flushRightPanelResize = useCallback(() => {
    rightPanelResizeRafRef.current = null;
    applyMainLayoutGridTemplate(rightPanelPendingWidthRef.current);
  }, [applyMainLayoutGridTemplate]);
  const handleRightPanelResizeMove = useCallback((event: MouseEvent) => {
    const session = rightPanelResizeSessionRef.current;
    if (!session) {
      return;
    }
    const deltaX = session.startX - event.clientX;
    const viewportConstrainedMax = Math.max(
      RIGHT_PANEL_MIN_WIDTH_PX,
      Math.min(RIGHT_PANEL_MAX_WIDTH_PX, Math.floor(window.innerWidth * 0.72))
    );
    const nextWidth = Math.max(
      RIGHT_PANEL_MIN_WIDTH_PX,
      Math.min(viewportConstrainedMax, session.startWidth + deltaX)
    );
    if (nextWidth === rightPanelPendingWidthRef.current) {
      return;
    }
    rightPanelPendingWidthRef.current = nextWidth;
    if (rightPanelResizeRafRef.current !== null) {
      return;
    }
    rightPanelResizeRafRef.current = window.requestAnimationFrame(flushRightPanelResize);
  }, [flushRightPanelResize]);
  const stopRightPanelResize = useCallback(() => {
    rightPanelResizeSessionRef.current = null;
    if (rightPanelResizeRafRef.current !== null) {
      window.cancelAnimationFrame(rightPanelResizeRafRef.current);
      rightPanelResizeRafRef.current = null;
    }
    window.removeEventListener("mousemove", handleRightPanelResizeMove);
    window.removeEventListener("mouseup", stopRightPanelResize);
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
    applyMainLayoutGridTemplate(rightPanelPendingWidthRef.current);
    setRightPanelWidthPx((prev) => (prev === rightPanelPendingWidthRef.current ? prev : rightPanelPendingWidthRef.current));
  }, [applyMainLayoutGridTemplate, handleRightPanelResizeMove]);
  const startRightPanelResize = useCallback((event: ReactMouseEvent<HTMLDivElement>) => {
    event.preventDefault();
    rightPanelPendingWidthRef.current = rightPanelWidthPx;
    rightPanelResizeSessionRef.current = {
      startX: event.clientX,
      startWidth: rightPanelPendingWidthRef.current
    };
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    window.addEventListener("mousemove", handleRightPanelResizeMove);
    window.addEventListener("mouseup", stopRightPanelResize);
  }, [handleRightPanelResizeMove, rightPanelWidthPx, stopRightPanelResize]);
  useEffect(() => {
    rightPanelPendingWidthRef.current = rightPanelWidthPx;
  }, [rightPanelWidthPx]);
  useEffect(() => {
    const rightColumnWidthPx = isGitPanelOpen ? rightPanelWidthPx : RIGHT_PANEL_DEFAULT_WIDTH_PX;
    applyMainLayoutGridTemplate(rightColumnWidthPx);
  }, [applyMainLayoutGridTemplate, isGitPanelOpen, rightPanelWidthPx]);
  useEffect(() => () => stopRightPanelResize(), [stopRightPanelResize]);
  useEffect(() => {
    if (!isGitPanelOpen) {
      stopRightPanelResize();
    }
  }, [isGitPanelOpen, stopRightPanelResize]);
  const terminalErrorKey = useCallback((projectId: string, commandId: string) => `${projectId}:${commandId}`, []);
  const applyDismissedTerminalErrors = useCallback(
    (projectId: string, state: ProjectTerminalState): ProjectTerminalState => {
      const nextTerminals = state.terminals.map((terminal) => {
        const dismissedStamp =
          dismissedTerminalErrorStampByKeyRef.current[terminalErrorKey(projectId, terminal.commandId)];
        if (
          dismissedStamp &&
          typeof terminal.lastExitCode === "number" &&
          terminal.lastExitCode !== 0 &&
          terminal.updatedAt === dismissedStamp
        ) {
          return {
            ...terminal,
            lastExitCode: undefined
          };
        }
        return terminal;
      });
      const aggregateTerminal = nextTerminals.find((terminal) => terminal.commandId === state.commandId);
      return {
        ...state,
        running: nextTerminals.some((terminal) => terminal.running),
        terminals: nextTerminals,
        outputTail: aggregateTerminal?.outputTail ?? state.outputTail,
        lastExitCode: aggregateTerminal?.lastExitCode
      };
    },
    [terminalErrorKey]
  );

  const threadById = useMemo(
    () => Object.fromEntries(threads.map((thread) => [thread.id, thread])) as Record<string, Thread>,
    [threads]
  );
  const projectById = useMemo(
    () => Object.fromEntries(projects.map((project) => [project.id, project])) as Record<string, Project>,
    [projects]
  );
  const activeThread = useMemo(() => (activeThreadId ? threadById[activeThreadId] || null : null), [activeThreadId, threadById]);
  const activeHarnessId = (activeThread?.harnessId ?? activeThread?.provider ?? settings.defaultHarnessId ?? "codex") as HarnessId;
  const activeHarness = useMemo(
    () => getSupportedHarness(activeHarnessId) ?? getSupportedHarness("codex")!,
    [activeHarnessId]
  );
  const activeHarnessSupportsCompact = harnessSupports(activeHarnessId, "thread_compact");
  const activeHarnessSupportsFork = harnessSupports(activeHarnessId, "thread_fork");
  const activeHarnessSupportsReview = harnessSupports(activeHarnessId, "review");
  const activeHarnessSupportsSubthreads = harnessSupports(activeHarnessId, "subthreads");
  const activeHarnessRequiredSetupKeys = useMemo(
    () => new Set(activeHarness?.setup.requiredKeys ?? ["node", "npm", "git", "rg"]),
    [activeHarness]
  );
  const activeHarnessBlockingSetupKeys = useMemo(
    () => new Set(activeHarness?.setup.blockingKeys ?? []),
    [activeHarness]
  );
  const activeComposerDraft = useMemo(
    () => (activeThreadId ? composerDraftByThreadId[activeThreadId] ?? "" : ""),
    [activeThreadId, composerDraftByThreadId]
  );
  const selectedProject = useMemo(() => (activeProjectId ? projectById[activeProjectId] ?? null : null), [projectById, activeProjectId]);
  const activeProject = useMemo(
    () => (activeThread ? projectById[activeThread.projectId] || selectedProject : selectedProject),
    [activeThread, projectById, selectedProject]
  );
  const activeProjectFiles = useMemo(
    () => (activeProjectId ? projectFilesByProjectId[activeProjectId] ?? [] : []),
    [activeProjectId, projectFilesByProjectId]
  );
  const activeProjectFileSearchIndex = useMemo(
    () =>
      activeProjectFiles.map((entry) => ({
        entry,
        fullPathLower: entry.path.toLowerCase(),
        nameLower: basename(entry.path).toLowerCase()
      })),
    [activeProjectFiles]
  );
  const deferredFileMention = useDeferredValue(fileMention);
  const fileMentionMatches = useMemo(() => {
    if (!deferredFileMention) {
      return [];
    }
    const query = deferredFileMention.query.trim().toLowerCase();
    const matches = activeProjectFileSearchIndex.filter((item) => {
      if (!query) {
        return true;
      }
      return item.fullPathLower.includes(query) || item.nameLower.includes(query);
    });
    return matches.slice(0, FILE_MENTION_MATCH_LIMIT).map((item) => item.entry);
  }, [activeProjectFileSearchIndex, deferredFileMention]);
  const fileMentionDuplicateBasenames = useMemo(
    () => findDuplicateBasenames(fileMentionMatches.map((entry) => entry.path)),
    [fileMentionMatches]
  );
  const activeSkills = useMemo(() => {
    const projectSkills = activeProjectId ? skillsByProjectId[activeProjectId] ?? [] : [];
    const byPath = new Map<string, SkillRecord>();
    [...projectSkills, ...appSkills].forEach((skill) => {
      if (!skill.enabled || !skill.path.trim()) {
        return;
      }
      if (!byPath.has(skill.path)) {
        byPath.set(skill.path, skill);
      }
    });
    return Array.from(byPath.values());
  }, [activeProjectId, appSkills, skillsByProjectId]);
  const activeSkillSearchIndex = useMemo(
    () =>
      activeSkills.map((skill) => ({
        skill,
        nameLower: skill.name.toLowerCase(),
        descriptionLower: skill.description.toLowerCase(),
        pathLower: skill.path.toLowerCase()
      })),
    [activeSkills]
  );
  const deferredSkillMention = useDeferredValue(skillMention);
  const skillMentionMatches = useMemo(() => {
    if (!deferredSkillMention) {
      return [];
    }
    const query = deferredSkillMention.query.trim().toLowerCase();
    const ranked = activeSkillSearchIndex
      .filter((item) => {
        if (!query) {
          return true;
        }
        return (
          item.nameLower.includes(query) ||
          item.pathLower.includes(query) ||
          item.descriptionLower.includes(query)
        );
      })
      .sort((a, b) => {
        const aStarts = a.nameLower.startsWith(query);
        const bStarts = b.nameLower.startsWith(query);
        if (aStarts && !bStarts) return -1;
        if (!aStarts && bStarts) return 1;
        return a.nameLower.localeCompare(b.nameLower);
      });
    return ranked.slice(0, SKILL_MENTION_MATCH_LIMIT).map((item) => item.skill);
  }, [activeSkillSearchIndex, deferredSkillMention]);
  const composerMentionedFileDuplicateBasenames = useMemo(
    () => findDuplicateBasenames(composerMentionedFiles),
    [composerMentionedFiles]
  );
  const fileMentionHighlightIndex = fileMention
    ? Math.max(0, Math.min(fileMention.highlightedIndex, Math.max(fileMentionMatches.length - 1, 0)))
    : 0;
  const skillMentionHighlightIndex = skillMention
    ? Math.max(0, Math.min(skillMention.highlightedIndex, Math.max(skillMentionMatches.length - 1, 0)))
    : 0;
  const hasComposerPayload = composerHasText || composerAttachments.length > 0 || composerMentionedFiles.length > 0;
  const hasProjects = projects.length > 0;
  const activeProjectSettings = useMemo(
    () => (activeProjectId ? projectSettingsById[activeProjectId] : undefined),
    [activeProjectId, projectSettingsById]
  );
  const activeProjectBrowserEnabled = activeProjectSettings?.browserEnabled ?? true;
  const activeProjectBrowserMode = settings.browserMode ?? "in_app";
  const activeProjectPreviewPartition = useMemo(
    () => (activeProjectId ? `persist:codeapp-preview-${activeProjectId.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, "-") || "default"}` : "persist:codeapp-preview-default"),
    [activeProjectId]
  );
  const activeProjectWebLinks = useMemo(
    () => activeProjectSettings?.webLinks ?? [],
    [activeProjectSettings?.webLinks]
  );
  const isPreviewVisible = isPreviewOpen;
  const activeProjectTerminalState = useMemo(
    () => (activeProjectId ? projectTerminalById[activeProjectId] : undefined),
    [activeProjectId, projectTerminalById]
  );
  const activeProjectTerminals = useMemo(
    () => activeProjectTerminalState?.terminals ?? [],
    [activeProjectTerminalState]
  );
  const activeProjectPreviewUrl = useMemo(
    () => (activeProjectId ? projectPreviewUrlById[activeProjectId] ?? "" : ""),
    [activeProjectId, projectPreviewUrlById]
  );
  const activeGitState = useMemo(
    () => (activeProjectId ? gitStateByProjectId[activeProjectId] : undefined),
    [activeProjectId, gitStateByProjectId]
  );
  const activeGitAddedLines = activeGitState?.addedLines ?? 0;
  const activeGitRemovedLines = activeGitState?.removedLines ?? 0;
  const showHeaderGitDiffStats = activeGitState?.insideRepo && (activeGitAddedLines > 0 || activeGitRemovedLines > 0);
  const activeSelectedGitPath = useMemo(
    () => (activeProjectId ? gitSelectedPathByProjectId[activeProjectId] ?? null : null),
    [activeProjectId, gitSelectedPathByProjectId]
  );
  const activeGitActivity = useMemo(
    () => (activeProjectId ? gitActivityByProjectId[activeProjectId] ?? [] : []),
    [activeProjectId, gitActivityByProjectId]
  );
  const activeOutgoingCommits = useMemo(
    () => (activeProjectId ? gitOutgoingCommitsByProjectId[activeProjectId] ?? [] : []),
    [activeProjectId, gitOutgoingCommitsByProjectId]
  );
  const activeIncomingCommits = useMemo(
    () => (activeProjectId ? gitIncomingCommitsByProjectId[activeProjectId] ?? [] : []),
    [activeProjectId, gitIncomingCommitsByProjectId]
  );
  const activeSharedHistory = useMemo(
    () => (activeProjectId ? gitSharedHistoryByProjectId[activeProjectId] ?? [] : []),
    [activeProjectId, gitSharedHistoryByProjectId]
  );
  const activeGitSharedHistoryExpanded = activeProjectId ? Boolean(gitSharedHistoryExpandedByProjectId[activeProjectId]) : false;
  const activeGitSharedHistoryLoading = activeProjectId ? Boolean(gitSharedHistoryLoadingByProjectId[activeProjectId]) : false;
  const activeGitInitReveal = activeProjectId ? Boolean(gitInitRevealByProjectId[activeProjectId]) : false;
  const showGitInitLoader = gitBusyAction === "init";
  const showGitInitAction = Boolean(
    activeProjectId && activeGitState && !activeGitState.insideRepo && !showGitInitLoader
  );
  const activeStagedFiles = useMemo(
    () => (activeGitState?.files ?? []).filter((file) => file.staged),
    [activeGitState?.files]
  );
  const activeUnstagedFiles = useMemo(
    () => (activeGitState?.files ?? []).filter((file) => file.unstaged || file.untracked),
    [activeGitState?.files]
  );
  const activeConflictFiles = useMemo(() => {
    const conflictStatusPairs = new Set(["DD", "AU", "UD", "UA", "DU", "AA", "UU"]);
    return (activeGitState?.files ?? []).filter((file) =>
      conflictStatusPairs.has(`${file.indexStatus}${file.workTreeStatus}`)
    );
  }, [activeGitState?.files]);
  const gitBranchInput = gitBranchSearch.trim();
  const deferredGitBranchInput = useDeferredValue(gitBranchInput);
  const filteredBranches = useMemo(() => {
    const branches = activeGitState?.branches ?? [];
    if (!deferredGitBranchInput) {
      return branches;
    }
    const search = deferredGitBranchInput.toLowerCase();
    return branches.filter((branch) => branch.name.toLowerCase().includes(search));
  }, [activeGitState?.branches, deferredGitBranchInput]);
  const visibleBranches = useMemo(() => {
    const total = filteredBranches.length;
    if (total <= 0) {
      return {
        rows: [] as typeof filteredBranches,
        offsetTop: 0,
        totalHeight: 0
      };
    }

    const start = Math.max(0, Math.floor(branchListScrollTop / BRANCH_ROW_HEIGHT_PX) - BRANCH_LIST_OVERSCAN);
    const visibleCount = Math.ceil(branchListViewportHeight / BRANCH_ROW_HEIGHT_PX) + BRANCH_LIST_OVERSCAN * 2;
    const end = Math.min(total, start + visibleCount);

    return {
      rows: filteredBranches.slice(start, end),
      offsetTop: start * BRANCH_ROW_HEIGHT_PX,
      totalHeight: total * BRANCH_ROW_HEIGHT_PX
    };
  }, [filteredBranches, branchListScrollTop, branchListViewportHeight]);
  const exactBranchMatch = useMemo(() => {
    if (!gitBranchInput || !activeGitState?.insideRepo) {
      return null;
    }
    return activeGitState.branches.find((branch) => branch.name === gitBranchInput) ?? null;
  }, [activeGitState, gitBranchInput]);
  const canCreateBranchFromInput = Boolean(gitBranchInput) && !/\s/.test(gitBranchInput) && !exactBranchMatch;
  const activeUntrackedFilesCount = useMemo(
    () => activeUnstagedFiles.filter((file) => file.untracked).length,
    [activeUnstagedFiles]
  );
  const activeUnstagedTrackedFilesCount = useMemo(
    () => activeUnstagedFiles.filter((file) => !file.untracked).length,
    [activeUnstagedFiles]
  );
  const hasStageableFiles = activeUnstagedFiles.length > 0;
  const hasMergeConflicts = activeConflictFiles.length > 0;
  const isWorkingTreeClean = hasStageableFiles === false && activeStagedFiles.length === 0;
  const activeRunState: ThreadRunState = activeThreadId ? runStateByThreadId[activeThreadId] ?? "idle" : "idle";
  const activeThreadSendPending = activeThreadId ? Boolean(sendPendingByThreadId[activeThreadId]) : false;
  const activeThreadAwaitingInput = activeThreadId ? Boolean(threadAwaitingInputById[activeThreadId]) : false;
  const activePendingUserQuestions = useMemo(
    () => (activeThreadId ? pendingUserQuestionsByThreadId[activeThreadId] ?? [] : []),
    [activeThreadId, pendingUserQuestionsByThreadId]
  );
  const showQuestionComposer = Boolean(activeThread && activeThreadAwaitingInput && activePendingUserQuestions.length > 0);
  const activeQuestionIndexRaw = activeThreadId ? activeQuestionIndexByThreadId[activeThreadId] ?? 0 : 0;
  const activeQuestionIndex = Math.max(0, Math.min(activeQuestionIndexRaw, Math.max(activePendingUserQuestions.length - 1, 0)));
  const activeQuestion = activePendingUserQuestions[activeQuestionIndex] ?? null;
  const activePendingUserInputRequestId = activeThreadId ? pendingUserInputRequestIdByThreadId[activeThreadId] ?? "" : "";
  const activeUserQuestionAnswers = useMemo(
    () => (activeThreadId ? userQuestionAnswersByThreadId[activeThreadId] ?? {} : {}),
    [activeThreadId, userQuestionAnswersByThreadId]
  );
  const activeQuestionsRequireAnswer = activePendingUserQuestions.some((question) => {
    const answer = activeUserQuestionAnswers[question.id];
    if (!answer) {
      return true;
    }
    if (answer.selectedOption === CUSTOM_QUESTION_OPTION_VALUE) {
      return answer.customValue.trim().length === 0;
    }
    return answer.selectedOption.trim().length === 0;
  });
  const activeQueuedPrompts = activeThreadId ? queuedPromptsByThreadId[activeThreadId] ?? [] : [];
  const activeQueuedPromptCount = activeQueuedPrompts.length;
  const activeThreadHistoryLoading = activeThreadId ? threadHistoryLoadingById[activeThreadId] ?? false : false;
  const activeThreadHasMoreHistory = activeThreadId ? threadHistoryHasMoreById[activeThreadId] ?? false : false;
  const activeThreadHistoryCursor = activeThreadId ? threadHistoryCursorById[activeThreadId] : undefined;
  const modelLabel = composerOptions.model?.trim() ? composerOptions.model.trim() : "gpt-5.4";
  const effortLabel =
    REASONING_OPTIONS.find((option) => option.value === (composerOptions.modelReasoningEffort ?? "medium"))?.label ?? "Medium";
  const modeLabel =
    COLLABORATION_OPTIONS.find((option) => option.value === (composerOptions.collaborationMode ?? "plan"))?.label ?? "Plan";
  const sandboxLabel =
    SANDBOX_OPTIONS.find((option) => option.value === (composerOptions.sandboxMode ?? "workspace-write"))?.label ??
    "Read + Write";
  const platformShortcutModifier = isMacOS ? "Cmd" : "Ctrl";
  const composerTooltipText = (label: string, detail: string, shortcut?: string) =>
    [label, detail, shortcut ? `Shortcut: ${shortcut}` : null].filter(Boolean).join("\n");
  const clearPendingTooltipHover = useCallback(() => {
    if (tooltipHoverTimeoutRef.current !== null) {
      window.clearTimeout(tooltipHoverTimeoutRef.current);
      tooltipHoverTimeoutRef.current = null;
    }
  }, []);
  const restoreSuppressedNativeTitle = useCallback(() => {
    const suppressed = suppressedNativeTitleRef.current;
    if (!suppressed) {
      return;
    }
    if (suppressed.target.isConnected && !suppressed.target.hasAttribute("title")) {
      suppressed.target.setAttribute("title", suppressed.title);
    }
    suppressedNativeTitleRef.current = null;
  }, []);
  const clearGlobalTooltip = useCallback(() => {
    clearPendingTooltipHover();
    restoreSuppressedNativeTitle();
    tooltipTargetRef.current = null;
    tooltipVisibleRef.current = false;
    const tooltip = tooltipElementRef.current;
    if (!tooltip) {
      return;
    }
    tooltip.classList.remove("is-visible", "is-above", "is-below");
    tooltip.setAttribute("aria-hidden", "true");
  }, [clearPendingTooltipHover, restoreSuppressedNativeTitle]);
  const updateGlobalTooltip = useCallback(() => {
    const target = tooltipTargetRef.current;
    if (!target || !target.isConnected) {
      clearGlobalTooltip();
      return;
    }
    const text = tooltipTextRef.current;
    if (!text) {
      clearGlobalTooltip();
      return;
    }
    const tooltip = tooltipElementRef.current;
    if (!tooltip) {
      return;
    }
    const rect = target.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) {
      clearGlobalTooltip();
      return;
    }
    let placement = tooltipPlacementRef.current;
    if (placement === "above" && rect.top < 72) {
      placement = "below";
    } else if (placement === "below" && window.innerHeight - rect.bottom < 72) {
      placement = "above";
    }
    const centerX = rect.left + rect.width / 2;
    const left = Math.min(window.innerWidth - 16, Math.max(16, centerX));
    const top = placement === "above" ? rect.top - 9 : rect.bottom + 9;
    tooltip.textContent = text;
    tooltip.style.left = `${left}px`;
    tooltip.style.top = `${top}px`;
    tooltip.classList.remove("is-above", "is-below");
    tooltip.classList.add(placement === "above" ? "is-above" : "is-below");
    tooltip.classList.add("is-visible");
    tooltip.setAttribute("aria-hidden", "false");
    tooltipVisibleRef.current = true;
  }, [clearGlobalTooltip]);
  const scheduleTooltipPositionUpdate = useCallback(() => {
    if (tooltipAnimationFrameRef.current !== null) {
      return;
    }
    tooltipAnimationFrameRef.current = window.requestAnimationFrame(() => {
      tooltipAnimationFrameRef.current = null;
      updateGlobalTooltip();
    });
  }, [updateGlobalTooltip]);
  const activateGlobalTooltip = useCallback(
    (target: HTMLElement | null, hoverDelayMs = 0) => {
      if (!target) {
        clearGlobalTooltip();
        return;
      }
      const appTooltipText = target.getAttribute("data-app-tooltip")?.trim();
      const composerTooltip = target.getAttribute("data-composer-tooltip")?.trim();
      const text = appTooltipText || composerTooltip;
      if (!text) {
        clearGlobalTooltip();
        return;
      }
      if (tooltipTargetRef.current === target && tooltipTextRef.current === text && tooltipVisibleRef.current) {
        return;
      }
      const suppressed = suppressedNativeTitleRef.current;
      if (suppressed && suppressed.target !== target) {
        restoreSuppressedNativeTitle();
      }
      if (!suppressedNativeTitleRef.current) {
        const nativeTitle = target.getAttribute("title");
        if (nativeTitle) {
          suppressedNativeTitleRef.current = { target, title: nativeTitle };
          target.removeAttribute("title");
        }
      }
      clearPendingTooltipHover();
      tooltipTargetRef.current = target;
      tooltipTextRef.current = text;
      tooltipPlacementRef.current = appTooltipText ? "below" : "above";
      if (hoverDelayMs > 0) {
        tooltipHoverTimeoutRef.current = window.setTimeout(() => {
          tooltipHoverTimeoutRef.current = null;
          scheduleTooltipPositionUpdate();
        }, hoverDelayMs);
        return;
      }
      scheduleTooltipPositionUpdate();
    },
    [clearGlobalTooltip, clearPendingTooltipHover, restoreSuppressedNativeTitle, scheduleTooltipPositionUpdate]
  );
  const importQuery = importProjectQuery.trim();
  const shouldShowCloneAction = isLikelyGitRepositoryUrl(importQuery);
  const importCandidatesFiltered = useMemo(() => {
    if (!importQuery) {
      return importCandidates;
    }
    const search = importQuery.toLowerCase();
    return importCandidates.filter((candidate) => {
      return (
        candidate.name.toLowerCase().includes(search) ||
        candidate.path.toLowerCase().includes(search) ||
        (candidate.remoteUrl?.toLowerCase().includes(search) ?? false)
      );
    });
  }, [importCandidates, importQuery]);
  const sortThreadsForSidebar = useCallback(
    (items: Thread[]) =>
      [...items].sort((a, b) => {
        const aPinned = Boolean(a.pinnedAt);
        const bPinned = Boolean(b.pinnedAt);
        if (aPinned !== bPinned) {
          return aPinned ? -1 : 1;
        }
        const aTs = Date.parse(a.updatedAt);
        const bTs = Date.parse(b.updatedAt);
        const aTime = Number.isFinite(aTs) ? aTs : 0;
        const bTime = Number.isFinite(bTs) ? bTs : 0;
        if (aTime !== bTime) {
          return bTime - aTime;
        }
        return a.title.localeCompare(b.title);
      }),
    []
  );
  const toRgba = useCallback((hexColor: string | null | undefined, alpha: number) => {
    const value = (hexColor ?? "").trim().replace(/^#/, "");
    if (!value) {
      return "";
    }
    const normalized =
      value.length === 3
        ? value
            .split("")
            .map((part) => `${part}${part}`)
            .join("")
        : value;
    if (!/^[0-9a-fA-F]{6}$/.test(normalized)) {
      return "";
    }
    const r = Number.parseInt(normalized.slice(0, 2), 16);
    const g = Number.parseInt(normalized.slice(2, 4), 16);
    const b = Number.parseInt(normalized.slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }, []);
  const getThreadRowStyle = useCallback(
    (thread: Thread, depth: number, active: boolean) => {
      const style: Record<string, string> = {};
      if (depth > 0) {
        style.marginLeft = `${depth * 14}px`;
      }
      if (!thread.color) {
        return Object.keys(style).length > 0 ? style : undefined;
      }
      style.backgroundColor = toRgba(thread.color, active ? 0.2 : 0.1);
      style.borderColor = toRgba(thread.color, active ? 0.35 : 0.22);
      return style;
    },
    [toRgba]
  );
  const getProjectRowStyle = useCallback(
    (project: Project, active: boolean) => ({
      backgroundColor: toRgba(project.color ?? "#64748b", active ? 0.14 : 0.08),
      borderColor: toRgba(project.color ?? "#64748b", active ? 0.34 : 0.18)
    }),
    [toRgba]
  );

  const threadBucketsByProjectId = useMemo(() => {
    const buckets = threads.reduce<Record<string, { active: Thread[]; archived: Thread[] }>>((acc, thread) => {
      const bucket = acc[thread.projectId] ?? (acc[thread.projectId] = { active: [], archived: [] });
      if (thread.archivedAt) {
        bucket.archived.push(thread);
      } else {
        bucket.active.push(thread);
      }
      return acc;
    }, {});
    Object.values(buckets).forEach((bucket) => {
      bucket.active = sortThreadsForSidebar(bucket.active);
      bucket.archived = sortThreadsForSidebar(bucket.archived);
    });
    return buckets;
  }, [threads, sortThreadsForSidebar]);
  const threadRowsByProjectId = useMemo(() => {
    const rows: Record<string, { active: Array<{ thread: Thread; depth: number }>; archived: Array<{ thread: Thread; depth: number }> }> = {};
    Object.entries(threadBucketsByProjectId).forEach(([projectId, bucket]) => {
      rows[projectId] = {
        active: flattenThreadRows(bucket.active),
        archived: flattenThreadRows(bucket.archived)
      };
    });
    return rows;
  }, [threadBucketsByProjectId]);
  const workspaceById = useMemo(
    () => Object.fromEntries(workspaces.map((workspace) => [workspace.id, workspace])) as Record<string, Workspace>,
    [workspaces]
  );
  const sortedProjectsInActiveWorkspace = useMemo(() => {
    const toTimestamp = (value: string) => {
      const ts = Date.parse(value);
      return Number.isFinite(ts) ? ts : 0;
    };
    const latestThreadUpdatedAtByProjectId = threads.reduce<Record<string, number>>((acc, thread) => {
      const ts = toTimestamp(thread.updatedAt);
      if (ts <= 0) {
        return acc;
      }
      const prev = acc[thread.projectId] ?? 0;
      if (ts > prev) {
        acc[thread.projectId] = ts;
      }
      return acc;
    }, {});

    return projects
      .filter((project) => !activeWorkspaceId || project.workspaceId === activeWorkspaceId)
      .sort((a, b) => {
        const aLatest = latestThreadUpdatedAtByProjectId[a.id] ?? toTimestamp(a.updatedAt);
        const bLatest = latestThreadUpdatedAtByProjectId[b.id] ?? toTimestamp(b.updatedAt);
        if (aLatest !== bLatest) {
          return bLatest - aLatest;
        }
        return a.name.localeCompare(b.name);
      });
  }, [projects, activeWorkspaceId, threads]);
  const projectsInActiveWorkspace = useMemo(
    () => sortedProjectsInActiveWorkspace.filter((project) => !project.archivedAt),
    [sortedProjectsInActiveWorkspace]
  );
  const archivedProjectsInActiveWorkspace = useMemo(
    () => sortedProjectsInActiveWorkspace.filter((project) => Boolean(project.archivedAt)),
    [sortedProjectsInActiveWorkspace]
  );
  const hasPendingSubagentReviewByThreadId = useMemo(() => {
    const next: Record<string, boolean> = {};
    Object.entries(orchestrationRunsByParentId).forEach(([threadId, runs]) => {
      next[threadId] = runs.some((run) => run.policy === "ask" && run.status === "proposed");
    });
    return next;
  }, [orchestrationRunsByParentId]);
  const workspaceThreadMetrics = useMemo(() => {
    const next: Record<string, { runningCount: number; reviewCount: number; finishedCount: number }> = {};
    threads.forEach((thread) => {
      const project = projectById[thread.projectId];
      if (!project?.workspaceId || project.archivedAt || thread.archivedAt) {
        return;
      }
      const metric = next[project.workspaceId] ?? { runningCount: 0, reviewCount: 0, finishedCount: 0 };
      if ((runStateByThreadId[thread.id] ?? "idle") === "running") {
        metric.runningCount += 1;
      }
      if (
        Boolean(threadAwaitingInputById[thread.id]) ||
        (pendingUserQuestionsByThreadId[thread.id]?.length ?? 0) > 0 ||
        Boolean(hasPendingSubagentReviewByThreadId[thread.id])
      ) {
        metric.reviewCount += 1;
      }
      if (Boolean(threadFinishedUnreadById[thread.id])) {
        metric.finishedCount += 1;
      }
      next[project.workspaceId] = metric;
    });
    return next;
  }, [
    hasPendingSubagentReviewByThreadId,
    pendingUserQuestionsByThreadId,
    projectById,
    runStateByThreadId,
    threadAwaitingInputById,
    threadFinishedUnreadById,
    threads
  ]);
  const workspaceHeaderItems = useMemo(() => {
    return workspaces.map((workspace) => {
      const metrics = workspaceThreadMetrics[workspace.id] ?? { runningCount: 0, reviewCount: 0, finishedCount: 0 };
      return {
        ...workspace,
        ...metrics
      };
    });
  }, [
    workspaces,
    workspaceThreadMetrics
  ]);
  const hasUserPromptInThread = useMemo(() => messages.some((message) => message.role === "user"), [messages]);
  const getThreadSidebarSummary = (thread: Thread) => threadSummaryById[thread.id] ?? suggestThreadSummary(thread.title);

  const playThreadCompletedSound = () => {
    const AudioContextCtor = window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextCtor) {
      return;
    }
    try {
      if (!completionAudioContextRef.current || completionAudioContextRef.current.state === "closed") {
        completionAudioContextRef.current = new AudioContextCtor();
      }
      const context = completionAudioContextRef.current;
      if (context.state === "suspended") {
        context.resume().catch(() => {});
      }
      const now = context.currentTime;
      const gain = context.createGain();
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(0.08, now + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.32);
      gain.connect(context.destination);

      const low = context.createOscillator();
      low.type = "triangle";
      low.frequency.setValueAtTime(660, now);
      low.connect(gain);
      low.start(now);
      low.stop(now + 0.16);

      const high = context.createOscillator();
      high.type = "triangle";
      high.frequency.setValueAtTime(880, now + 0.12);
      high.connect(gain);
      high.start(now + 0.12);
      high.stop(now + 0.32);
    } catch {
      // Ignore audio failures so run completion never breaks the UI.
    }
  };
  useEffect(() => {
    const resolveTooltipTarget = (value: EventTarget | null): HTMLElement | null => {
      if (!(value instanceof Element)) {
        return null;
      }
      return value.closest<HTMLElement>("[data-app-tooltip], [data-composer-tooltip]");
    };

    const handleMouseOver = (event: MouseEvent) => {
      const target = resolveTooltipTarget(event.target);
      if (!target) {
        return;
      }
      activateGlobalTooltip(target, TOOLTIP_HOVER_DELAY_MS);
    };
    const handleMouseOut = (event: MouseEvent) => {
      const currentTarget = tooltipTargetRef.current;
      if (!currentTarget) {
        return;
      }
      const relatedTarget = event.relatedTarget;
      if (relatedTarget instanceof Node && currentTarget.contains(relatedTarget)) {
        return;
      }
      const nextTarget = resolveTooltipTarget(relatedTarget);
      if (nextTarget) {
        activateGlobalTooltip(nextTarget);
        return;
      }
      clearGlobalTooltip();
    };
    const handleFocusIn = (event: FocusEvent) => {
      activateGlobalTooltip(resolveTooltipTarget(event.target));
    };
    const handleFocusOut = (event: FocusEvent) => {
      const currentTarget = tooltipTargetRef.current;
      if (!currentTarget) {
        return;
      }
      const relatedTarget = event.relatedTarget;
      if (relatedTarget instanceof Node && currentTarget.contains(relatedTarget)) {
        return;
      }
      const nextTarget = resolveTooltipTarget(relatedTarget);
      if (nextTarget) {
        activateGlobalTooltip(nextTarget);
        return;
      }
      clearGlobalTooltip();
    };

    document.addEventListener("mouseover", handleMouseOver);
    document.addEventListener("mouseout", handleMouseOut);
    document.addEventListener("focusin", handleFocusIn);
    document.addEventListener("focusout", handleFocusOut);
    document.addEventListener("scroll", scheduleTooltipPositionUpdate, { capture: true, passive: true });
    window.addEventListener("resize", scheduleTooltipPositionUpdate);
    window.addEventListener("blur", clearGlobalTooltip);
    return () => {
      document.removeEventListener("mouseover", handleMouseOver);
      document.removeEventListener("mouseout", handleMouseOut);
      document.removeEventListener("focusin", handleFocusIn);
      document.removeEventListener("focusout", handleFocusOut);
      document.removeEventListener("scroll", scheduleTooltipPositionUpdate, true);
      window.removeEventListener("resize", scheduleTooltipPositionUpdate);
      window.removeEventListener("blur", clearGlobalTooltip);
      if (tooltipAnimationFrameRef.current !== null) {
        window.cancelAnimationFrame(tooltipAnimationFrameRef.current);
        tooltipAnimationFrameRef.current = null;
      }
      clearPendingTooltipHover();
    };
  }, [activateGlobalTooltip, clearGlobalTooltip, clearPendingTooltipHover, scheduleTooltipPositionUpdate]);
  const flashCompletedThread = (threadId: string) => {
    setThreadCompletionFlashById((prev) => ({ ...prev, [threadId]: true }));
    setThreadFinishedUnreadById((prev) => ({ ...prev, [threadId]: true }));
  };

  const clearCompletedThreadFlash = (threadId: string) => {
    setThreadCompletionFlashById((prev) => {
      if (!prev[threadId]) {
        return prev;
      }
      const next = { ...prev };
      delete next[threadId];
      return next;
    });
  };

  const clearFinishedUnreadThread = (threadId: string) => {
    setThreadFinishedUnreadById((prev) => {
      if (!prev[threadId]) {
        return prev;
      }
      const next = { ...prev };
      delete next[threadId];
      return next;
    });
  };

  const activateThreadFromSidebar = (projectId: string, threadId: string) => {
    setActiveProjectId(projectId);
    setActiveWorkspaceId(projects.find((project) => project.id === projectId)?.workspaceId ?? null);
    setActiveThreadId(threadId);
    clearCompletedThreadFlash(threadId);
    clearFinishedUnreadThread(threadId);
  };

  const playThreadNeedsInputSound = () => {
    const AudioContextCtor = window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextCtor) {
      return;
    }
    try {
      if (!completionAudioContextRef.current || completionAudioContextRef.current.state === "closed") {
        completionAudioContextRef.current = new AudioContextCtor();
      }
      const context = completionAudioContextRef.current;
      if (context.state === "suspended") {
        context.resume().catch(() => {});
      }
      const now = context.currentTime;
      const gain = context.createGain();
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(0.06, now + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.24);
      gain.connect(context.destination);

      const low = context.createOscillator();
      low.type = "sine";
      low.frequency.setValueAtTime(520, now);
      low.connect(gain);
      low.start(now);
      low.stop(now + 0.1);

      const high = context.createOscillator();
      high.type = "sine";
      high.frequency.setValueAtTime(740, now + 0.1);
      high.connect(gain);
      high.start(now + 0.1);
      high.stop(now + 0.24);
    } catch {
      // Ignore audio failures so UI notifications remain non-blocking.
    }
  };

  const loadWorkspaces = async () => {
    const allWorkspaces = await api.workspaces.list();
    setWorkspaces(allWorkspaces);
    const validIds = new Set(allWorkspaces.map((workspace) => workspace.id));
    const storedWorkspaceId = readStoredActiveWorkspaceId();
    if (activeWorkspaceId && validIds.has(activeWorkspaceId)) {
      return { allWorkspaces, selectedWorkspaceId: activeWorkspaceId };
    }
    if (storedWorkspaceId && validIds.has(storedWorkspaceId)) {
      setActiveWorkspaceId(storedWorkspaceId);
      return { allWorkspaces, selectedWorkspaceId: storedWorkspaceId };
    }
    const fallbackWorkspaceId = allWorkspaces[0]?.id ?? null;
    setActiveWorkspaceId(fallbackWorkspaceId);
    return { allWorkspaces, selectedWorkspaceId: fallbackWorkspaceId };
  };

  const loadProjects = async (workspaceIdOverride?: string | null) => {
    const allProjects = await api.projects.list({ includeArchived: true });
    setProjects(allProjects);
    setHasLoadedProjectsOnce(true);

    const activeStillExists = activeProjectId
      ? allProjects.some((project) => project.id === activeProjectId && !project.archivedAt)
      : false;
    if (activeStillExists) {
      return;
    }

    const storedProjectId = readStoredActiveProjectId();
    if (storedProjectId && allProjects.some((project) => project.id === storedProjectId && !project.archivedAt)) {
      setActiveProjectId(storedProjectId);
      return;
    }

    const visibleProjects = allProjects.filter((project) => !project.archivedAt);
    const workspaceId = workspaceIdOverride ?? activeWorkspaceId;
    const projectsInWorkspace = workspaceId
      ? visibleProjects.filter((project) => project.workspaceId === workspaceId)
      : visibleProjects;
    setActiveProjectId(projectsInWorkspace[0]?.id ?? visibleProjects[0]?.id ?? null);
  };

  const loadThreads = async () => {
    const data = await api.threads.list({ includeArchived: true });
    const sortedThreads = sortThreadsForSidebar(data);
    const threadIds = sortedThreads.map((thread) => thread.id);
    setThreads(sortedThreads);
    await Promise.all(
      sortedThreads
        .filter((thread) => harnessSupports((thread.harnessId ?? thread.provider) as HarnessId, "subthreads"))
        .map((thread) =>
          loadOrchestrationRuns(thread.id).catch((error) => {
          setLogs((prev) => [...prev, `Load orchestration failed: ${String(error)}`]);
          })
        )
    );
    const threadIdSet = new Set(threadIds);
    setOrchestrationRunsByParentId((prev) =>
      Object.fromEntries(Object.entries(prev).filter(([threadId]) => threadIdSet.has(threadId)))
    );

    if (activeThreadId && !sortedThreads.some((thread) => thread.id === activeThreadId)) {
      if (isCodeWindow) {
        setActiveThreadId(null);
        return;
      }
      const fallbackThread = sortedThreads[0] ?? null;
      setActiveThreadId(fallbackThread?.id ?? null);
      if (fallbackThread) {
        setActiveProjectId((prev) => (prev === fallbackThread.projectId ? prev : fallbackThread.projectId));
      }
      return;
    }

    if (!activeThreadId && sortedThreads.length > 0) {
      if (isCodeWindow && activeProjectId) {
        const threadForProject = sortedThreads.find(
          (thread) => thread.projectId === activeProjectId && !projectById[thread.projectId]?.archivedAt
        );
        setActiveThreadId(threadForProject?.id ?? null);
        return;
      }
      if (activeWorkspaceId) {
        const workspaceProjectIds = new Set(
          projects.filter((project) => project.workspaceId === activeWorkspaceId && !project.archivedAt).map((project) => project.id)
        );
        const workspaceThread = sortedThreads.find((thread) => workspaceProjectIds.has(thread.projectId));
        if (workspaceThread) {
          setActiveProjectId((prev) => (prev === workspaceThread.projectId ? prev : workspaceThread.projectId));
          setActiveThreadId(workspaceThread.id);
          return;
        }
      }
      const fallbackThread = sortedThreads.find((thread) => !projectById[thread.projectId]?.archivedAt) ?? null;
      if (!fallbackThread) {
        setActiveThreadId(null);
        return;
      }
      setActiveProjectId((prev) => (prev === fallbackThread.projectId ? prev : fallbackThread.projectId));
      setActiveThreadId(fallbackThread.id);
    }
  };

  const loadProjectsAndThreadsFlightRef = useRef<Promise<void> | null>(null);
  const loadProjectsAndThreads = useCallback(() => {
    if (loadProjectsAndThreadsFlightRef.current) {
      return loadProjectsAndThreadsFlightRef.current;
    }
    const next = (async () => {
      await Promise.all([loadProjects(), loadThreads()]);
    })();
    loadProjectsAndThreadsFlightRef.current = next.finally(() => {
      loadProjectsAndThreadsFlightRef.current = null;
    }) as Promise<void>;
    return loadProjectsAndThreadsFlightRef.current;
  }, [loadProjects, loadThreads]);

  const loadSettings = async () => {
    const current = await api.settings.get();
    applySettings(current);
    setAppSettingsInitialDraft({
      settings: current,
      composerOptions: getHarnessOptionsFromSettings(current, current.defaultHarnessId ?? "codex"),
      settingsEnvText: envVarsToText(current.envVars),
      settingsTab: "general"
    });
    await loadAppSkills();
  };

  const applySettings = (next: AppSettings) => {
    setSettings(next);
    setComposerOptions((prev) => ({
      ...getHarnessOptionsFromSettings(next, activeThread?.harnessId ?? next.defaultHarnessId ?? "codex"),
      ...prev
    }));
  };

  const loadOrchestrationRuns = async (parentThreadId: string) => {
    const previousRunIds = new Set((orchestrationRunsByParentId[parentThreadId] ?? []).map((run) => run.id));
    const runs = await api.orchestration.listRuns({ parentThreadId });
    setOrchestrationRunsByParentId((prev) => ({ ...prev, [parentThreadId]: runs }));
    const currentRunIds = new Set(runs.map((run) => run.id));
    setOrchestrationChildrenByRunId((prev) => {
      const next = { ...prev };
      previousRunIds.forEach((runId) => {
        if (!currentRunIds.has(runId)) {
          delete next[runId];
        }
      });
      return next;
    });
    if (runs.length === 0) {
      return;
    }

    const payloads = await Promise.all(runs.map((run) => api.orchestration.getRun({ runId: run.id })));
    setOrchestrationChildrenByRunId((prev) => {
      const next = { ...prev };
      payloads.forEach((payload) => {
        if (!payload) {
          return;
        }
        next[payload.run.id] = payload.children;
      });
      return next;
    });
  };

  const loadSystemTerminals = async () => {
    const terminals = await api.projects.listSystemTerminals();
    setSystemTerminals(terminals);
  };

  const loadInstallerStatus = async () => {
    const status = await api.installer.doctor();
    setInstallStatus(status);
  };

  const loadCodexAuthStatus = async () => {
    const status = await api.installer.getCodexAuthStatus();
    setCodexAuthStatus(status);
    if (status.authenticated) {
      setIsCodexAuthCardDismissed(false);
    }
    return status;
  };

  const loadOpenCodeAuthStatus = async (binaryOverride = settings.harnessSettings.opencode?.binaryOverride) => {
    const status = await api.installer.getOpenCodeAuthStatus({ binaryOverride });
    setOpenCodeAuthStatus(status);
    return status;
  };

  const isCodexUnauthenticatedError = (payload: string) => {
    const text = payload.toLowerCase();
    return (
      text.includes("401 unauthorized") &&
      (text.includes("missing bearer") ||
        text.includes("missing bearer or basic authentication") ||
        text.includes("authentication"))
    );
  };

  const loadProjectSettings = async (projectId: string) => {
    const settingsForProject = await api.projectSettings.get({ projectId });
    setProjectSettingsById((prev) => ({
      ...prev,
      [projectId]: settingsForProject
    }));
    if (settingsForProject.lastDetectedPreviewUrl) {
      setProjectPreviewUrlById((prev) => ({
        ...prev,
        [projectId]: settingsForProject.lastDetectedPreviewUrl ?? ""
      }));
    }
    return settingsForProject;
  };

  const loadAppSkills = async () => {
    const skills = await api.skills.list();
    setAppSkills(skills.filter((skill) => skill.scope === "user" || skill.scope === "system" || skill.scope === "admin"));
    return skills;
  };

  const loadProjectSkills = async (projectId: string) => {
    const skills = await api.skills.list({ projectId });
    setSkillsByProjectId((prev) => ({
      ...prev,
      [projectId]: skills
    }));
    return skills;
  };

  const loadProjectTerminalState = async (projectId: string) => {
    const state = await api.projectTerminal.getState({ projectId });
    const nextState = applyDismissedTerminalErrors(projectId, state);
    setProjectTerminalById((prev) => ({
      ...prev,
      [projectId]: nextState
    }));
    return nextState;
  };

  const loadGitSnapshot = async (projectId: string) => {
    const snapshot = await api.git.getSnapshot({ projectId });
    setGitStateByProjectId((prev) => ({
      ...prev,
      [projectId]: snapshot.state
    }));
    setGitOutgoingCommitsByProjectId((prev) => ({
      ...prev,
      [projectId]: snapshot.outgoingCommits
    }));
    setGitIncomingCommitsByProjectId((prev) => ({
      ...prev,
      [projectId]: snapshot.incomingCommits
    }));
    return snapshot;
  };

  const loadGitState = async (projectId: string) => {
    const snapshot = await loadGitSnapshot(projectId);
    return snapshot.state;
  };

  const selectGitPath = (projectId: string, path?: string) => {
    setGitSelectedPathByProjectId((prev) => ({
      ...prev,
      [projectId]: path ?? null
    }));
  };

  const loadGitOutgoingCommits = async (projectId: string) => {
    const snapshot = await loadGitSnapshot(projectId);
    return snapshot.outgoingCommits;
  };

  const loadGitIncomingCommits = async (projectId: string) => {
    const snapshot = await loadGitSnapshot(projectId);
    return snapshot.incomingCommits;
  };

  const loadGitSharedHistory = async (projectId: string, limit = 120) => {
    setGitSharedHistoryLoadingByProjectId((prev) => ({
      ...prev,
      [projectId]: true
    }));
    try {
      const commits = await api.git.getSharedHistory({ projectId, limit });
      setGitSharedHistoryByProjectId((prev) => ({
        ...prev,
        [projectId]: commits
      }));
      return commits;
    } finally {
      setGitSharedHistoryLoadingByProjectId((prev) => ({
        ...prev,
        [projectId]: false
      }));
    }
  };
  const addImageFiles = async (files: File[]) => {
    const imageFiles = files.filter((file) => file.type.startsWith("image/"));
    if (imageFiles.length === 0) {
      return;
    }

    const availableSlots = Math.max(0, MAX_ATTACHMENTS - composerAttachments.length);
    if (availableSlots === 0) {
      setLogs((prev) => [...prev, `Attachment limit reached (${MAX_ATTACHMENTS}).`]);
      return;
    }

    const picked = imageFiles.slice(0, availableSlots);
    if (picked.length < imageFiles.length) {
      setLogs((prev) => [...prev, `Only the first ${availableSlots} images were added.`]);
    }

    const additions: ComposerAttachment[] = [];
    for (const file of picked) {
      try {
        const dataUrl = await fileToDataUrl(file);
        additions.push({
          id: crypto.randomUUID(),
          name: file.name || `image-${Date.now()}.png`,
          mimeType: file.type || "image/png",
          size: file.size,
          dataUrl,
          previewUrl: URL.createObjectURL(file)
        });
      } catch (error) {
        setLogs((prev) => [...prev, `Image attach failed (${file.name}): ${String(error)}`]);
      }
    }

    if (additions.length === 0) {
      return;
    }

    setComposerAttachments((prev) => [...prev, ...additions].slice(0, MAX_ATTACHMENTS));
  };

  const removeAttachment = (id: string) => {
    setComposerAttachments((prev) => {
      const next = prev.filter((attachment) => attachment.id !== id);
      const removed = prev.find((attachment) => attachment.id === id);
      if (removed) {
        URL.revokeObjectURL(removed.previewUrl);
      }
      return next;
    });
  };

  const updateComposerText = (value: string) => {
    composerRef.current = value;
    const nextHasText = Boolean(value.trim());
    setComposerHasText((prev) => (prev === nextHasText ? prev : nextHasText));
  };

  const applyComposerText = (value: string, focus = false, caret: number | null = null) => {
    updateComposerText(value);
    const textarea = composerTextareaRef.current;
    if (!textarea) {
      return;
    }
    if (textarea.value !== value) {
      textarea.value = value;
    }
    if (focus) {
      textarea.focus();
    }
    if (typeof caret === "number") {
      textarea.setSelectionRange(caret, caret);
    }
  };

  const blobToDataUrl = (blob: Blob) =>
    new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result;
        if (typeof result === "string") {
          resolve(result);
          return;
        }
        reject(new Error("Failed to read audio blob."));
      };
      reader.onerror = () => reject(reader.error ?? new Error("Failed to read audio blob."));
      reader.readAsDataURL(blob);
    });

  const stopVoiceStream = () => {
    voiceStreamRef.current?.getTracks().forEach((track) => {
      track.stop();
    });
    voiceStreamRef.current = null;
  };

  const appendVoiceTranscriptToComposer = (text: string) => {
    const transcript = text.trim();
    if (!transcript) {
      return;
    }
    const currentValue = composerRef.current;
    const separator = currentValue.trim().length === 0 || /\s$/.test(currentValue) ? "" : " ";
    const nextValue = `${currentValue}${separator}${transcript}`;
    const nextCaret = nextValue.length;
    applyComposerText(nextValue, true, nextCaret);
    onComposerChange(nextValue, nextCaret);
    const threadId = activeThreadIdRef.current;
    if (threadId) {
      setComposerDraftByThreadId((prev) => ({
        ...prev,
        [threadId]: nextValue
      }));
    }
  };

  const stopVoiceRecording = () => {
    const recorder = voiceRecorderRef.current;
    if (!recorder || recorder.state === "inactive") {
      return;
    }
    recorder.stop();
  };

  const toggleVoiceRecording = async () => {
    if (!activeThreadIdRef.current || activeThreadSendPending || isVoiceTranscribing) {
      return;
    }

    if (isVoiceRecording) {
      stopVoiceRecording();
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      setLogs((prev) => [...prev, "Voice input unavailable: microphone capture is not supported in this environment."]);
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeTypeCandidates = ["audio/webm;codecs=opus", "audio/webm"];
      const preferredMimeType = mimeTypeCandidates.find((candidate) => MediaRecorder.isTypeSupported(candidate));
      const recorder = preferredMimeType ? new MediaRecorder(stream, { mimeType: preferredMimeType }) : new MediaRecorder(stream);
      voiceStreamRef.current = stream;
      voiceRecorderRef.current = recorder;
      voiceChunksRef.current = [];
      setIsVoiceRecording(true);

      recorder.ondataavailable = (event: BlobEvent) => {
        if (event.data.size > 0) {
          voiceChunksRef.current.push(event.data);
        }
      };

      recorder.onstop = () => {
        const chunks = voiceChunksRef.current;
        voiceChunksRef.current = [];
        setIsVoiceRecording(false);
        voiceRecorderRef.current = null;
        stopVoiceStream();
        if (chunks.length === 0) {
          return;
        }

        const transcribe = async () => {
          setIsVoiceTranscribing(true);
          try {
            const mimeType = recorder.mimeType || preferredMimeType || "audio/webm";
            const audioBlob = new Blob(chunks, { type: mimeType });
            const audioDataUrl = await blobToDataUrl(audioBlob);
            const result = await api.audio.transcribe({
              audioDataUrl,
              projectId: activeProjectId ?? undefined,
              model: "whisper-1"
            });
            appendVoiceTranscriptToComposer(result.text);
          } catch (error) {
            setLogs((prev) => [...prev, `Voice transcription failed: ${String(error)}`]);
          } finally {
            setIsVoiceTranscribing(false);
          }
        };

        transcribe().catch((error) => {
          setLogs((prev) => [...prev, `Voice transcription failed: ${String(error)}`]);
          setIsVoiceTranscribing(false);
        });
      };

      recorder.onerror = () => {
        setLogs((prev) => [...prev, "Voice recording failed."]);
        setIsVoiceRecording(false);
        voiceRecorderRef.current = null;
        stopVoiceStream();
      };

      recorder.start();
    } catch (error) {
      setLogs((prev) => [...prev, `Microphone access failed: ${String(error)}`]);
      setIsVoiceRecording(false);
      stopVoiceStream();
    }
  };

  const scheduleComposerResize = (textarea?: HTMLTextAreaElement | null) => {
    const target = textarea ?? composerTextareaRef.current;
    if (!target) {
      return;
    }
    if (composerResizeRafRef.current !== null) {
      window.cancelAnimationFrame(composerResizeRafRef.current);
    }
    composerResizeRafRef.current = window.requestAnimationFrame(() => {
      composerResizeRafRef.current = null;
      const minHeight = 56;
      const maxHeight = 140;
      target.style.height = "auto";
      const nextHeight = Math.min(Math.max(target.scrollHeight, minHeight), maxHeight);
      const heightCss = `${nextHeight}px`;
      if (target.style.height !== heightCss) {
        target.style.height = heightCss;
      }
      target.style.overflowY = target.scrollHeight > maxHeight ? "auto" : "hidden";
    });
  };

  useEffect(() => {
    activeThreadIdRef.current = activeThreadId;
  }, [activeThreadId]);

  useEffect(() => {
    threadsRef.current = threads;
  }, [threads]);

  useEffect(() => {
    const openThreadId = threadContextMenuThreadIdRef.current;
    if (!openThreadId) {
      return;
    }
    if (threads.some((thread) => thread.id === openThreadId)) {
      return;
    }
    if (threadContextMenuRef.current) {
      threadContextMenuRef.current.style.display = "none";
    }
    threadContextMenuThreadIdRef.current = null;
  }, [threads]);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", settings.theme ?? "midnight");
  }, [settings.theme]);

  useEffect(() => {
    if (!activeThreadId) {
      return;
    }
    if (!activeHarnessSupportsSubthreads) {
      return;
    }
    loadOrchestrationRuns(activeThreadId).catch((error) => {
      setLogs((prev) => [...prev, `Load orchestration failed: ${String(error)}`]);
    });
  }, [activeHarnessSupportsSubthreads, activeThreadId]);

  useEffect(() => {
    const harnessId = activeThread?.harnessId ?? settings.defaultHarnessId ?? "codex";
    setComposerOptions((prev) => ({
      ...getHarnessOptionsFromSettings(settings, harnessId),
      model: prev.model && harnessId === activeHarnessId ? prev.model : getHarnessOptionsFromSettings(settings, harnessId).model
    }));
  }, [activeThread?.id, activeThread?.harnessId, settings, activeHarnessId]);

  useEffect(() => {
    runStateByThreadIdRef.current = runStateByThreadId;
  }, [runStateByThreadId]);

  useEffect(() => {
    threadAwaitingInputByIdRef.current = threadAwaitingInputById;
  }, [threadAwaitingInputById]);

  useEffect(() => {
    pendingUserQuestionsByThreadIdRef.current = pendingUserQuestionsByThreadId;
  }, [pendingUserQuestionsByThreadId]);

  useEffect(() => {
    pendingUserInputRequestIdByThreadIdRef.current = pendingUserInputRequestIdByThreadId;
  }, [pendingUserInputRequestIdByThreadId]);

  useEffect(() => {
    queuedPromptsByThreadIdRef.current = queuedPromptsByThreadId;
  }, [queuedPromptsByThreadId]);

  useEffect(() => {
    attachmentsRef.current = composerAttachments;
  }, [composerAttachments]);

  useEffect(() => {
    const previousThreadId = previousActiveThreadIdRef.current;
    if (previousThreadId && previousThreadId !== activeThreadId) {
      const previousDraft = composerRef.current;
      setComposerDraftByThreadId((prev) => {
        if (prev[previousThreadId] === previousDraft) {
          return prev;
        }
        return {
          ...prev,
          [previousThreadId]: previousDraft
        };
      });
    }

    previousActiveThreadIdRef.current = activeThreadId;

    if (!activeThreadId) {
      applyComposerText("");
      setComposerMentionedFiles((prev) => (prev.length === 0 ? prev : []));
      setComposerMentionedSkills((prev) => (prev.length === 0 ? prev : []));
      setFileMention(null);
      setSkillMention(null);
      return;
    }
    applyComposerText(activeComposerDraft);
    const nextSkills = extractSkillsFromInput(activeComposerDraft, activeSkills).skills;
    setComposerMentionedSkills((prev) => (areSkillReferencesEqual(prev, nextSkills) ? prev : nextSkills));
    scheduleComposerResize();
  }, [activeThreadId, activeComposerDraft, activeSkills]);

  useEffect(() => {
    if (!activeThreadId) {
      return;
    }
    if (composerFocusRafRef.current !== null) {
      window.cancelAnimationFrame(composerFocusRafRef.current);
    }
    composerFocusRafRef.current = window.requestAnimationFrame(() => {
      composerFocusRafRef.current = null;
      composerTextareaRef.current?.focus();
    });

    return () => {
      if (composerFocusRafRef.current !== null) {
        window.cancelAnimationFrame(composerFocusRafRef.current);
        composerFocusRafRef.current = null;
      }
    };
  }, [activeThreadId]);

  useEffect(() => {
    const nextSkills = extractSkillsFromInput(composerRef.current, activeSkills).skills;
    setComposerMentionedSkills((prev) => (areSkillReferencesEqual(prev, nextSkills) ? prev : nextSkills));
  }, [activeSkills]);

  useEffect(() => {
    scheduleComposerResize();
    return () => {
      if (composerResizeRafRef.current !== null) {
        window.cancelAnimationFrame(composerResizeRafRef.current);
        composerResizeRafRef.current = null;
      }
    };
  }, [activeThreadId]);

  useEffect(
    () => () => {
      if (composerMentionRafRef.current !== null) {
        window.cancelAnimationFrame(composerMentionRafRef.current);
        composerMentionRafRef.current = null;
      }
      if (composerResizeRafRef.current !== null) {
        window.cancelAnimationFrame(composerResizeRafRef.current);
        composerResizeRafRef.current = null;
      }
      attachmentsRef.current.forEach((attachment) => {
        URL.revokeObjectURL(attachment.previewUrl);
      });
      completionAudioContextRef.current?.close().catch(() => {});
      if (voiceRecorderRef.current && voiceRecorderRef.current.state !== "inactive") {
        voiceRecorderRef.current.stop();
      }
      voiceRecorderRef.current = null;
      stopVoiceStream();
      voiceChunksRef.current = [];
    },
    []
  );

  const buildUserPromptContent = (input: string, attachments: PromptAttachment[]) => {
    if (attachments.length === 0) {
      return input;
    }
    return input;
  };

  const applyThreadHistoryPage = (
    threadId: string,
    page: ThreadEventsPage,
    mode: "replace" | "prepend"
  ) => {
    const { restoredActivity, restoredMessages } = parseHistoryBatch(page.events);

    if (mode === "replace") {
      setMessages(restoredMessages);
      setActivity(restoredActivity);
    } else {
      setMessages((prev) => {
        const seen = new Set(prev.map((entry) => entry.id));
        const older = restoredMessages.filter((entry) => !seen.has(entry.id));
        return older.length > 0 ? [...older, ...prev] : prev;
      });
      setActivity((prev) => {
        const seen = new Set(prev.map((entry) => entry.id));
        const older = restoredActivity.filter((entry) => !seen.has(entry.id));
        return older.length > 0 ? [...older, ...prev] : prev;
      });
    }

    setThreadHistoryCursorById((prev) => ({
      ...prev,
      [threadId]: page.nextBeforeStreamSeq
    }));
    setThreadHistoryHasMoreById((prev) => ({
      ...prev,
      [threadId]: page.hasMore
    }));
  };

  const loadOlderHistory = async (threadId: string) => {
    const isAlreadyLoading = threadHistoryLoadingById[threadId] ?? false;
    const hasMore = threadHistoryHasMoreById[threadId] ?? false;
    const cursor = threadHistoryCursorById[threadId];
    if (isAlreadyLoading || !hasMore || typeof cursor !== "number") {
      return;
    }

    const viewport = timelineViewportRef.current;
    if (viewport) {
      pendingHistoryScrollRestoreRef.current = {
        threadId,
        previousHeight: viewport.scrollHeight,
        previousTop: viewport.scrollTop
      };
    }

    setThreadHistoryLoadingById((prev) => ({
      ...prev,
      [threadId]: true
    }));

    try {
      const page = await api.threads.events({
        threadId,
        beforeStreamSeq: cursor,
        userPromptCount: HISTORY_USER_PROMPT_WINDOW
      });
      applyThreadHistoryPage(threadId, page, "prepend");
    } finally {
      setThreadHistoryLoadingById((prev) => ({
        ...prev,
        [threadId]: false
      }));
    }
  };

  const scrollTimelineToBottom = () => {
    const viewport = timelineViewportRef.current;
    if (!viewport) {
      return;
    }
    window.requestAnimationFrame(() => {
      viewport.scrollTop = viewport.scrollHeight;
    });
  };

  const appendLocalUserMessage = (threadId: string, input: string, attachments: PromptAttachment[]) => {
    const sentAt = new Date().toISOString();
    setThreads((prev) => bumpThreadToFrontById(prev, threadId, sentAt));
    if (activeThreadIdRef.current !== threadId) {
      return;
    }
    setMessages((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        threadId,
        role: "user",
        content: buildUserPromptContent(input, attachments),
        attachments,
        ts: sentAt,
        streamSeq: prev.length + 1
      }
    ]);
  };

  const dispatchPromptToThread = async (threadId: string, prompt: QueuedPrompt) => {
    const optionKey = codexOptionsKey(prompt.options);
    if (optionKey !== lastStartedOptionsKeyRef.current) {
      await api.sessions.start({ threadId, options: prompt.options });
      lastStartedOptionsKeyRef.current = optionKey;
    }

    await api.sessions.sendInput({
      threadId,
      input: prompt.input,
      options: prompt.options,
      attachments: prompt.attachments,
      skills: prompt.skills
    });

    setThreadAwaitingInputById((prev) => {
      if (!prev[threadId]) {
        return prev;
      }
      const next = { ...prev };
      delete next[threadId];
      threadAwaitingInputByIdRef.current = next;
      return next;
    });

    appendLocalUserMessage(threadId, prompt.input, prompt.attachments);
    setRunStateByThreadId((prev) => {
      const next = {
        ...prev,
        [threadId]: "running" as ThreadRunState
      };
      runStateByThreadIdRef.current = next;
      return next;
    });
  };

  const drainPromptQueueForThread = (threadId: string) => {
    if (queueProcessingThreadIdsRef.current.has(threadId)) {
      return;
    }
    if ((runStateByThreadIdRef.current[threadId] ?? "idle") === "running") {
      return;
    }
    const queued = queuedPromptsByThreadIdRef.current[threadId] ?? [];
    const nextPrompt = queued[0];
    if (!nextPrompt) {
      return;
    }
    queueProcessingThreadIdsRef.current.add(threadId);
    dispatchPromptToThread(threadId, nextPrompt)
      .then(() => {
        setQueuedPromptsByThreadId((prev) => {
          const items = prev[threadId] ?? [];
          if (items.length === 0) {
            return prev;
          }
          // Only remove the prompt we successfully dispatched.
          const nextItems =
            items[0]?.id === nextPrompt.id ? items.slice(1) : items.filter((item) => item.id !== nextPrompt.id);
          const next = { ...prev };
          if (nextItems.length === 0) {
            delete next[threadId];
          } else {
            next[threadId] = nextItems;
          }
          queuedPromptsByThreadIdRef.current = next;
          return next;
        });
      })
      .catch((error) => {
        setLogs((prev) => [...prev, `Queued send failed: ${String(error)}`]);
        setRunStateByThreadId((prev) => {
          const next = {
            ...prev,
            [threadId]: "idle" as ThreadRunState
          };
          runStateByThreadIdRef.current = next;
          return next;
        });
      })
      .finally(() => {
        queueProcessingThreadIdsRef.current.delete(threadId);
      });
  };

  const removeQueuedPrompt = (threadId: string, promptId: string) => {
    setQueuedPromptsByThreadId((prev) => {
      const items = prev[threadId] ?? [];
      if (items.length === 0) {
        return prev;
      }
      const nextItems = items.filter((item) => item.id !== promptId);
      if (nextItems.length === items.length) {
        return prev;
      }
      const next = { ...prev };
      if (nextItems.length === 0) {
        delete next[threadId];
      } else {
        next[threadId] = nextItems;
      }
      queuedPromptsByThreadIdRef.current = next;
      return next;
    });
  };

  const cancelQueuedPrompt = (threadId: string, promptId: string) => {
    removeQueuedPrompt(threadId, promptId);
  };

  const steerQueuedPrompt = async (threadId: string, prompt: QueuedPrompt) => {
    if ((runStateByThreadIdRef.current[threadId] ?? "idle") !== "running") {
      setLogs((prev) => [...prev, "Steer is only available while a run is active."]);
      return;
    }
    const result = await api.sessions.steer({
      threadId,
      input: prompt.input,
      attachments: prompt.attachments,
      skills: prompt.skills
    });
    if (!result.ok) {
      setLogs((prev) => [...prev, "Queued steer failed."]);
      return;
    }
    appendLocalUserMessage(threadId, prompt.input, prompt.attachments);
    removeQueuedPrompt(threadId, prompt.id);
  };

  useEffect(() => {
    const initialize = async () => {
      const workspaceLoad = loadWorkspaces();
      const uiLoad = Promise.all([loadSettings(), loadSystemTerminals(), loadInstallerStatus(), loadCodexAuthStatus(), loadOpenCodeAuthStatus(), checkUpdatesOnLaunch()]);
      const { selectedWorkspaceId } = await workspaceLoad;
      const threadsAndProjectsLoad = Promise.all([loadProjects(selectedWorkspaceId), loadThreads()]);
      await Promise.all([workspaceLoad, uiLoad, threadsAndProjectsLoad]);
    };

    initialize().catch((error) => {
      setLogs((prev) => [...prev, `Init failed: ${String(error)}`]);
    });
  }, []);

  useEffect(() => {
    const unsubscribe = api.settings.onChanged((next) => {
      applySettings(next);
      void loadSystemTerminals();
    });

    return () => {
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    loadOpenCodeAuthStatus().catch((error) => {
      setLogs((prev) => [...prev, `OpenCode auth status refresh failed: ${String(error)}`]);
    });
  }, [settings.harnessSettings.opencode?.binaryOverride]);

  useEffect(() => {
    const unsubscribe = api.projects.onSetupEvent((event) => {
      setProjectSetupById((prev) => ({
        ...prev,
        [event.projectId]: event
      }));

      if (event.status === "completed") {
        const existingTimeout = projectSetupClearTimeoutByIdRef.current[event.projectId];
        if (existingTimeout) {
          window.clearTimeout(existingTimeout);
        }
        projectSetupClearTimeoutByIdRef.current[event.projectId] = window.setTimeout(() => {
          setProjectSetupById((prev) => {
            const current = prev[event.projectId];
            if (!current || current.status !== "completed") {
              return prev;
            }
            const next = { ...prev };
            delete next[event.projectId];
            return next;
          });
          delete projectSetupClearTimeoutByIdRef.current[event.projectId];
        }, 900);
      }

      if (event.status === "failed") {
        setLogs((prev) => [...prev, `Project setup failed (${event.projectId}): ${event.message}`]);
      }
    });

    return () => {
      unsubscribe();
      Object.values(projectSetupClearTimeoutByIdRef.current).forEach((timeoutId) => window.clearTimeout(timeoutId));
      projectSetupClearTimeoutByIdRef.current = {};
    };
  }, []);

  useEffect(() => {
    writeStoredActiveProjectId(activeProjectId);
  }, [activeProjectId]);

  useEffect(() => {
    writeStoredActiveWorkspaceId(activeWorkspaceId);
  }, [activeWorkspaceId]);

  useEffect(() => {
    if (!hasLoadedProjectsOnce) {
      return;
    }
    writeStoredProjectListOpenById(projectListOpenById);
  }, [hasLoadedProjectsOnce, projectListOpenById]);

  useEffect(() => {
    if (!hasLoadedProjectsOnce) {
      return;
    }
    const validProjectIds = new Set(projects.map((project) => project.id));
    setProjectListOpenById((prev) => {
      const next = Object.fromEntries(Object.entries(prev).filter(([projectId]) => validProjectIds.has(projectId)));
      const prevKeys = Object.keys(prev);
      const nextKeys = Object.keys(next);
      const unchanged =
        prevKeys.length === nextKeys.length && prevKeys.every((projectId) => Object.is(prev[projectId], next[projectId]));
      return unchanged ? prev : next;
    });
  }, [hasLoadedProjectsOnce, projects]);

  useEffect(() => {
    if (!activeProjectId) {
      return;
    }
    const project = projects.find((item) => item.id === activeProjectId);
    if (!project) {
      return;
    }
    if (activeWorkspaceId !== project.workspaceId) {
      setActiveWorkspaceId(project.workspaceId);
    }
  }, [activeProjectId, projects, activeWorkspaceId]);

  useEffect(() => {
    try {
      window.localStorage.setItem(THREAD_SUMMARY_STORAGE_KEY, JSON.stringify(threadSummaryById));
    } catch {
      // Ignore storage failures (private mode / disabled storage).
    }
  }, [threadSummaryById]);

  useEffect(() => {
    let stdoutFlushTimer: number | null = null;
    let bufferedStdoutMessages: Array<{ threadId: string; content: string; ts: string }> = [];
    let bufferedTerminalLines: string[] = [];
    let bufferedActivityEntries: ActivityEntry[] = [];

    const flushStdoutBuffers = () => {
      if (stdoutFlushTimer) {
        window.clearTimeout(stdoutFlushTimer);
        stdoutFlushTimer = null;
      }

      const activeThreadId = activeThreadIdRef.current;
      if (!activeThreadId) {
        bufferedStdoutMessages = [];
        bufferedTerminalLines = [];
        bufferedActivityEntries = [];
        return;
      }

      if (bufferedActivityEntries.length > 0) {
        const pendingActivity = bufferedActivityEntries;
        bufferedActivityEntries = [];
        setActivity((prev) => pendingActivity.reduce(mergeActivityEntry, prev));
      }

      const pendingMessages = bufferedStdoutMessages.filter((item) => item.threadId === activeThreadId);
      bufferedStdoutMessages = [];
      if (pendingMessages.length > 0) {
        setMessages((prev) => {
          const nextMessages = pendingMessages.map((item, index) => ({
            id: crypto.randomUUID(),
            threadId: item.threadId,
            role: "assistant" as const,
            content: item.content,
            ts: item.ts,
            streamSeq: prev.length + index + 1
          }));
          return [...prev, ...nextMessages];
        });
      }

      if (SHOW_TERMINAL && bufferedTerminalLines.length > 0) {
        const lines = bufferedTerminalLines;
        bufferedTerminalLines = [];
        setTerminalLines((prev) => [...prev.slice(-400), ...lines].slice(-400));
      } else {
        bufferedTerminalLines = [];
      }
    };

    const scheduleStdoutFlush = () => {
      if (stdoutFlushTimer) {
        return;
      }
      stdoutFlushTimer = window.setTimeout(() => {
        flushStdoutBuffers();
      }, 60);
    };

    const unsubscribe = api.sessions.onEvent((event: SessionEvent) => {
      const data = asRecord(event.data);
      const phase = asString(data?.phase);
      const category = asString(data?.category);
      const status = asString(data?.status);
      if (category?.startsWith("orchestration_")) {
        loadOrchestrationRuns(event.threadId).catch((error) => {
          setLogs((prev) => [...prev, `Load orchestration failed: ${String(error)}`]);
        });
      }
      const requestId = asString(data?.requestId) ?? "";
      const requestedQuestions = normalizePendingUserQuestions(data?.questions);

      const marksAwaitingInput =
        category === "user_input_request" && (phase === "awaiting_user_input" || status === "in_progress" || !status);
      const clearsAwaitingInput =
        (category === "user_input_request" && (phase === "completed" || status === "completed" || status === "failed")) ||
        phase === "ready" ||
        phase === "stopped";

      if (marksAwaitingInput) {
        const wasAwaiting = Boolean(threadAwaitingInputByIdRef.current[event.threadId]);
        if (!wasAwaiting) {
          setThreadAwaitingInputById((prev) => {
            if (prev[event.threadId]) {
              return prev;
            }
            const next = {
              ...prev,
              [event.threadId]: true
            };
            threadAwaitingInputByIdRef.current = next;
            return next;
          });
          if (event.threadId !== activeThreadIdRef.current) {
            setLogs((prev) => [...prev, `Thread awaiting input: ${event.threadId}`]);
            playThreadNeedsInputSound();
          }
        }
        if (requestedQuestions.length > 0) {
          setPendingUserQuestionsByThreadId((prev) => {
            const existing = prev[event.threadId] ?? [];
            const mergedQuestions = mergePendingQuestions(existing, requestedQuestions);
            const unchanged =
              existing.length === mergedQuestions.length &&
              existing.every((question, index) => {
                const next = mergedQuestions[index];
                return Boolean(next && pendingQuestionEquals(question, next));
              });
            if (unchanged) {
              return prev;
            }
            const next = {
              ...prev,
              [event.threadId]: mergedQuestions
            };
            pendingUserQuestionsByThreadIdRef.current = next;
            return next;
          });
        }
        if (requestId) {
          setPendingUserInputRequestIdByThreadId((prev) => {
            if (prev[event.threadId] === requestId) {
              return prev;
            }
            const next = {
              ...prev,
              [event.threadId]: requestId
            };
            pendingUserInputRequestIdByThreadIdRef.current = next;
            return next;
          });
        }
      } else if (
        clearsAwaitingInput &&
        (threadAwaitingInputByIdRef.current[event.threadId] ||
          pendingUserQuestionsByThreadIdRef.current[event.threadId] ||
          pendingUserInputRequestIdByThreadIdRef.current[event.threadId])
      ) {
        setThreadAwaitingInputById((prev) => {
          if (!prev[event.threadId]) {
            return prev;
          }
          const next = { ...prev };
          delete next[event.threadId];
          threadAwaitingInputByIdRef.current = next;
          return next;
        });
        setPendingUserQuestionsByThreadId((prev) => {
          if (!prev[event.threadId]) {
            return prev;
          }
          const next = { ...prev };
          delete next[event.threadId];
          pendingUserQuestionsByThreadIdRef.current = next;
          return next;
        });
        setPendingUserInputRequestIdByThreadId((prev) => {
          if (!prev[event.threadId]) {
            return prev;
          }
          const next = { ...prev };
          delete next[event.threadId];
          pendingUserInputRequestIdByThreadIdRef.current = next;
          return next;
        });
        setUserQuestionAnswersByThreadId((prev) => {
          if (!prev[event.threadId]) {
            return prev;
          }
          const next = { ...prev };
          delete next[event.threadId];
          return next;
        });
      }

      let nextThreadRunState: ThreadRunState | null = null;
      if (phase === "running") {
        nextThreadRunState = "running";
      } else if (phase === "completed") {
        nextThreadRunState = "completed";
      } else if (phase === "failed") {
        nextThreadRunState = "failed";
      } else if (phase === "ready" || phase === "stopped") {
        nextThreadRunState = "idle";
      }

      const previousThreadRunState = runStateByThreadIdRef.current[event.threadId] ?? "idle";
      if (nextThreadRunState && previousThreadRunState !== nextThreadRunState) {
        if (nextThreadRunState === "running") {
          clearFinishedUnreadThread(event.threadId);
        }
        setRunStateByThreadId((prev) => {
          const current = prev[event.threadId] ?? "idle";
          if (current === nextThreadRunState) {
            return prev;
          }
          const next = {
            ...prev,
            [event.threadId]: nextThreadRunState
          };
          runStateByThreadIdRef.current = next;
          return next;
        });
        if (previousThreadRunState === "running" && nextThreadRunState === "completed") {
          flashCompletedThread(event.threadId);
          if (event.threadId === activeThreadIdRef.current) {
            clearFinishedUnreadThread(event.threadId);
          }
          playThreadCompletedSound();
        }
        if (previousThreadRunState === "running" && nextThreadRunState !== "running") {
          drainPromptQueueForThread(event.threadId);
        }
      }

      const authRequiredFromData = Boolean(data?.authRequired);
      const authRequiredFromError = event.type === "stderr" && isCodexUnauthenticatedError(event.payload);
      if (authRequiredFromData || authRequiredFromError) {
        setCodexAuthStatus((prev) => ({
          authenticated: false,
          requiresOpenaiAuth: true,
          accountType: prev?.accountType,
          email: prev?.email,
          planType: prev?.planType,
          message: "Codex authentication is required."
        }));
        setIsCodexAuthCardDismissed(false);
        loadCodexAuthStatus().catch((error) => {
          setLogs((prev) => [...prev, `Codex auth status refresh failed: ${String(error)}`]);
        });
      }

      if (event.threadId !== activeThreadIdRef.current) {
        return;
      }

      const entry = eventToActivityEntry(event);
      if (entry) {
        bufferedActivityEntries.push(entry);
        scheduleStdoutFlush();
      }

      if (event.type === "progress" && category === "assistant_draft") {
        // Draft events are captured as timeline entries; no separate modal/draft panel state.
        return;
      }

      if (event.type === "stdout") {
        const cleaned = sanitizeForDisplay(event.payload);
        if (!cleaned) {
          return;
        }

        if (SHOW_TERMINAL) {
          bufferedTerminalLines.push(cleaned);
        }

        bufferedStdoutMessages.push({
          threadId: event.threadId,
          content: cleaned,
          ts: event.ts
        });
        scheduleStdoutFlush();
        return;
      }

      if (event.type === "stderr") {
        setLogs((prev) => [...prev, event.payload]);
        return;
      }

      if (SHOW_TERMINAL && (event.type === "status" || event.type === "exit" || event.type === "progress")) {
        setTerminalLines((prev) => [...prev.slice(-400), `[${event.type}] ${event.payload}`]);
      }
    });

    return () => {
      flushStdoutBuffers();
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!SHOW_TERMINAL) {
      return;
    }

    if (terminalInstanceRef.current) {
      return;
    }

    const container = terminalOutputRef.current;
    if (!container) {
      return;
    }

    const terminal = new XtermTerminal({
      convertEol: true,
      cursorBlink: false,
      fontFamily: '"Cascadia Mono", "Fira Code", Consolas, "Courier New", monospace',
      fontSize: 12,
      lineHeight: 1.3,
      scrollback: 2000,
      theme: {
        background: "#00000000",
        foreground: "#cbd5e1",
        cursor: "#94a3b8",
        selectionBackground: "#33415580"
      }
    });
    const fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);
    terminal.loadAddon(
      new WebLinksAddon((_event, uri) => {
        window.open(uri, "_blank", "noopener,noreferrer");
      })
    );
    terminal.open(container);
    fitAddon.fit();

    terminalInstanceRef.current = terminal;
    terminalFitAddonRef.current = fitAddon;
    terminalRenderedOutputRef.current = "";

    const initialOutput = terminalLines.join("");
    if (initialOutput) {
      terminal.write(initialOutput);
      terminalRenderedOutputRef.current = initialOutput;
      terminal.scrollToBottom();
    } else {
      terminal.writeln("No terminal output yet.");
    }

    const onResize = () => {
      terminalFitAddonRef.current?.fit();
    };
    window.addEventListener("resize", onResize);

    return () => {
      window.removeEventListener("resize", onResize);
      terminal.dispose();
      terminalInstanceRef.current = null;
      terminalFitAddonRef.current = null;
      terminalRenderedOutputRef.current = "";
    };
  }, []);

  useEffect(() => {
    if (!SHOW_TERMINAL) {
      return;
    }

    const terminal = terminalInstanceRef.current;
    if (!terminal) {
      return;
    }

    const nextOutput = terminalLines.join("");
    const previousOutput = terminalRenderedOutputRef.current;

    if (!nextOutput) {
      terminal.reset();
      terminal.writeln("No terminal output yet.");
      terminalRenderedOutputRef.current = "";
      terminalFitAddonRef.current?.fit();
      return;
    }

    if (previousOutput && nextOutput.startsWith(previousOutput)) {
      const delta = nextOutput.slice(previousOutput.length);
      if (delta) {
        terminal.write(delta);
      }
    } else if (previousOutput !== nextOutput) {
      terminal.reset();
      terminal.write(nextOutput);
    }

    terminalRenderedOutputRef.current = nextOutput;
    terminal.scrollToBottom();
  }, [terminalLines]);

  useEffect(() => {
    const threadIds = new Set(threads.map((thread) => thread.id));
    setRunStateByThreadId((prev) => {
      const nextEntries = Object.entries(prev).filter(([threadId]) => threadIds.has(threadId));
      if (nextEntries.length === Object.keys(prev).length) {
        return prev;
      }
      const next = Object.fromEntries(nextEntries) as Record<string, ThreadRunState>;
      runStateByThreadIdRef.current = next;
      return next;
    });
    setComposerDraftByThreadId((prev) => {
      const nextEntries = Object.entries(prev).filter(([threadId]) => threadIds.has(threadId));
      if (nextEntries.length === Object.keys(prev).length) {
        return prev;
      }
      return Object.fromEntries(nextEntries) as Record<string, string>;
    });
    setQueuedPromptsByThreadId((prev) => {
      const nextEntries = Object.entries(prev).filter(([threadId]) => threadIds.has(threadId));
      if (nextEntries.length === Object.keys(prev).length) {
        return prev;
      }
      const next = Object.fromEntries(nextEntries) as Record<string, QueuedPrompt[]>;
      queuedPromptsByThreadIdRef.current = next;
      return next;
    });
    queueProcessingThreadIdsRef.current.forEach((threadId) => {
      if (!threadIds.has(threadId)) {
        queueProcessingThreadIdsRef.current.delete(threadId);
      }
    });
    setThreadCompletionFlashById((prev) => {
      const nextEntries = Object.entries(prev).filter(([threadId]) => threadIds.has(threadId));
      if (nextEntries.length === Object.keys(prev).length) {
        return prev;
      }
      return Object.fromEntries(nextEntries) as Record<string, boolean>;
    });
    setThreadFinishedUnreadById((prev) => {
      const nextEntries = Object.entries(prev).filter(([threadId]) => threadIds.has(threadId));
      if (nextEntries.length === Object.keys(prev).length) {
        return prev;
      }
      return Object.fromEntries(nextEntries) as Record<string, boolean>;
    });
    setThreadAwaitingInputById((prev) => {
      const nextEntries = Object.entries(prev).filter(([threadId]) => threadIds.has(threadId));
      if (nextEntries.length === Object.keys(prev).length) {
        return prev;
      }
      const next = Object.fromEntries(nextEntries) as Record<string, boolean>;
      threadAwaitingInputByIdRef.current = next;
      return next;
    });
    setPendingUserQuestionsByThreadId((prev) => {
      const nextEntries = Object.entries(prev).filter(([threadId]) => threadIds.has(threadId));
      if (nextEntries.length === Object.keys(prev).length) {
        return prev;
      }
      const next = Object.fromEntries(nextEntries) as Record<string, PendingUserQuestion[]>;
      pendingUserQuestionsByThreadIdRef.current = next;
      return next;
    });
    setPendingUserInputRequestIdByThreadId((prev) => {
      const nextEntries = Object.entries(prev).filter(([threadId]) => threadIds.has(threadId));
      if (nextEntries.length === Object.keys(prev).length) {
        return prev;
      }
      const next = Object.fromEntries(nextEntries) as Record<string, string>;
      pendingUserInputRequestIdByThreadIdRef.current = next;
      return next;
    });
    setUserQuestionAnswersByThreadId((prev) => {
      const nextEntries = Object.entries(prev).filter(([threadId]) => threadIds.has(threadId));
      if (nextEntries.length === Object.keys(prev).length) {
        return prev;
      }
      return Object.fromEntries(nextEntries) as Record<string, Record<string, UserQuestionAnswerState>>;
    });
    setThreadHistoryCursorById((prev) => {
      const nextEntries = Object.entries(prev).filter(([threadId]) => threadIds.has(threadId));
      if (nextEntries.length === Object.keys(prev).length) {
        return prev;
      }
      return Object.fromEntries(nextEntries) as Record<string, number | undefined>;
    });
    setThreadHistoryHasMoreById((prev) => {
      const nextEntries = Object.entries(prev).filter(([threadId]) => threadIds.has(threadId));
      if (nextEntries.length === Object.keys(prev).length) {
        return prev;
      }
      return Object.fromEntries(nextEntries) as Record<string, boolean>;
    });
    setThreadHistoryLoadingById((prev) => {
      const nextEntries = Object.entries(prev).filter(([threadId]) => threadIds.has(threadId));
      if (nextEntries.length === Object.keys(prev).length) {
        return prev;
      }
      return Object.fromEntries(nextEntries) as Record<string, boolean>;
    });
    setThreadSummaryById((prev) => {
      const nextEntries = Object.entries(prev).filter(([threadId]) => threadIds.has(threadId));
      if (nextEntries.length === Object.keys(prev).length) {
        return prev;
      }
      return Object.fromEntries(nextEntries) as Record<string, string>;
    });
  }, [threads]);

  useEffect(() => {
    let refreshTimer: number | null = null;
    let refreshInFlight = false;
    let refreshQueued = false;

    const refreshActiveProjectTerminalState = () => {
      if (!activeProjectId) {
        refreshQueued = false;
        return;
      }
      if (refreshInFlight) {
        refreshQueued = true;
        return;
      }
      refreshInFlight = true;
      api.projectTerminal
        .getState({ projectId: activeProjectId })
        .then((state) => {
          const nextState = applyDismissedTerminalErrors(activeProjectId, state);
          setProjectTerminalById((prev) => ({
            ...prev,
            [activeProjectId]: nextState
          }));
        })
        .catch((error) => {
          setLogs((prev) => [...prev, `Terminal state refresh failed: ${String(error)}`]);
        })
        .finally(() => {
          refreshInFlight = false;
          if (refreshQueued) {
            refreshQueued = false;
            refreshActiveProjectTerminalState();
          }
        });
    };

    const scheduleTerminalRefresh = (delayMs: number) => {
      if (refreshTimer) {
        return;
      }
      refreshTimer = window.setTimeout(() => {
        refreshTimer = null;
        refreshActiveProjectTerminalState();
      }, delayMs);
    };

    const unsubscribe = api.projectTerminal.onEvent((event: ProjectTerminalEvent) => {
      if (event.type === "preview_url_detected") {
        setProjectPreviewUrlById((prev) => {
          if (prev[event.projectId] === event.payload) {
            return prev;
          }
          return {
            ...prev,
            [event.projectId]: event.payload
          };
        });
        setProjectSettingsById((prev) => {
          const existing = prev[event.projectId];
          if (!existing || existing.lastDetectedPreviewUrl === event.payload) {
            return prev;
          }
          return {
            ...prev,
            [event.projectId]: {
              ...existing,
              lastDetectedPreviewUrl: event.payload
            }
          };
        });
      }

      if (activeProjectId && event.projectId === activeProjectId) {
        const delayMs = event.type === "stdout" || event.type === "stderr" ? 120 : 0;
        scheduleTerminalRefresh(delayMs);
      }
    });
    return () => {
      if (refreshTimer) {
        window.clearTimeout(refreshTimer);
        refreshTimer = null;
      }
      unsubscribe();
    };
  }, [activeProjectId]);

  useEffect(() => {
    const unsubscribe = api.preview.onEvent((event: PreviewEvent) => {
      if (event.type === "popout_closed") {
        setIsPreviewPoppedOut(false);
      }
    });
    return () => {
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    if ((activeProjectBrowserEnabled && activeProjectBrowserMode === "in_app") || !isPreviewPoppedOut) {
      return;
    }
    api.preview.closePopout().catch((error) => {
      setLogs((prev) => [...prev, `Preview close failed: ${String(error)}`]);
    });
    setIsPreviewPoppedOut(false);
  }, [activeProjectBrowserEnabled, activeProjectBrowserMode, isPreviewPoppedOut]);

  useEffect(() => {
    if (!activeProjectBrowserEnabled && isPreviewOpen) {
      setIsPreviewOpen(false);
    }
  }, [activeProjectBrowserEnabled, isPreviewOpen]);

  useEffect(() => {
    if (!isPreviewPoppedOut || !activeProjectPreviewUrl) {
      return;
    }
    api.preview.navigate({ url: activeProjectPreviewUrl, projectId: activeProjectId ?? undefined, projectName: activeProject?.name }).catch((error) => {
      setLogs((prev) => [...prev, `Preview pop-out navigate failed: ${String(error)}`]);
    });
  }, [isPreviewPoppedOut, activeProjectPreviewUrl, activeProjectId, activeProject]);

  useEffect(() => {
    (window as Window & {
      __codeappTerminalPopoutAction?: (action: string, commandId: string) => void;
    }).__codeappTerminalPopoutAction = (action: string, commandId: string) => {
      if (!commandId) {
        return;
      }
      if (action === "start" || action === "restart") {
        startActiveProjectTerminal(commandId).catch((error) => setLogs((prev) => [...prev, `Terminal start failed: ${String(error)}`]));
        return;
      }
      if (action === "stop") {
        stopActiveProjectTerminal(commandId).catch((error) => setLogs((prev) => [...prev, `Terminal stop failed: ${String(error)}`]));
      }
    };
    return () => {
      delete (window as Window & { __codeappTerminalPopoutAction?: (action: string, commandId: string) => void })
        .__codeappTerminalPopoutAction;
    };
  }, [activeProjectId, applyDismissedTerminalErrors]);

  useEffect(() => {
    clearClosedTerminalPopouts();
    Object.entries(terminalPopoutWindowsRef.current).forEach(([key, popout]) => {
      const parsed = parseTerminalPopoutKey(key);
      if (!parsed || !popout || popout.closed) {
        return;
      }
      const terminal = projectTerminalById[parsed.projectId]?.terminals.find((item) => item.commandId === parsed.commandId);
      if (!terminal) {
        closeTerminalPopout(key);
        return;
      }
      const projectName = projects.find((project) => project.id === parsed.projectId)?.name;
      void renderTerminalPopout(key, popout, parsed.projectId, terminal, projectName).catch((error) => {
        appendLog(`Terminal pop-out render failed: ${String(error)}`);
      });
    });
  }, [appendLog, projectTerminalById, projects, terminalPopoutByKey]);

  useEffect(() => {
    return () => {
      Object.values(terminalPopoutWindowsRef.current).forEach((popout) => {
        if (popout && !popout.closed) {
          popout.close();
        }
      });
      Object.keys(terminalPopoutInstancesRef.current).forEach((key) => {
        terminalPopoutInstancesRef.current[key]?.terminal.dispose();
        delete terminalPopoutInstancesRef.current[key];
      });
      terminalPopoutWindowsRef.current = {};
      setIsCodePanelPoppedOut(false);
    };
  }, []);

  useEffect(() => {
    const unsubscribe = api.codePanel.onEvent((event) => {
      if (event.type === "popout_closed") {
        setIsCodePanelPoppedOut(false);
        return;
      }

      if (event.type === "focus_project" && event.projectId) {
        setActiveProjectId(event.projectId);
      }
    });
    return () => {
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!isGitPoppedOut || !activeProjectId) {
      return;
    }
    api.git.openPopout({ projectId: activeProjectId, projectName: activeProject?.name }).catch((error) => {
      setLogs((prev) => [...prev, `Git pop-out sync failed: ${String(error)}`]);
    });
  }, [isGitPoppedOut, activeProjectId, activeProject]);

  useEffect(() => {
    setIsBranchDropdownOpen(false);
    setGitBranchSearch("");
    setComposerDropdown(null);
    setFileMention(null);
    setSkillMention(null);
  }, [activeProjectId]);

  useEffect(() => {
    if (!activeProjectId) {
      return;
    }
    if ((projectFilesByProjectId[activeProjectId] ?? []).length > 0) {
      return;
    }

    const targetProjectId = activeProjectId;
    api.projects
      .listFiles({ projectId: targetProjectId, limit: FILE_INDEX_LOAD_LIMIT })
      .then((files) => {
        setProjectFilesByProjectId((prev) => {
          if (prev[targetProjectId]) {
            return prev;
          }
          return {
            ...prev,
            [targetProjectId]: files
          };
        });
      })
      .catch((error) => {
        setLogs((prev) => [...prev, `File index failed: ${String(error)}`]);
      });
  }, [activeProjectId, projectFilesByProjectId]);

  useEffect(() => {
    if (!threadMenuProjectId) {
      return;
    }
    const openProjectId = threadMenuProjectId;
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (!target) {
        return;
      }
      if (threadCreateMenuRef.current?.contains(target)) {
        return;
      }
      const element = target as HTMLElement;
      const trigger = element.closest(`[data-thread-menu-trigger="${openProjectId}"]`);
      if (trigger) {
        return;
      }
      setThreadMenuProjectId(null);
    };
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setThreadMenuProjectId(null);
      }
    };
    window.addEventListener("mousedown", onPointerDown);
    window.addEventListener("keydown", onEscape);
    return () => {
      window.removeEventListener("mousedown", onPointerDown);
      window.removeEventListener("keydown", onEscape);
    };
  }, [threadMenuProjectId]);

  useEffect(() => {
    const closeThreadContextMenu = () => {
      const menu = threadContextMenuRef.current;
      if (!menu) {
        return;
      }
      if (threadContextMenuCloseTimerRef.current !== null) {
        window.clearTimeout(threadContextMenuCloseTimerRef.current);
        threadContextMenuCloseTimerRef.current = null;
      }
      menu.classList.remove("is-open");
      menu.classList.add("is-closing");
      threadContextMenuCloseTimerRef.current = window.setTimeout(() => {
        menu.classList.remove("is-closing");
        menu.style.display = "none";
        threadContextMenuCloseTimerRef.current = null;
      }, 130);
      threadContextMenuThreadIdRef.current = null;
    };
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (!target) {
        return;
      }
      if (threadContextMenuRef.current?.contains(target)) {
        return;
      }
      closeThreadContextMenu();
    };
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeThreadContextMenu();
      }
    };
    const onWindowBlur = () => {
      closeThreadContextMenu();
    };
    window.addEventListener("mousedown", onPointerDown);
    window.addEventListener("keydown", onEscape);
    window.addEventListener("blur", onWindowBlur);
    return () => {
      window.removeEventListener("mousedown", onPointerDown);
      window.removeEventListener("keydown", onEscape);
      window.removeEventListener("blur", onWindowBlur);
    };
  }, []);

  useEffect(
    () => () => {
      if (threadContextMenuCloseTimerRef.current !== null) {
        window.clearTimeout(threadContextMenuCloseTimerRef.current);
        threadContextMenuCloseTimerRef.current = null;
      }
    },
    []
  );

  useEffect(() => {
    if (!isChangelogOpen) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!changelogRef.current?.contains(target)) {
        setIsChangelogOpen(false);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsChangelogOpen(false);
      }
    };

    document.addEventListener("pointerdown", handlePointerDown, true);
    window.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown, true);
      window.removeEventListener("keydown", handleEscape);
    };
  }, [isChangelogOpen]);
  useEffect(() => {
    if (!isBranchDropdownOpen) {
      return;
    }

    const updatePosition = () => {
      const rect = branchTriggerRef.current?.getBoundingClientRect();
      if (!rect) {
        return;
      }
      setBranchDropdownPosition({
        bottom: Math.max(8, window.innerHeight - rect.top + 6),
        left: Math.max(8, rect.right - 352),
        width: 352
      });
    };

    updatePosition();

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (
        !branchTriggerRef.current?.contains(target) &&
        !branchDropdownMenuRef.current?.contains(target)
      ) {
        setIsBranchDropdownOpen(false);
      }
    };

    const handleReposition = () => {
      updatePosition();
    };

    window.addEventListener("mousedown", handlePointerDown);
    window.addEventListener("resize", handleReposition);
    window.addEventListener("scroll", handleReposition, true);
    return () => {
      window.removeEventListener("mousedown", handlePointerDown);
      window.removeEventListener("resize", handleReposition);
      window.removeEventListener("scroll", handleReposition, true);
    };
  }, [isBranchDropdownOpen]);

  useEffect(() => {
    if (!isBranchDropdownOpen) {
      return;
    }
    if (branchListRef.current) {
      branchListRef.current.scrollTop = 0;
    }
    setBranchListScrollTop(0);
  }, [isBranchDropdownOpen, gitBranchInput, activeProjectId]);

  useEffect(() => {
    if (!isBranchDropdownOpen) {
      return;
    }
    const list = branchListRef.current;
    if (!list) {
      return;
    }
    setBranchListViewportHeight(list.clientHeight || 208);
  }, [isBranchDropdownOpen, filteredBranches.length]);

  useEffect(() => {
    if (!composerDropdown) {
      return;
    }

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      const triggerRefs = [
        composerModelTriggerRef.current,
        composerEffortTriggerRef.current,
        composerModeTriggerRef.current,
        composerSandboxTriggerRef.current
      ];
      if (
        !composerDropdownMenuRef.current?.contains(target) &&
        !triggerRefs.some((ref) => ref?.contains(target))
      ) {
        setComposerDropdown(null);
      }
    };

    const handleClose = () => {
      setComposerDropdown(null);
    };

    window.addEventListener("mousedown", handlePointerDown);
    window.addEventListener("resize", handleClose);
    window.addEventListener("scroll", handleClose, true);
    return () => {
      window.removeEventListener("mousedown", handlePointerDown);
      window.removeEventListener("resize", handleClose);
      window.removeEventListener("scroll", handleClose, true);
    };
  }, [composerDropdown]);

  useEffect(() => {
    if (!fileMention && !skillMention) {
      return;
    }

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (
        composerTextareaRef.current?.contains(target) ||
        fileMentionMenuRef.current?.contains(target) ||
        skillMentionMenuRef.current?.contains(target)
      ) {
        return;
      }
      setFileMention(null);
      setSkillMention(null);
    };

    window.addEventListener("mousedown", handlePointerDown);
    return () => {
      window.removeEventListener("mousedown", handlePointerDown);
    };
  }, [fileMention, skillMention]);

  useEffect(() => {
    api.projectTerminal
      .setActiveProject({ projectId: activeProjectId })
      .catch((error) => setLogs((prev) => [...prev, `Terminal switch failed: ${String(error)}`]));
    if (!activeProjectId) {
      return;
    }
    const targetProjectId = activeProjectId;
    let cancelled = false;
    Promise.all([
      loadThreads(),
      loadProjectSettings(targetProjectId),
      loadProjectSkills(targetProjectId),
      loadProjectTerminalState(targetProjectId),
      loadGitSnapshot(targetProjectId)
    ])
      .then(([, projectSettings, , , gitSnapshot]) => {
        if (cancelled) {
          return;
        }
        setProjectPreviewUrlById((prev) => ({
          ...prev,
          [targetProjectId]: projectSettings.lastDetectedPreviewUrl ?? prev[targetProjectId] ?? ""
        }));
        const projectName = projects.find((project) => project.id === targetProjectId)?.name;
        const projectWebLinks = projectSettings.webLinks ?? [];
        if (projectWebLinks.length > 0) {
          api.projects
            .getWebLinkState()
            .then((state) => {
              if (cancelled || !state.open || !state.url) {
                return;
              }
              const currentUrl = normalizeWebLinkUrl(state.url);
              if (!currentUrl) {
                return;
              }
              const match = projectWebLinks.find((link) => normalizeWebLinkUrl(link.url) === currentUrl);
              if (!match) {
                return;
              }
              return api.projects.openWebLink({
                url: match.url,
                name: match.name,
                projectName,
                focus: false
              });
            })
            .catch((error) => {
              setLogs((prev) => [...prev, `Web link auto-switch failed: ${String(error)}`]);
            });
        }
        selectGitPath(targetProjectId, gitSnapshot.state.files[0]?.path);
      })
      .catch((error) => {
        setLogs((prev) => [...prev, `Load project failed: ${String(error)}`]);
      });
    return () => {
      cancelled = true;
    };
  }, [activeProjectId, projects]);

  useEffect(() => {
    if (!activeThreadId) {
      setMessages((prev) => (prev.length === 0 ? prev : []));
      setTerminalLines((prev) => (prev.length === 0 ? prev : []));
      setActivity((prev) => (prev.length === 0 ? prev : []));
      setComposerMentionedFiles((prev) => (prev.length === 0 ? prev : []));
      setComposerMentionedSkills((prev) => (prev.length === 0 ? prev : []));
      setFileMention(null);
      setSkillMention(null);
      pendingHistoryScrollRestoreRef.current = null;
      lastStartedOptionsKeyRef.current = "";
      setComposerAttachments((prev) => {
        if (prev.length === 0) {
          return prev;
        }
        prev.forEach((attachment) => URL.revokeObjectURL(attachment.previewUrl));
        return [];
      });
      return;
    }

    clearFinishedUnreadThread(activeThreadId);

    const bootThread = async () => {
      setComposerMentionedFiles((prev) => (prev.length === 0 ? prev : []));
      setComposerMentionedSkills((prev) => (prev.length === 0 ? prev : []));
      setComposerAttachments((prev) => {
        if (prev.length === 0) {
          return prev;
        }
        prev.forEach((attachment) => URL.revokeObjectURL(attachment.previewUrl));
        return [];
      });
      setIsDraggingFiles((prev) => (prev ? false : prev));
      setFileMention(null);
      setSkillMention(null);
      const historyPage = await api.threads.events({
        threadId: activeThreadId,
        userPromptCount: HISTORY_USER_PROMPT_WINDOW
      });
      applyThreadHistoryPage(activeThreadId, historyPage, "replace");
      setTerminalLines((prev) => (prev.length === 0 ? prev : []));
      await api.sessions.start({ threadId: activeThreadId, options: composerOptions });
      lastStartedOptionsKeyRef.current = codexOptionsKey(composerOptions);
      scrollTimelineToBottom();
    };

    bootThread().catch((error) => {
      setLogs((prev) => [...prev, `Thread startup failed: ${String(error)}`]);
    });
  }, [activeThreadId]);

  const assignProjectToActiveWorkspace = async (project: Project) => {
    if (!activeWorkspaceId || project.workspaceId === activeWorkspaceId) {
      return project;
    }
    const updated = await api.projects.update({ id: project.id, workspaceId: activeWorkspaceId });
    setProjects((prev) => prev.map((item) => (item.id === updated.id ? updated : item)));
    return updated;
  };

  const openProject = async () => {
    setIsProjectMenuOpen(false);
    const path = await api.projects.pickPath();
    if (!path) return;

    const name = getProjectNameFromPath(path);
    const project = await assignProjectToActiveWorkspace(await api.projects.create({ name, path }));
    await loadProjects();
    setActiveProjectId(project.id);
  };

  const openAppSettingsWindow = async () => {
    try {
      await api.settings.openWindow();
    } catch (error) {
      const errorText = String(error);
      if (!errorText.includes("No handler registered")) {
        setLogs((prev) => [...prev, `Open settings window failed: ${errorText}`]);
      }
      setAppSettingsInitialDraft({
        settings,
        composerOptions: getHarnessOptionsFromSettings(settings, settings.defaultHarnessId ?? "codex"),
        settingsEnvText: envVarsToText(settings.envVars),
        settingsTab: "general"
      });
      setShowSettings(true);
    }
  };

  const loadImportCandidates = async () => {
    setImportLoading(true);
    try {
      const repositories = await api.projects.listGitRepositories();
      setImportCandidates(repositories);
    } catch (error) {
      setLogs((prev) => [...prev, `Load import candidates failed: ${String(error)}`]);
    } finally {
      setImportLoading(false);
    }
  };

  const openImportProjectModal = async () => {
    setIsProjectMenuOpen(false);
    const parentDir = settings.defaultProjectDirectory?.trim() ?? "";
    if (!parentDir) {
      setLogs((prev) => [...prev, "Set a default project directory in Settings first."]);
      openAppSettingsWindow().catch((error) => {
        setLogs((prev) => [...prev, `Open settings window failed: ${String(error)}`]);
      });
      return;
    }

    setImportProjectQuery("");
    setImportCandidates([]);
    setShowImportProjectModal(true);
    await loadImportCandidates();
  };

  const importProjectFromPath = async (path: string) => {
    setImportBusyPath(path);
    try {
      const project = await assignProjectToActiveWorkspace(await api.projects.importFromPath({ path }));
      await loadProjects();
      setActiveProjectId(project.id);
      setShowImportProjectModal(false);
    } catch (error) {
      setLogs((prev) => [...prev, `Import project failed: ${String(error)}`]);
    } finally {
      setImportBusyPath(null);
    }
  };

  const cloneProjectFromQuery = async () => {
    const url = importProjectQuery.trim();
    if (!isLikelyGitRepositoryUrl(url)) {
      setLogs((prev) => [...prev, "Paste a valid git repository URL to clone."]);
      return;
    }

    setCloneBusy(true);
    try {
      const project = await assignProjectToActiveWorkspace(await api.projects.cloneFromGitUrl({ url }));
      await loadProjects();
      setActiveProjectId(project.id);
      setShowImportProjectModal(false);
      setImportProjectQuery("");
    } catch (error) {
      setLogs((prev) => [...prev, `Clone project failed: ${String(error)}`]);
    } finally {
      setCloneBusy(false);
    }
  };

  const createProjectInDefaultDirectory = async () => {
    setIsProjectMenuOpen(false);
    const parentDir = settings.defaultProjectDirectory?.trim() ?? "";
    if (!parentDir) {
      setLogs((prev) => [...prev, "Set a default project directory in Settings first."]);
      openAppSettingsWindow().catch((error) => {
        setLogs((prev) => [...prev, `Open settings window failed: ${String(error)}`]);
      });
      return;
    }

    setShowNewProjectModal(true);
  };

  const submitNewProject = async (input: {
    name: string;
    monorepo: boolean;
    templateIds: ProjectTemplateId[];
  }) => {
    const parentDir = settings.defaultProjectDirectory?.trim() ?? "";
    if (!parentDir) {
      setLogs((prev) => [...prev, "Set a default project directory in Settings first."]);
      setShowNewProjectModal(false);
      openAppSettingsWindow().catch((error) => {
        setLogs((prev) => [...prev, `Open settings window failed: ${String(error)}`]);
      });
      return;
    }

    const projectName = sanitizeProjectDirName(input.name);
    if (!projectName) {
      setLogs((prev) => [...prev, "Project name is required and cannot contain path separators."]);
      return;
    }
    if (!input.monorepo && input.templateIds.length > 1) {
      setLogs((prev) => [...prev, "Select only one template when Monorepo is off."]);
      return;
    }

    setCreatingProject(true);
    try {
      const project = await assignProjectToActiveWorkspace(
        await api.projects.createInDirectory({
          name: projectName,
          parentDir,
          monorepo: input.monorepo,
          templateIds: input.templateIds
        })
      );
      setProjectSetupById((prev) => ({
        ...prev,
        [project.id]: {
          projectId: project.id,
          phase: "creating_folder",
          status: "running",
          message: "Creating folder...",
          ts: new Date().toISOString()
        }
      }));
      await loadProjects();
      setActiveProjectId(project.id);
      setShowNewProjectModal(false);
    } catch (error) {
      setLogs((prev) => [...prev, `Create project failed: ${String(error)}`]);
    } finally {
      setCreatingProject(false);
    }
  };

  const openActiveProjectSettings = async (projectId = activeProjectId) => {
    if (!projectId) {
      return;
    }
    const current = projectSettingsById[projectId] ?? (await loadProjectSettings(projectId));
    const nextWebLinks = (current.webLinks ?? []).map((link, index) => ({
      id: link.id?.trim() || `link-${index + 1}`,
      name: link.name ?? "",
      url: link.url ?? ""
    }));
    const selectedProject = projects.find((project) => project.id === projectId) ?? null;
    const projectName = selectedProject?.name ?? "";
    const projectColor = selectedProject?.color ?? "#64748b";
    const projectWorkspaceId = selectedProject?.workspaceId ?? "";
    setProjectSettingsInitialDraft({
      projectName,
      projectColor,
      projectWorkspaceTargetId: projectWorkspaceId,
      projectSettingsEnvText: envVarsToText(current.envVars),
      projectSettingsWebLinks: nextWebLinks
    });
    if (activeProjectId !== projectId) {
      setActiveProjectId(projectId);
    }
    setShowProjectSettings(true);
  };

  const openActiveProjectActionsSettings = async (commandId?: string) => {
    const projectId = activeProjectId;
    if (!projectId) {
      return;
    }
    const current = projectSettingsById[projectId] ?? (await loadProjectSettings(projectId));
    const overflowActionCommandIds = new Set(current.overflowActionCommandIds ?? []);
    const nextCommands = current.devCommands.map((command, index) => ({
      id: command.id?.trim() || `cmd-${index + 1}`,
      name: command.name ?? "",
      command: command.command ?? "",
      inDropdown: overflowActionCommandIds.has(command.id?.trim() || `cmd-${index + 1}`),
      autoStart: command.autoStart ?? index === 0,
      stayRunning: command.stayRunning ?? false,
      hotkey: command.hotkey?.trim() ?? ""
    }));
    setProjectActionsSettingsInitialDraft({
      focusCommandId: commandId,
      projectSettingsCommands: nextCommands
    });
    if (activeProjectId !== projectId) {
      setActiveProjectId(projectId);
    }
    setShowProjectActionsSettings(true);
  };

  const saveProjectSettings = async (draft: {
    projectName: string;
    projectColor: string;
    projectWorkspaceTargetId: string;
    projectSettingsEnvText: string;
    projectSettingsWebLinks: ProjectWebLink[];
  }) => {
    if (!activeProjectId) {
      return;
    }
    const nextProjectName = draft.projectName.trim();
    if (!nextProjectName) {
      setLogs((prev) => [...prev, "Project settings save failed: project name is required."]);
      return;
    }

    let envVars: Record<string, string> = {};
    try {
      envVars = parseEnvText(draft.projectSettingsEnvText);
    } catch (error) {
      setLogs((prev) => [...prev, `Project settings save failed: ${String(error)}`]);
      return;
    }

    const sanitizedWebLinks: ProjectWebLink[] = [];
    for (const [index, link] of draft.projectSettingsWebLinks.entries()) {
      const name = link.name.trim();
      const rawUrl = link.url.trim();
      if (!name && !rawUrl) {
        continue;
      }
      if (!name || !rawUrl) {
        setLogs((prev) => [...prev, `Project settings save failed: web link ${index + 1} needs both name and URL.`]);
        return;
      }
      const normalizedUrl = normalizeWebLinkUrl(rawUrl);
      if (!normalizedUrl) {
        setLogs((prev) => [...prev, `Project settings save failed: web link "${name}" has an invalid URL.`]);
        return;
      }
      sanitizedWebLinks.push({
        id: link.id.trim() || `link-${crypto.randomUUID()}`,
        name,
        url: normalizedUrl
      });
    }

    const updatedProject = await api.projects.update({
      id: activeProjectId,
      name: nextProjectName,
      color: draft.projectColor,
      workspaceId: draft.projectWorkspaceTargetId || undefined
    });
    setProjects((prev) => prev.map((project) => (project.id === updatedProject.id ? updatedProject : project)));
    if (activeProjectId === updatedProject.id) {
      setActiveWorkspaceId(updatedProject.workspaceId);
    }

    const saved = await api.projectSettings.set({
      projectId: activeProjectId,
      envVars,
      webLinks: sanitizedWebLinks
    });

    setProjectSettingsById((prev) => ({
      ...prev,
      [activeProjectId]: saved
    }));
    if (saved.lastDetectedPreviewUrl) {
      setProjectPreviewUrlById((prev) => ({
        ...prev,
        [activeProjectId]: saved.lastDetectedPreviewUrl ?? ""
      }));
    }
    setShowProjectSettings(false);
    setProjectSettingsInitialDraft(null);
    setShowProjectActionsSettings(false);
    setProjectActionsSettingsInitialDraft(null);
  };

  const saveProjectActionsSettings = async (draft: {
    projectSettingsCommands: Array<{
      id: string;
      name: string;
      command: string;
      inDropdown: boolean;
      autoStart: boolean;
      stayRunning: boolean;
      hotkey?: string;
    }>;
  }) => {
    if (!activeProjectId) {
      return;
    }
    const sanitizedCommands = draft.projectSettingsCommands
      .map((command) => ({
        id: command.id.trim(),
        name: command.name.trim(),
        command: command.command.trim(),
        inDropdown: Boolean(command.inDropdown),
        autoStart: Boolean(command.autoStart),
        stayRunning: Boolean(command.stayRunning),
        hotkey: normalizeActionHotkey(command.hotkey ?? "") || undefined
      }))
      .filter((command) => command.id && command.name && command.command);

    const overflowActionCommandIds = sanitizedCommands
      .filter((command) => command.inDropdown)
      .map((command) => command.id);

    const saved = await api.projectSettings.set({
      projectId: activeProjectId,
      devCommands: sanitizedCommands,
      autoStartDevTerminal: sanitizedCommands.some((command) => command.autoStart),
      overflowActionCommandIds
    });

    setProjectSettingsById((prev) => ({
      ...prev,
      [activeProjectId]: saved
    }));
    try {
      await loadProjectTerminalState(activeProjectId);
    } catch (error) {
      setLogs((prev) => [...prev, `Action terminal refresh failed: ${String(error)}`]);
    }
    setShowProjectActionsSettings(false);
    setProjectActionsSettingsInitialDraft(null);
  };

  const removeActiveProject = async () => {
    if (!activeProjectId) {
      return;
    }
    await deleteProjectById(activeProjectId);
  };

  const startActiveProjectTerminal = async (commandId?: string) => {
    if (!activeProjectId) {
      return;
    }
    const normalizedCommandId = commandId?.trim();
    if (!normalizedCommandId) {
      setLogs((prev) => [...prev, "Terminal start failed: missing command id."]);
      return;
    }
    delete dismissedTerminalErrorStampByKeyRef.current[terminalErrorKey(activeProjectId, normalizedCommandId)];
    const state = await api.projectTerminal.start({ projectId: activeProjectId, commandId: normalizedCommandId });
    const nextState = applyDismissedTerminalErrors(activeProjectId, state);
    setProjectTerminalById((prev) => ({
      ...prev,
      [activeProjectId]: nextState
    }));
  };

  const stopActiveProjectTerminal = async (commandId?: string) => {
    if (!activeProjectId) {
      return;
    }
    const normalizedCommandId = commandId?.trim();
    if (!normalizedCommandId) {
      setLogs((prev) => [...prev, "Terminal stop failed: missing command id."]);
      return;
    }
    await api.projectTerminal.stop({ projectId: activeProjectId, commandId: normalizedCommandId });
    const state = await api.projectTerminal.getState({ projectId: activeProjectId });
    const nextState = applyDismissedTerminalErrors(activeProjectId, state);
    setProjectTerminalById((prev) => ({
      ...prev,
      [activeProjectId]: nextState
    }));
  };

  const acknowledgeActiveProjectTerminalError = (commandId: string) => {
    if (!activeProjectId || !commandId) {
      return;
    }
    const now = new Date().toISOString();
    setProjectTerminalById((prev) => {
      const current = prev[activeProjectId];
      if (!current) {
        return prev;
      }
      const terminal = current.terminals.find((item) => item.commandId === commandId);
      if (!terminal) {
        return prev;
      }
      dismissedTerminalErrorStampByKeyRef.current[terminalErrorKey(activeProjectId, commandId)] = terminal.updatedAt;
      const nextTerminals = current.terminals.map((terminal) =>
        terminal.commandId === commandId
          ? { ...terminal, lastExitCode: undefined, updatedAt: now }
          : terminal
      );
      return {
        ...prev,
        [activeProjectId]: {
          ...current,
          terminals: nextTerminals,
          updatedAt: now
        }
      };
    });
  };

  const refreshGitSnapshotSelection = useCallback(async (projectId: string) => {
    const nextSnapshot = await loadGitSnapshot(projectId);
    const nextState = nextSnapshot.state;
    const selectedPath =
      activeSelectedGitPath && nextState.files.some((file) => file.path === activeSelectedGitPath)
        ? activeSelectedGitPath
        : nextState.files[0]?.path;
    selectGitPath(projectId, selectedPath);
    return nextSnapshot;
  }, [activeSelectedGitPath, loadGitSnapshot, selectGitPath]);

  const runGitAction = async (
    label: string,
    action: (projectId: string) => Promise<{ ok: boolean; stdout: string; stderr: string }>,
    options?: { busyLabel?: string }
  ) => {
    if (!activeProjectId) {
      return;
    }

    setGitBusyAction(options?.busyLabel ?? label);
    try {
      const result = await action(activeProjectId);
      const pushGitActivity = (message: string, tone: GitActivityEntry["tone"]) => {
        setGitActivityByProjectId((prev) => {
          const existing = prev[activeProjectId] ?? [];
          const next: GitActivityEntry[] = [
            ...existing,
            {
              id: crypto.randomUUID(),
              ts: new Date().toISOString(),
              message,
              tone
            }
          ].slice(-80);
          return {
            ...prev,
            [activeProjectId]: next
          };
        });
      };

      if (result.stdout) {
        pushGitActivity(`[${label}] ${result.stdout}`, result.ok ? "success" : "error");
      }
      if (result.stderr) {
        pushGitActivity(`[${label}] ${result.stderr}`, result.ok ? "info" : "error");
      }
      if (!result.ok) {
        setLogs((prev) => [...prev, `Git ${label} failed.${result.stderr ? ` ${result.stderr}` : ""}`]);
      }

      await refreshGitSnapshotSelection(activeProjectId);
      return result;
    } finally {
      setGitBusyAction(null);
    }
  };

  const deleteProjectById = async (projectId: string) => {
    if (removingProject) {
      return;
    }

    const project = projects.find((item) => item.id === projectId);
    const projectName = project?.name ?? "this project";
    const confirmed = window.confirm(
      `Remove "${projectName}" from GameraCode?\n\nThis removes its app settings and threads. Project files on disk are not deleted.`
    );
    if (!confirmed) {
      return;
    }

    setRemovingProject(true);
    try {
      await api.projects.delete({ id: projectId });
      setShowProjectSettings(false);
      setProjectSettingsInitialDraft(null);
      setShowProjectActionsSettings(false);
      setProjectActionsSettingsInitialDraft(null);
      setProjectSettingsById((prev) => {
        const next = { ...prev };
        delete next[projectId];
        return next;
      });
      setProjectTerminalById((prev) => {
        const next = { ...prev };
        delete next[projectId];
        return next;
      });
      Object.keys(dismissedTerminalErrorStampByKeyRef.current).forEach((key) => {
        if (key.startsWith(`${projectId}:`)) {
          delete dismissedTerminalErrorStampByKeyRef.current[key];
        }
      });
      setProjectPreviewUrlById((prev) => {
        const next = { ...prev };
        delete next[projectId];
        return next;
      });
      setGitStateByProjectId((prev) => {
        const next = { ...prev };
        delete next[projectId];
        return next;
      });
      setGitOutgoingCommitsByProjectId((prev) => {
        const next = { ...prev };
        delete next[projectId];
        return next;
      });
      setGitIncomingCommitsByProjectId((prev) => {
        const next = { ...prev };
        delete next[projectId];
        return next;
      });
      setGitSharedHistoryByProjectId((prev) => {
        const next = { ...prev };
        delete next[projectId];
        return next;
      });
      setGitSharedHistoryExpandedByProjectId((prev) => {
        const next = { ...prev };
        delete next[projectId];
        return next;
      });
      setGitSharedHistoryLoadingByProjectId((prev) => {
        const next = { ...prev };
        delete next[projectId];
        return next;
      });
      setGitSelectedPathByProjectId((prev) => {
        const next = { ...prev };
        delete next[projectId];
        return next;
      });
      setGitActivityByProjectId((prev) => {
        const next = { ...prev };
        delete next[projectId];
        return next;
      });
      setLogs((prev) => [...prev, `Project removed: ${projectName}`]);
      await loadProjectsAndThreads();
    } catch (error) {
      setLogs((prev) => [...prev, `Project remove failed: ${String(error)}`]);
    } finally {
      setRemovingProject(false);
    }
  };

  const setProjectArchived = async (project: Project, archived: boolean) => {
    await api.projects.archive({ id: project.id, archived });
    if (archived) {
      setThreadMenuProjectId((prev) => (prev === project.id ? null : prev));
      if (activeProjectId === project.id) {
        const fallbackProject =
          projects.find(
            (item) =>
              item.id !== project.id &&
              !item.archivedAt &&
              (!activeWorkspaceId || item.workspaceId === activeWorkspaceId)
          ) ??
          projects.find((item) => item.id !== project.id && !item.archivedAt) ??
          null;
        const fallbackThread =
          (fallbackProject
            ? threads.find((thread) => thread.projectId === fallbackProject.id && !thread.archivedAt)
            : null) ??
          threads.find((thread) => {
            const threadProject = projectById[thread.projectId];
            return !thread.archivedAt && Boolean(threadProject) && !threadProject?.archivedAt && thread.projectId !== project.id;
          }) ??
          null;
        setActiveProjectId(fallbackProject?.id ?? null);
        setActiveThreadId(fallbackThread?.id ?? null);
      }
    }
    await loadProjectsAndThreads();
  };

  const checkoutBranch = async (branch: string) => {
    await runGitAction("checkout", (projectId) => api.git.checkoutBranch({ projectId, branch }));
  };

  const stageGitPath = async (path?: string) => {
    await runGitAction(path ? "stage" : "stage-all", (projectId) => api.git.stage({ projectId, path }));
  };

  const unstageGitPath = async (path?: string) => {
    await runGitAction(path ? "unstage" : "unstage-all", (projectId) => api.git.unstage({ projectId, path }));
  };

  const discardGitChanges = async () => {
    if (!activeGitState?.insideRepo || !hasStageableFiles) {
      return;
    }
    const confirmed = window.confirm(
      "Discard all unstaged and untracked changes? Staged changes will be kept."
    );
    if (!confirmed) {
      return;
    }
    await runGitAction("discard-unstaged", (projectId) => api.git.discard({ projectId }));
  };

  const resolveMergeConflictsWithAi = async () => {
    if (!activeProjectId || !activeGitState?.insideRepo || activeConflictFiles.length === 0) {
      return;
    }

    const conflictPaths = activeConflictFiles.map((file) => file.path);
    const thread = await api.threads.create({
      projectId: activeProjectId,
      title: `Resolve merge conflicts (${conflictPaths.length})`,
      provider: "codex"
    });
    await loadThreads();
    setActiveThreadId(thread.id);

    const promptBody = [
      "Help me resolve these git merge conflicts.",
      "Workflow requirements:",
      "- First summarize each conflict and propose a resolution plan.",
      "- Ask for confirmation before editing files.",
      "- After confirmation, apply edits and run minimal validation.",
      "- Do not run git add/commit/push unless explicitly requested.",
      "",
      `Conflicted files (${conflictPaths.length}):`,
      ...conflictPaths.map((path) => `- ${path}`)
    ].join("\n");

    const prompt: QueuedPrompt = {
      id: crypto.randomUUID(),
      input: buildPromptInputWithMentionedFiles(promptBody, conflictPaths),
      attachments: [],
      skills: [],
      options: {
        ...composerOptions,
        collaborationMode: "coding"
      }
    };
    await dispatchPromptToThread(thread.id, prompt);
    setGitActivityByProjectId((prev) => {
      const existing = prev[activeProjectId] ?? [];
      return {
        ...prev,
        [activeProjectId]: [
          ...existing,
          {
            id: crypto.randomUUID(),
            ts: new Date().toISOString(),
            message: `Opened merge conflict thread with ${conflictPaths.length} conflicted file(s).`,
            tone: "info" as const
          }
        ].slice(-80)
      };
    });
  };

  const initializeGitRepository = async () => {
    if (!activeProjectId || !activeGitState || activeGitState.insideRepo || gitBusyAction) {
      return;
    }
    const projectId = activeProjectId;
    setIsBranchDropdownOpen(false);
    const result = await runGitAction("init", (id) => api.git.init({ projectId: id }));
    if (!result?.ok) {
      return;
    }
    setGitInitRevealByProjectId((prev) => ({
      ...prev,
      [projectId]: true
    }));
    window.setTimeout(() => {
      setGitInitRevealByProjectId((prev) => {
        if (!prev[projectId]) {
          return prev;
        }
        const next = { ...prev };
        delete next[projectId];
        return next;
      });
    }, 520);
  };

  const commitGitChanges = async (options?: { message?: string; clearInput?: boolean; busyLabel?: string }) => {
    if (!activeProjectId) {
      return null;
    }
    const rawMessage = options?.message ?? gitCommitInputRef.current?.value ?? "";
    const trimmedMessage = rawMessage.trim();
    const clearInput = options?.clearInput ?? true;
    setGitCommitIsGeneratingMessage(trimmedMessage.length === 0);
    setGitBusyAction(options?.busyLabel ?? "commit");
    try {
      const result = await api.git.commit({
        projectId: activeProjectId,
        message: trimmedMessage || undefined
      });
      const pushGitActivity = (message: string, tone: GitActivityEntry["tone"]) => {
        setGitActivityByProjectId((prev) => {
          const existing = prev[activeProjectId] ?? [];
          const next: GitActivityEntry[] = [
            ...existing,
            {
              id: crypto.randomUUID(),
              ts: new Date().toISOString(),
              message,
              tone
            }
          ].slice(-80);
          return {
            ...prev,
            [activeProjectId]: next
          };
        });
      };

      if (result.stdout) {
        pushGitActivity(`[commit] ${result.stdout}`, result.ok ? "success" : "error");
      }
      if (result.stderr) {
        pushGitActivity(`[commit] ${result.stderr}`, result.ok ? "info" : "error");
      }
      if (result.ok && result.autoGenerated) {
        pushGitActivity(`[commit] Auto message: ${result.message}`, "info");
      }
      if (result.ok && result.autoStaged) {
        pushGitActivity("[commit] Auto-staged all changes before commit.", "info");
      }
      if (!result.ok) {
        setLogs((prev) => [...prev, `Git commit failed.${result.stderr ? ` ${result.stderr}` : ""}`]);
      } else {
        if (clearInput && gitCommitInputRef.current) {
          gitCommitInputRef.current.value = "";
        }
      }

      await refreshGitSnapshotSelection(activeProjectId);
      return result;
    } finally {
      setGitBusyAction(null);
      setGitCommitIsGeneratingMessage(false);
    }
  };

  const pushGitChanges = async () => {
    if (!activeProjectId || !activeGitState?.insideRepo || gitBusyAction) {
      return;
    }

    setGitPushProgressLabel("Refresh 1/5");
    try {
      const fetchResult = await runGitAction("fetch", (projectId) => api.git.fetch({ projectId }), { busyLabel: "push-sequence" });
      if (!fetchResult?.ok) {
        return;
      }

      setGitPushProgressLabel("Pull 2/5");
      const pullResult = await runGitAction("pull", (projectId) => api.git.pull({ projectId }), { busyLabel: "push-sequence" });
      if (!pullResult?.ok) {
        return;
      }

      setGitPushProgressLabel("Stage 3/5");
      const stageResult = await runGitAction("stage-all", (projectId) => api.git.stage({ projectId }), { busyLabel: "push-sequence" });
      if (!stageResult?.ok) {
        return;
      }

      setGitPushProgressLabel("Commit 4/5");
      const commitResult = await commitGitChanges({ message: "", clearInput: false, busyLabel: "push-sequence" });
      if (!commitResult) {
        return;
      }

      if (!commitResult.ok && !commitResult.stderr.includes("No staged changes to commit.")) {
        return;
      }

      setGitPushProgressLabel("Push 5/5");
      await runGitAction("push", (projectId) => api.git.push({ projectId }), { busyLabel: "push-sequence" });
    } finally {
      setGitPushProgressLabel(null);
    }
  };

  const switchOrCreateBranch = async (value?: string) => {
    if (!activeGitState?.insideRepo) {
      return;
    }

    const branch = (value ?? gitBranchSearch).trim();
    if (!branch) {
      setGitActivityByProjectId((prev) => {
        const existing = prev[activeProjectId ?? ""] ?? [];
        return {
          ...prev,
          [activeProjectId ?? ""]: [...existing, { id: crypto.randomUUID(), ts: new Date().toISOString(), message: "Branch name is required.", tone: "info" as const }].slice(-80)
        };
      });
      return;
    }
    if (/\s/.test(branch)) {
      setGitActivityByProjectId((prev) => {
        const existing = prev[activeProjectId ?? ""] ?? [];
        return {
          ...prev,
          [activeProjectId ?? ""]: [...existing, { id: crypto.randomUUID(), ts: new Date().toISOString(), message: "Branch name cannot contain spaces.", tone: "info" as const }].slice(-80)
        };
      });
      return;
    }

    const exists = activeGitState.branches.some((item) => item.name === branch);
    if (exists) {
      await checkoutBranch(branch);
      setIsBranchDropdownOpen(false);
      setGitBranchSearch("");
      return;
    }

    await runGitAction("create-branch", (projectId) => api.git.createBranch({ projectId, branch, checkout: true }));
    setIsBranchDropdownOpen(false);
    setGitBranchSearch("");
  };

  const toggleSharedGitHistory = async () => {
    if (!activeProjectId) {
      return;
    }
    const nextExpanded = !activeGitSharedHistoryExpanded;
    setGitSharedHistoryExpandedByProjectId((prev) => ({
      ...prev,
      [activeProjectId]: nextExpanded
    }));
    if (!nextExpanded) {
      return;
    }
    try {
      await loadGitSharedHistory(activeProjectId);
    } catch (error) {
      setLogs((prev) => [...prev, `Git shared history failed: ${String(error)}`]);
    }
  };
  const parseTerminalPopoutKey = (key: string): { projectId: string; commandId: string } | null => {
    const splitIndex = key.indexOf(":");
    if (splitIndex < 1 || splitIndex >= key.length - 1) {
      return null;
    }
    return {
      projectId: key.slice(0, splitIndex),
      commandId: key.slice(splitIndex + 1)
    };
  };
  const terminalPopupTheme = isLightTheme
    ? {
        colorScheme: "light",
        bodyBg: "#f8fafc",
        shellBg: "#f1f5f9",
        shellBorder: "#cbd5e1",
        cardBg: "#ffffff",
        outputBg: "#f8fafc",
        text: "#0f172a",
        muted: "#475569",
        buttonText: "#334155",
        buttonHoverBg: "#e2e8f0",
        buttonHoverText: "#0f172a"
      }
    : {
        colorScheme: "dark",
        bodyBg: "#0b0d10",
        shellBg: "#0f1013",
        shellBorder: "#2f2f2f",
        cardBg: "#121212",
        outputBg: "#0a0a0a",
        text: "#e2e8f0",
        muted: "#94a3b8",
        buttonText: "#cbd5e1",
        buttonHoverBg: "#1f2937",
        buttonHoverText: "#ffffff"
      };

  const ensureGhosttyReady = useCallback(() => {
    if (!ghosttyInitPromiseRef.current) {
      ghosttyInitPromiseRef.current = initGhostty();
    }
    return ghosttyInitPromiseRef.current;
  }, []);

  const disposeTerminalPopoutInstance = useCallback((key: string) => {
    const existing = terminalPopoutInstancesRef.current[key];
    if (!existing) {
      return;
    }
    existing.terminal.dispose();
    delete terminalPopoutInstancesRef.current[key];
  }, []);

  const syncActionTerminalOutput = useCallback((instance: ActionTerminalPopoutInstance, output: string) => {
    const nextOutput = output || "";
    const previousOutput = instance.renderedOutput;
    const terminal = instance.terminal;

    if (!nextOutput) {
      terminal.reset();
      instance.renderedOutput = "";
      return;
    }

    if (previousOutput && nextOutput.startsWith(previousOutput)) {
      const delta = nextOutput.slice(previousOutput.length);
      if (delta) {
        terminal.write(delta);
      }
    } else if (previousOutput !== nextOutput) {
      terminal.reset();
      terminal.write(nextOutput);
    }

    instance.renderedOutput = nextOutput;
    terminal.scrollToBottom();
  }, []);

  const ensureTerminalPopoutFrame = (popout: Window) => {
    const doc = popout.document;
    if (doc.getElementById("codeapp-terminal-popout")) {
      return;
    }
    doc.open();
    doc.write(`<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Terminal Output</title>
    <style>
      :root { color-scheme: ${terminalPopupTheme.colorScheme}; font-family: "Space Grotesk", "Avenir Next", sans-serif; }
      * { box-sizing: border-box; }
      html, body { margin: 0; background: ${terminalPopupTheme.bodyBg}; color: ${terminalPopupTheme.text}; height: 100%; }
      body { overflow: hidden; }
      .shell { height: 100vh; display: flex; flex-direction: column; }
      .head { display: flex; align-items: center; justify-content: space-between; gap: 8px; min-height: 48px; padding: 8px 10px; border-bottom: 1px solid ${terminalPopupTheme.shellBorder}; background: ${terminalPopupTheme.shellBg}; -webkit-app-region: drag; }
      .head.macos { padding-left: 5rem; }
      .meta { min-width: 0; }
      .brand { display: flex; align-items: center; gap: 8px; min-width: 0; }
      .icon { width: 26px; height: 26px; border-radius: 8px; }
      .title { font-size: 13px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: ${terminalPopupTheme.text}; }
      .command { font-size: 11px; color: ${terminalPopupTheme.muted}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .controls { display: flex; align-items: center; gap: 6px; -webkit-app-region: no-drag; }
      .btn { height: 30px; border: 1px solid transparent; border-radius: 8px; background: transparent; color: ${terminalPopupTheme.buttonText}; padding: 0 10px; font-size: 12px; cursor: pointer; }
      .btn:hover { background: ${terminalPopupTheme.buttonHoverBg}; color: ${terminalPopupTheme.buttonHoverText}; }
      .btn:disabled { opacity: 0.45; cursor: default; }
      .window-btn { width: 34px; height: 28px; border: 0; border-radius: 8px; background: transparent; color: ${terminalPopupTheme.buttonText}; font-size: 13px; cursor: pointer; }
      .window-btn:hover { background: ${terminalPopupTheme.buttonHoverBg}; color: ${terminalPopupTheme.buttonHoverText}; }
      .window-btn.close:hover { background: rgba(239, 68, 68, 0.2); color: #fee2e2; }
      .status { font-size: 11px; color: ${terminalPopupTheme.muted}; min-width: 50px; text-align: right; }
      .output { flex: 1; min-height: 0; overflow: hidden; background: ${terminalPopupTheme.outputBg}; padding: 10px; }
      #terminal-output { width: 100%; height: 100%; border-radius: 10px; overflow: hidden; }
      #terminal-output canvas { display: block; }
      #terminal-output textarea { position: absolute; opacity: 0; pointer-events: none; }
    </style>
  </head>
  <body>
    <div id="codeapp-terminal-popout" class="shell">
      <div class="head${isMacOS ? " macos" : ""}">
        <div class="brand">
          <img src="${appIconSrc}" class="icon" alt="" />
          <div class="meta">
            <div id="terminal-title" class="title">GameraCode - Terminal</div>
            <div id="terminal-command" class="command"></div>
          </div>
        </div>
        <div class="controls">
          <button id="terminal-start" class="btn">Start</button>
          <button id="terminal-restart" class="btn">Restart</button>
          <button id="terminal-stop" class="btn">Stop</button>
          <button id="terminal-copy" class="btn">Copy</button>
          <span id="terminal-status" class="status"></span>
          ${useWindowsStyleHeader
            ? `<button id="windowMinBtn" class="window-btn" title="Minimize">&#8722;</button>
          <button id="windowMaxBtn" class="window-btn" title="Maximize or restore">&#9723;</button>
          <button id="windowCloseBtn" class="window-btn close" title="Close">&times;</button>`
            : ""}
        </div>
      </div>
      <div class="output"><div id="terminal-output"></div></div>
    </div>
  </body>
</html>`);
    doc.close();
    const copyButton = doc.getElementById("terminal-copy");
    const startButton = doc.getElementById("terminal-start");
    const restartButton = doc.getElementById("terminal-restart");
    const stopButton = doc.getElementById("terminal-stop");
    const windowMinBtn = doc.getElementById("windowMinBtn");
    const windowMaxBtn = doc.getElementById("windowMaxBtn");
    const windowCloseBtn = doc.getElementById("windowCloseBtn");
    const dispatchTerminalAction = (action: "start" | "restart" | "stop") => {
      const shell = popout as Window & {
        __codeappTerminalCommandId?: string;
      };
      const commandId = shell.__codeappTerminalCommandId;
      if (!commandId) {
        return;
      }
      const hostWindow =
        (popout.opener as Window & { __codeappTerminalPopoutAction?: (action: string, commandId: string) => void } | null) ??
        (window as Window & { __codeappTerminalPopoutAction?: (action: string, commandId: string) => void });
      if (typeof hostWindow.__codeappTerminalPopoutAction === "function") {
        hostWindow.__codeappTerminalPopoutAction(action, commandId);
      }
    };
    startButton?.addEventListener("click", () => dispatchTerminalAction("start"));
    restartButton?.addEventListener("click", () => dispatchTerminalAction("restart"));
    stopButton?.addEventListener("click", () => dispatchTerminalAction("stop"));
    copyButton?.addEventListener("click", () => {
      const status = doc.getElementById("terminal-status");
      const key = Object.entries(terminalPopoutWindowsRef.current).find(([, value]) => value === popout)?.[0];
      const instance = key ? terminalPopoutInstancesRef.current[key] : undefined;
      const text = instance
        ? (instance.terminal.hasSelection() ? instance.terminal.getSelection() : (instance.terminal.selectAll(), instance.terminal.getSelection()))
        : "";
      if (instance && !instance.terminal.hasSelection()) {
        instance.terminal.clearSelection();
      }
      if (!text) {
        return;
      }
      navigator.clipboard
        .writeText(text)
        .then(() => {
          if (status) {
            status.textContent = "Copied";
            window.setTimeout(() => {
              if (status.textContent === "Copied") {
                status.textContent = "";
              }
            }, 1400);
          }
        })
        .catch(() => {
          if (status) {
            status.textContent = "Copy failed";
          }
        });
    });
    const desktopApi = (popout as Window & { desktopAPI?: typeof api }).desktopAPI;
    const syncWindowState = async () => {
      if (!desktopApi?.windowControls || !windowMaxBtn) {
        return;
      }
      const state = await desktopApi.windowControls.isMaximized();
      if (state?.ok) {
        windowMaxBtn.textContent = state.maximized ? "\u2750" : "\u25A1";
      }
    };
    windowMinBtn?.addEventListener("click", () => {
      if (!desktopApi?.windowControls) {
        popout.close();
        return;
      }
      desktopApi.windowControls.minimize().catch(() => undefined);
    });
    windowMaxBtn?.addEventListener("click", async () => {
      if (!desktopApi?.windowControls) {
        return;
      }
      const state = await desktopApi.windowControls.toggleMaximize();
      if (state?.ok) {
        (windowMaxBtn as HTMLButtonElement).textContent = state.maximized ? "❐" : "□";
      }
    });
    windowCloseBtn?.addEventListener("click", () => {
      if (!desktopApi?.windowControls) {
        popout.close();
        return;
      }
      desktopApi.windowControls.close().catch(() => undefined);
    });
    syncWindowState().catch(() => undefined);
  };

  const ensureTerminalPopoutInstance = useCallback(
    async (key: string, popout: Window, projectId: string, terminal: ProjectTerminalState["terminals"][number]) => {
      const existing = terminalPopoutInstancesRef.current[key];
      if (existing) {
        existing.projectId = projectId;
        existing.commandId = terminal.commandId;
        existing.terminalName = terminal.name;
        return existing;
      }

      ensureTerminalPopoutFrame(popout);
      await ensureGhosttyReady();

      const container = popout.document.getElementById("terminal-output");
      if (!container) {
        throw new Error("Interactive terminal container not found.");
      }

      const interactiveTerminal = new GhosttyWebTerminal({
        cursorBlink: true,
        cursorStyle: "bar",
        fontFamily: '"Cascadia Mono", "Fira Code", Consolas, "Courier New", monospace',
        fontSize: 12,
        scrollback: 2000,
        allowTransparency: true,
        theme: {
          background: "#00000000",
          foreground: terminalPopupTheme.text,
          cursor: "#94a3b8",
          selectionBackground: "#33415580"
        }
      });
      const fitAddon = new GhosttyFitAddon();
      interactiveTerminal.loadAddon(fitAddon);
      interactiveTerminal.open(container as HTMLElement);
      interactiveTerminal.registerLinkProvider(new OSC8LinkProvider(interactiveTerminal));
      interactiveTerminal.registerLinkProvider(new UrlRegexProvider(interactiveTerminal));
      fitAddon.fit();
      fitAddon.observeResize();
      const initialDimensions = fitAddon.proposeDimensions();
      if (initialDimensions) {
        api.projectTerminal.resize({
          projectId,
          commandId: terminal.commandId,
          cols: initialDimensions.cols,
          rows: initialDimensions.rows
        }).catch((error) => {
          appendLog(`Interactive terminal resize failed for ${terminal.name}: ${String(error)}`);
        });
      }

      interactiveTerminal.onData((data) => {
        if (!data) {
          return;
        }
        const current = terminalPopoutInstancesRef.current[key];
        if (!current) {
          return;
        }
        api.projectTerminal.write({ projectId: current.projectId, commandId: current.commandId, data }).then((result) => {
          if (!result?.ok) {
            appendLog(`Interactive terminal input failed for ${current.terminalName}.`);
          }
        }).catch((error) => {
          const latest = terminalPopoutInstancesRef.current[key];
          appendLog(`Interactive terminal input failed for ${latest?.terminalName ?? terminal.name}: ${String(error)}`);
        });
      });
      interactiveTerminal.onResize(({ cols, rows }) => {
        const current = terminalPopoutInstancesRef.current[key];
        if (!current) {
          return;
        }
        api.projectTerminal.resize({ projectId: current.projectId, commandId: current.commandId, cols, rows }).catch((error) => {
          appendLog(`Interactive terminal resize failed for ${current.terminalName}: ${String(error)}`);
        });
      });

      const instance: ActionTerminalPopoutInstance = {
        terminal: interactiveTerminal,
        fitAddon,
        renderedOutput: "",
        projectId,
        commandId: terminal.commandId,
        terminalName: terminal.name
      };
      terminalPopoutInstancesRef.current[key] = instance;
      syncActionTerminalOutput(instance, terminal.outputTail || "");
      return instance;
    },
    [appendLog, ensureGhosttyReady, syncActionTerminalOutput, terminalPopupTheme.text]
  );

  const renderTerminalPopout = async (
    key: string,
    popout: Window,
    projectId: string,
    terminal: ProjectTerminalState["terminals"][number],
    projectName?: string
  ) => {
    if (popout.closed) {
      return;
    }
    ensureTerminalPopoutFrame(popout);
    const doc = popout.document;
    const title = projectName?.trim() ? `${terminal.name} - ${projectName}` : terminal.name;
    popout.document.title = title;
    const titleElement = doc.getElementById("terminal-title");
    if (titleElement) {
      titleElement.textContent = title;
    }
    const commandElement = doc.getElementById("terminal-command");
    if (commandElement) {
      commandElement.textContent = terminal.command;
    }
    const shell = popout as Window & { __codeappTerminalCommandId?: string };
    shell.__codeappTerminalCommandId = terminal.commandId;
    const statusElement = doc.getElementById("terminal-status");
    if (statusElement) {
      statusElement.textContent = terminal.running ? "Running" : "Stopped";
    }
    const startButton = doc.getElementById("terminal-start") as HTMLButtonElement | null;
    if (startButton) {
      startButton.disabled = terminal.running;
      startButton.style.display = terminal.running ? "none" : "";
    }
    const restartButton = doc.getElementById("terminal-restart") as HTMLButtonElement | null;
    if (restartButton) {
      restartButton.disabled = !terminal.running;
      restartButton.style.display = terminal.running ? "" : "none";
    }
    const stopButton = doc.getElementById("terminal-stop") as HTMLButtonElement | null;
    if (stopButton) {
      stopButton.disabled = !terminal.running;
      stopButton.style.display = terminal.running ? "" : "none";
    }
    const instance = await ensureTerminalPopoutInstance(key, popout, projectId, terminal);
    instance.projectId = projectId;
    instance.commandId = terminal.commandId;
    instance.terminalName = terminal.name;
    syncActionTerminalOutput(instance, terminal.outputTail || "");
    instance.fitAddon.fit();
    if (terminal.running) {
      instance.terminal.focus();
    }
  };

  const clearClosedTerminalPopouts = () => {
    const closedKeys = Object.entries(terminalPopoutWindowsRef.current)
      .filter(([, popout]) => !popout || popout.closed)
      .map(([key]) => key);
    if (closedKeys.length === 0) {
      return;
    }
    closedKeys.forEach((key) => {
      disposeTerminalPopoutInstance(key);
      delete terminalPopoutWindowsRef.current[key];
    });
    setTerminalPopoutByKey((prev) => {
      if (closedKeys.every((key) => !prev[key])) {
        return prev;
      }
      const next = { ...prev };
      closedKeys.forEach((key) => {
        delete next[key];
      });
      return next;
    });
  };

  const attachTerminalPopoutCloseListener = (key: string, popout: Window) => {
    const handleClose = () => {
      disposeTerminalPopoutInstance(key);
      delete terminalPopoutWindowsRef.current[key];
      setTerminalPopoutByKey((prev) => {
        if (!prev[key]) {
          return prev;
        }
        const next = { ...prev };
        delete next[key];
        return next;
      });
    };
    popout.addEventListener("beforeunload", handleClose, { once: true });
  };

  const openTerminalPopout = (terminal: ProjectTerminalState["terminals"][number]) => {
    if (!activeProjectId) {
      return;
    }
    const key = getTerminalPopoutKey(activeProjectId, terminal.commandId);
    const existing = terminalPopoutWindowsRef.current[key];
    if (existing && !existing.closed) {
      void renderTerminalPopout(key, existing, activeProjectId, terminal, activeProject?.name).catch((error) => {
        appendLog(`Terminal pop-out render failed: ${String(error)}`);
      });
      existing.focus();
      setTerminalPopoutByKey((prev) => ({ ...prev, [key]: true }));
      return;
    }
    const name = `codeapp-terminal-${key.replace(/[^a-zA-Z0-9_-]/g, "_")}`;
    const popout = window.open("", name, "popup=yes,width=940,height=720,resizable=yes,scrollbars=yes");
    if (!popout) {
      setLogs((prev) => [...prev, `Terminal pop-out blocked for ${terminal.name}.`]);
      return;
    }
    terminalPopoutWindowsRef.current[key] = popout;
    void renderTerminalPopout(key, popout, activeProjectId, terminal, activeProject?.name).catch((error) => {
      appendLog(`Terminal pop-out render failed: ${String(error)}`);
    });
    setTerminalPopoutByKey((prev) => ({ ...prev, [key]: true }));
    attachTerminalPopoutCloseListener(key, popout);
  };

  const closeTerminalPopout = (key: string) => {
    const popout = terminalPopoutWindowsRef.current[key];
    disposeTerminalPopoutInstance(key);
    if (popout && !popout.closed) {
      popout.close();
    }
    delete terminalPopoutWindowsRef.current[key];
    setTerminalPopoutByKey((prev) => {
      if (!prev[key]) {
        return prev;
      }
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  const copyTerminalOutput = (terminalName: string, output: string) => {
    const text = output.trim();
    if (!text) {
      return;
    }
    navigator.clipboard.writeText(text).catch((error) => {
      setLogs((prev) => [...prev, `Copy terminal output failed for ${terminalName}: ${String(error)}`]);
    });
  };

  const reloadPreviewPane = () => {
    if (activeProjectBrowserMode === "default_browser") {
      return;
    }
    const webview = previewWebviewRef.current as { reload?: () => void } | null;
    webview?.reload?.();
  };

  const openPreviewInDefaultBrowser = async () => {
    if (!activeProjectPreviewUrl) {
      return;
    }
    await api.preview.openExternal({ url: activeProjectPreviewUrl });
  };

  const popoutPreview = async () => {
    if (!activeProjectPreviewUrl || !activeProjectBrowserEnabled) {
      return;
    }
    if (activeProjectBrowserMode === "default_browser") {
      await openPreviewInDefaultBrowser();
      return;
    }
    await api.preview.openPopout({ url: activeProjectPreviewUrl, projectId: activeProjectId ?? undefined, projectName: activeProject?.name });
    setIsPreviewPoppedOut(true);
  };

  const closePopoutPreview = async () => {
    await api.preview.closePopout();
    setIsPreviewPoppedOut(false);
  };

  const openPreviewDevTools = async () => {
    if (activeProjectBrowserMode === "default_browser") {
      return;
    }
    if (isPreviewPoppedOut) {
      await api.preview.openDevTools();
      return;
    }
    const webview = previewWebviewRef.current as { openDevTools?: () => void } | null;
    webview?.openDevTools?.();
  };

  const openGitPopout = async () => {
    if (!activeProjectId) {
      return;
    }
    await api.git.openPopout({ projectId: activeProjectId, projectName: activeProject?.name });
    setIsGitPoppedOut(true);
  };

  const closeGitPopout = async () => {
    await api.git.closePopout();
    setIsGitPoppedOut(false);
  };

  const openProjectTerminal = async (terminalId?: string) => {
    if (!activeProjectId) {
      return;
    }
    await api.projects.openTerminal({ projectId: activeProjectId, terminalId });
  };

  const openProjectFiles = async () => {
    if (!activeProjectId) {
      return;
    }
    await api.projects.openFiles({ projectId: activeProjectId });
  };

  const openProjectWebLink = async (link: ProjectWebLink, focus = true) => {
    const normalized = normalizeWebLinkUrl(link.url);
    if (!normalized) {
      setLogs((prev) => [...prev, `Invalid web link URL for "${link.name}".`]);
      return;
    }

    await api.projects.openWebLink({
      url: normalized,
      name: link.name.trim() || undefined,
      projectName: selectedProject?.name,
      focus
    });
  };

  const openComposerDropdown = (kind: ComposerDropdownKind, trigger: HTMLButtonElement | null) => {
    if (!trigger) {
      return;
    }
    const rect = trigger.getBoundingClientRect();
    const modelDropdownWidth =
      visibleModelHarnesses.length <= 1
        ? visibleModelHarnesses[0]?.id === "opencode"
          ? 560
          : 300
        : 860;
    const width = kind === "model" ? Math.min(window.innerWidth - 16, modelDropdownWidth) : Math.max(180, rect.width);
    const left =
      kind === "model"
        ? Math.min(Math.max(8, rect.right - width), Math.max(8, window.innerWidth - width - 8))
        : Math.min(Math.max(8, rect.left), Math.max(8, window.innerWidth - width - 8));
    setComposerDropdown((prev) => {
      if (prev?.kind === kind) {
        return null;
      }
      return {
        kind,
        bottom: Math.max(8, window.innerHeight - rect.top + 6),
        left,
        width
      };
    });
  };

  const createThread = async (
    projectId = activeProjectId,
    title = "New thread",
    harnessId: HarnessId = settings.defaultHarnessId ?? "codex"
  ) => {
    if (!projectId) {
      setLogs((prev) => [...prev, "Create or select a project first."]);
      return;
    }

    const thread = await api.threads.create({
      projectId,
      title: title.trim() || "New thread",
      harnessId,
      provider: harnessId
    });

    await loadThreads();
    setActiveProjectId(projectId);
    setActiveThreadId(thread.id);
    setThreadMenuProjectId(null);
    setThreadDraftTitle("New thread");
  };

  const openThreadCreationMenu = useCallback(
    (projectId = activeProjectId) => {
      if (!projectId) {
        setLogs((prev) => [...prev, "Create or select a project first."]);
        return;
      }
      setActiveProjectId(projectId);
      setThreadMenuProjectId(projectId);
      setThreadDraftTitle("New thread");
      window.requestAnimationFrame(() => {
        threadCreateInputRef.current?.focus();
        threadCreateInputRef.current?.select();
      });
    },
    [activeProjectId]
  );

  const canSwitchActiveThreadHarness =
    Boolean(activeThreadId) && !hasUserPromptInThread && activeRunState !== "running";

  const selectHarnessModel = async (harnessId: HarnessId, model: string) => {
    if (!activeThreadId) {
      return;
    }

    if (activeHarnessId !== harnessId) {
      if (!canSwitchActiveThreadHarness) {
        setLogs((prev) => [...prev, "Create a new thread to switch harnesses after a conversation has started."]);
        return;
      }
      await api.threads.update({
        id: activeThreadId,
        harnessId,
        provider: harnessId
      });
      await loadThreads();
    }

    setComposerOptions((prev) => ({
      ...getHarnessOptionsFromSettings(settings, harnessId),
      ...prev,
      model
    }));
  };

  const openDefaultTerminalFromShortcut = useCallback(() => {
    if (!activeProjectId) {
      setLogs((prev) => [...prev, "Create or select a project first."]);
      return;
    }
    openProjectTerminal().catch((error) => {
      setLogs((prev) => [...prev, `Open terminal failed: ${String(error)}`]);
    });
  }, [activeProjectId, openProjectTerminal]);

  const runShortcutByKey = useCallback(
    (key: string) => {
      if (key === "n") {
        openThreadCreationMenu();
        return;
      }
      if (key === "t") {
        openDefaultTerminalFromShortcut();
        return;
      }
      openAppSettingsWindow().catch((error) => {
        setLogs((prev) => [...prev, `Open settings window failed: ${String(error)}`]);
      });
    },
    [openDefaultTerminalFromShortcut, openThreadCreationMenu]
  );

  useEffect(() => {
    const syncCtrlSwitchHintVisibility = (event: KeyboardEvent) => {
      setIsCtrlSwitchHintVisible(event.altKey);
    };

    const hideCtrlSwitchHintVisibility = () => {
      setIsCtrlSwitchHintVisible(false);
    };

    window.addEventListener("keydown", syncCtrlSwitchHintVisibility);
    window.addEventListener("keyup", syncCtrlSwitchHintVisibility);
    window.addEventListener("blur", hideCtrlSwitchHintVisibility);

    return () => {
      window.removeEventListener("keydown", syncCtrlSwitchHintVisibility);
      window.removeEventListener("keyup", syncCtrlSwitchHintVisibility);
      window.removeEventListener("blur", hideCtrlSwitchHintVisibility);
    };
  }, []);

  useEffect(() => {
    const syncAltThreadSwitchHintVisibility = (event: KeyboardEvent) => {
      setIsAltThreadSwitchHintVisible(event.ctrlKey);
    };

    const hideAltThreadSwitchHintVisibility = () => {
      setIsAltThreadSwitchHintVisible(false);
    };

    window.addEventListener("keydown", syncAltThreadSwitchHintVisibility);
    window.addEventListener("keyup", syncAltThreadSwitchHintVisibility);
    window.addEventListener("blur", hideAltThreadSwitchHintVisibility);

    return () => {
      window.removeEventListener("keydown", syncAltThreadSwitchHintVisibility);
      window.removeEventListener("keyup", syncAltThreadSwitchHintVisibility);
      window.removeEventListener("blur", hideAltThreadSwitchHintVisibility);
    };
  }, []);

  useEffect(() => {
    const onGlobalShortcut = (event: KeyboardEvent) => {
      if (event.isComposing || event.repeat) {
        return;
      }
      if (event.ctrlKey && !event.altKey && !event.metaKey && !event.shiftKey) {
        const alphaKey = event.key.toLowerCase();
        if (alphaKey === "a") {
          if (toggleArchivedThreadsForActiveProject()) {
            event.preventDefault();
          }
          return;
        }
        const digitKey = /^[1-9]$/.test(event.key)
          ? event.key
          : event.code.startsWith("Digit") && /^[1-9]$/.test(event.code.slice(5))
            ? event.code.slice(5)
            : null;
        if (digitKey) {
          if (focusThreadByShortcutIndex(Number(digitKey) - 1)) {
            event.preventDefault();
          }
          return;
        }
      }
      const usesProjectSwitchModifier = event.altKey;
      const usesPlatformModifier = isMacOS ? event.metaKey : event.ctrlKey;
      if (usesProjectSwitchModifier && !event.shiftKey && !event.ctrlKey && !event.metaKey) {
        const key = event.key.toLowerCase();
        if (/^[1-9]$/.test(key)) {
          if (focusProjectByShortcutIndex(Number(key) - 1)) {
            event.preventDefault();
          }
          return;
        }
      }
      if (!usesPlatformModifier) {
        return;
      }
      const actionHotkey = actionHotkeyFromKeyboardEvent(event);
      if (actionHotkey && activeProjectId) {
        const matchingCommand = activeProjectSettings?.devCommands.find(
          (command) => normalizeActionHotkey(command.hotkey ?? "") === actionHotkey
        );
        const commandId = matchingCommand?.id?.trim();
        if (commandId) {
          const terminal = activeProjectTerminals.find((item) => item.commandId === commandId);
          const task = terminal?.running
            ? stopActiveProjectTerminal(commandId)
            : startActiveProjectTerminal(commandId);
          task.catch((error) => {
            setLogs((prev) => [...prev, `Action hotkey failed: ${String(error)}`]);
          });
          event.preventDefault();
          return;
        }
      }
      if (event.shiftKey || event.altKey) {
        return;
      }
      const key = event.key.toLowerCase();
      if (isEditableKeyboardTarget(event.target)) {
        return;
      }
      if (key !== "n" && key !== "t" && key !== "i") {
        return;
      }

      event.preventDefault();
      runShortcutByKey(key);
    };

    window.addEventListener("keydown", onGlobalShortcut);
    return () => {
      window.removeEventListener("keydown", onGlobalShortcut);
    };
  }, [
    activeProjectId,
    activeProjectSettings?.devCommands,
    activeProjectTerminals,
    focusProjectByShortcutIndex,
    focusThreadByShortcutIndex,
    runShortcutByKey,
    startActiveProjectTerminal,
    stopActiveProjectTerminal,
    toggleArchivedThreadsForActiveProject
  ]);

  useEffect(() => {
    if (isMacOS) {
      return;
    }
    let cancelled = false;
    api.windowControls
      .isMaximized()
      .then((result) => {
        if (!cancelled && result.ok) {
          setIsWindowMaximized(result.maximized);
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  const minimizeWindow = async () => {
    try {
      await api.windowControls.minimize();
    } catch (error) {
      setLogs((prev) => [...prev, `Window minimize failed: ${String(error)}`]);
    }
  };

  const toggleMaximizeWindow = async () => {
    try {
      const result = await api.windowControls.toggleMaximize();
      if (result.ok) {
        setIsWindowMaximized(result.maximized);
      }
    } catch (error) {
      setLogs((prev) => [...prev, `Window maximize toggle failed: ${String(error)}`]);
    }
  };

  const closeWindow = async () => {
    try {
      await api.windowControls.close();
    } catch (error) {
      setLogs((prev) => [...prev, `Window close failed: ${String(error)}`]);
    }
  };

  const focusProjectFromSidebar = async (projectId: string) => {
    const project = projects.find((item) => item.id === projectId) ?? null;
    if (project) {
      setActiveWorkspaceId(project.workspaceId);
    }
    setActiveProjectId(projectId);
    const mostRecentActiveThread = sortThreadsForSidebar(
      threads.filter((thread) => thread.projectId === projectId && !thread.archivedAt)
    )[0];

    if (mostRecentActiveThread) {
      setActiveThreadId(mostRecentActiveThread.id);
      return;
    }

    await createThread(projectId);
  };

  function focusProjectByShortcutIndex(index: number) {
    const targetProject = projectsInActiveWorkspace[index];
    if (!targetProject) {
      return false;
    }
    focusProjectFromSidebar(targetProject.id).catch((error) => {
      setLogs((prev) => [...prev, `Project switch failed: ${String(error)}`]);
    });
    return true;
  }

  function focusThreadByShortcutIndex(index: number) {
    if (!activeProjectId) {
      return false;
    }
    const threadRows = threadRowsByProjectId[activeProjectId];
    if (!threadRows) {
      return false;
    }
    const showArchived = Boolean(showArchivedByProjectId[activeProjectId]);
    const visibleThreadRows = showArchived ? [...threadRows.active, ...threadRows.archived] : threadRows.active;
    const targetRow = visibleThreadRows[index];
    if (!targetRow) {
      return false;
    }
    activateThreadFromSidebar(activeProjectId, targetRow.thread.id);
    return true;
  }

  function toggleArchivedThreadsForActiveProject() {
    if (!activeProjectId) {
      return false;
    }
    const threadRows = threadRowsByProjectId[activeProjectId];
    if (!threadRows || threadRows.archived.length === 0) {
      return false;
    }
    setShowArchivedByProjectId((prev) => ({
      ...prev,
      [activeProjectId]: !(prev[activeProjectId] ?? false)
    }));
    return true;
  }

  const focusWorkspace = async (workspaceId: string) => {
    setActiveWorkspaceId(workspaceId);
    const workspaceProjects = projects.filter((project) => project.workspaceId === workspaceId);
    const workspaceProjectIds = new Set(workspaceProjects.map((project) => project.id));
    const mostRecentThread = sortThreadsForSidebar(
      threads.filter((thread) => !thread.archivedAt && workspaceProjectIds.has(thread.projectId))
    )[0];

    if (mostRecentThread) {
      setActiveProjectId(mostRecentThread.projectId);
      setActiveThreadId(mostRecentThread.id);
      clearCompletedThreadFlash(mostRecentThread.id);
      clearFinishedUnreadThread(mostRecentThread.id);
      return;
    }

    const fallbackProject = workspaceProjects[0];
    if (fallbackProject) {
      setActiveProjectId(fallbackProject.id);
      await createThread(fallbackProject.id);
      return;
    }

    setActiveProjectId(null);
    setActiveThreadId(null);
  };

  const openCreateWorkspaceModal = () => {
    setWorkspaceModalMode("create");
    setWorkspaceEditingId(null);
    setWorkspaceModalInitialDraft({
      name: "",
      color: "#64748b",
      moveProjectIds: []
    });
    setShowWorkspaceModal(true);
  };

  const renameWorkspaceFromHeaderMenu = async (workspaceId: string) => {
    const workspace = workspaceById[workspaceId];
    if (!workspace) {
      return;
    }
    const nextNameRaw = window.prompt("Rename workspace", workspace.name) ?? "";
    const nextName = nextNameRaw.trim();
    if (!nextName) {
      return;
    }
    if (nextName === workspace.name.trim()) {
      return;
    }
    await api.workspaces.update({
      id: workspace.id,
      name: nextName
    });
    await loadWorkspaces();
  };

  const setWorkspaceColorFromHeaderMenu = async (workspaceId: string, color: string) => {
    const workspace = workspaceById[workspaceId];
    const nextColor = color.trim();
    if (!workspace || !nextColor) {
      return;
    }
    if (workspace.color.toLowerCase() === nextColor.toLowerCase()) {
      return;
    }
    await api.workspaces.update({
      id: workspace.id,
      color: nextColor
    });
    await loadWorkspaces();
  };

  const deleteWorkspaceFromHeaderMenu = async (workspaceId: string) => {
    const workspace = workspaceById[workspaceId];
    if (!workspace) {
      return;
    }
    if (workspaces.length <= 1) {
      setLogs((prev) => [...prev, "Cannot delete the last workspace."]);
      return;
    }
    const confirmed = window.confirm(
      `Delete workspace "${workspace.name}"?\n\nProjects in this workspace will be removed from GameraCode. Files on disk stay intact.`
    );
    if (!confirmed) {
      return;
    }
    await api.workspaces.delete({ id: workspace.id });
    setShowWorkspaceModal(false);
    await Promise.all([loadWorkspaces(), loadProjectsAndThreads()]);
  };

  const saveWorkspaceFromModal = async (draft: { name: string; color: string; moveProjectIds: string[] }) => {
    const name = draft.name.trim();
    const color = draft.color.trim() || "#64748b";
    if (!name) {
      setLogs((prev) => [...prev, "Workspace name is required."]);
      return;
    }
    if (workspaceModalMode === "create") {
      const created = await api.workspaces.create({
        name,
        icon: "grid",
        color,
        moveProjectIds: draft.moveProjectIds
      });
      await Promise.all([loadWorkspaces(), loadProjectsAndThreads()]);
      setShowWorkspaceModal(false);
      await focusWorkspace(created.id);
      return;
    }
    if (!workspaceEditingId) {
      return;
    }
    await api.workspaces.update({
      id: workspaceEditingId,
      name,
      color
    });
    await loadWorkspaces();
    setShowWorkspaceModal(false);
  };

  const deleteWorkspaceFromModal = async () => {
    if (!workspaceEditingId) {
      return;
    }
    const workspace = workspaceById[workspaceEditingId];
    const confirmed = window.confirm(
      `Delete workspace "${workspace?.name ?? "Workspace"}"?\n\nProjects in this workspace will be removed from GameraCode. Files on disk stay intact.`
    );
    if (!confirmed) {
      return;
    }
    await api.workspaces.delete({ id: workspaceEditingId });
    setShowWorkspaceModal(false);
    await Promise.all([loadWorkspaces(), loadProjectsAndThreads()]);
  };

  const setThreadArchived = async (thread: Thread, archived: boolean) => {
    if (archived && thread.pinnedAt) {
      setLogs((prev) => [...prev, "Unpin the thread before archiving it."]);
      return;
    }
    await api.threads.archive({ id: thread.id, archived });
    if (archived && activeThreadId === thread.id) {
      const fallback = threads.find((item) => item.projectId === thread.projectId && !item.archivedAt && item.id !== thread.id);
      setActiveThreadId(fallback?.id ?? null);
    }
    await loadThreads();
  };

  const deleteThread = async (thread: Thread) => {
    const confirmed = window.confirm(
      `Delete thread "${thread.title}"?\n\nThis permanently deletes the thread and any sub-threads from GameraCode. Files on disk stay intact.`
    );
    if (!confirmed) {
      return;
    }

    const currentThreads = threadsRef.current;
    const descendants = new Set<string>();
    const stack = [thread.id];
    while (stack.length > 0) {
      const currentId = stack.pop();
      if (!currentId || descendants.has(currentId)) {
        continue;
      }
      descendants.add(currentId);
      currentThreads.forEach((item) => {
        if (item.parentThreadId === currentId) {
          stack.push(item.id);
        }
      });
    }

    await api.threads.delete({ id: thread.id });

    if (activeThreadId && descendants.has(activeThreadId)) {
      const remaining = currentThreads.filter((item) => !descendants.has(item.id));
      const fallback =
        remaining.find((item) => item.projectId === thread.projectId && !item.archivedAt) ??
        remaining.find((item) => item.projectId === thread.projectId);
      setActiveThreadId(fallback?.id ?? null);
    }

    await loadThreads();
  };

  const deleteArchivedThreadsInProject = async (projectId: string) => {
    const currentThreads = threadsRef.current;
    const archivedInProject = currentThreads.filter((thread) => thread.projectId === projectId && Boolean(thread.archivedAt));
    if (archivedInProject.length === 0) {
      return;
    }

    const confirmed = window.confirm(
      `Delete ${archivedInProject.length} archived thread${archivedInProject.length === 1 ? "" : "s"}?\n\nThis permanently deletes archived threads and any archived sub-threads from GameraCode. Files on disk stay intact.`
    );
    if (!confirmed) {
      return;
    }

    const archivedById = new Map(archivedInProject.map((thread) => [thread.id, thread]));
    const rootArchivedThreads = archivedInProject.filter(
      (thread) => !thread.parentThreadId || !archivedById.has(thread.parentThreadId)
    );

    for (const thread of rootArchivedThreads) {
      await api.threads.delete({ id: thread.id });
    }

    const deletedIds = new Set(archivedInProject.map((thread) => thread.id));
    if (activeThreadId && deletedIds.has(activeThreadId)) {
      const remaining = currentThreads.filter((thread) => !deletedIds.has(thread.id));
      const fallback =
        remaining.find((thread) => thread.projectId === projectId && !thread.archivedAt) ??
        remaining.find((thread) => thread.projectId === projectId);
      setActiveThreadId(fallback?.id ?? null);
    }

    await loadThreads();
  };

  const setThreadPinned = async (thread: Thread, pinned: boolean) => {
    const updated = await api.threads.update({ id: thread.id, pinned });
    setThreads((prev) => prev.map((item) => (item.id === updated.id ? updated : item)));
  };

  const setThreadColor = async (thread: Thread, color: string) => {
    const updated = await api.threads.update({ id: thread.id, color });
    setThreads((prev) => prev.map((item) => (item.id === updated.id ? updated : item)));
  };

  const getThreadFromContextMenu = () => {
    const threadId = threadContextMenuThreadIdRef.current;
    if (!threadId) {
      return null;
    }
    return threadsRef.current.find((item) => item.id === threadId) ?? null;
  };

  const syncThreadContextMenuVisuals = (thread: Thread) => {
    const pinButton = threadContextMenuButtonRef.current;
    const archiveButton = threadContextMenuArchiveRef.current;
    const unarchiveButton = threadContextMenuUnarchiveRef.current;
    if (pinButton) {
      pinButton.textContent = thread.pinnedAt ? "Unpin thread" : "Pin thread";
    }
    if (archiveButton && unarchiveButton) {
      if (thread.archivedAt) {
        archiveButton.style.display = "none";
        unarchiveButton.style.display = "block";
      } else {
        archiveButton.style.display = "block";
        unarchiveButton.style.display = "none";
      }
    }
    const menu = threadContextMenuRef.current;
    if (!menu) {
      return;
    }
    const swatches = menu.querySelectorAll<HTMLButtonElement>("[data-thread-color]");
    swatches.forEach((swatch) => {
      const swatchColor = (swatch.dataset.threadColor ?? "").toLowerCase();
      const threadColor = (thread.color ?? "").toLowerCase();
      const selected = swatchColor ? threadColor === swatchColor : !threadColor;
      swatch.classList.toggle("is-selected", selected);
      swatch.setAttribute("aria-pressed", selected ? "true" : "false");
    });
  };

  const closeThreadContextMenu = (animated = true) => {
    const menu = threadContextMenuRef.current;
    if (!menu) {
      return;
    }
    if (threadContextMenuCloseTimerRef.current !== null) {
      window.clearTimeout(threadContextMenuCloseTimerRef.current);
      threadContextMenuCloseTimerRef.current = null;
    }
    if (!animated) {
      menu.classList.remove("is-open", "is-closing");
      menu.style.display = "none";
      threadContextMenuThreadIdRef.current = null;
      return;
    }
    menu.classList.remove("is-open");
    menu.classList.add("is-closing");
    threadContextMenuCloseTimerRef.current = window.setTimeout(() => {
      menu.classList.remove("is-closing");
      menu.style.display = "none";
      threadContextMenuCloseTimerRef.current = null;
    }, 130);
    threadContextMenuThreadIdRef.current = null;
  };

  const openThreadContextMenu = (event: ReactMouseEvent, _projectId: string, threadId: string) => {
    event.preventDefault();
    event.stopPropagation();
    const menu = threadContextMenuRef.current;
    if (!menu) {
      return;
    }
    const thread = threadsRef.current.find((item) => item.id === threadId);
    if (!thread) {
      return;
    }
    threadContextMenuThreadIdRef.current = threadId;
    syncThreadContextMenuVisuals(thread);
    if (threadContextMenuCloseTimerRef.current !== null) {
      window.clearTimeout(threadContextMenuCloseTimerRef.current);
      threadContextMenuCloseTimerRef.current = null;
    }
    menu.classList.remove("is-closing");
    const menuWidth = 190;
    const menuHeight = 244;
    const x = Math.min(event.clientX, Math.max(8, window.innerWidth - menuWidth - 8));
    const y = Math.min(event.clientY, Math.max(8, window.innerHeight - menuHeight - 8));
    menu.style.left = `${x}px`;
    menu.style.top = `${y}px`;
    menu.style.display = "block";
    menu.classList.remove("is-open");
    window.requestAnimationFrame(() => {
      menu.classList.add("is-open");
    });
  };

  const handleThreadContextMenuPin = () => {
    const thread = getThreadFromContextMenu();
    if (!thread) {
      closeThreadContextMenu();
      return;
    }
    closeThreadContextMenu();
    setThreadPinned(thread, !thread.pinnedAt).catch((error) => {
      setLogs((prev) => [...prev, `Pin thread failed: ${String(error)}`]);
    });
  };

  const handleThreadContextMenuRename = () => {
    const thread = getThreadFromContextMenu();
    if (!thread) {
      closeThreadContextMenu();
      return;
    }
    closeThreadContextMenu();
    renameThread(thread).catch((error) => {
      setLogs((prev) => [...prev, `Thread rename failed: ${String(error)}`]);
    });
  };

  const handleThreadContextMenuArchive = (archived: boolean) => {
    const thread = getThreadFromContextMenu();
    if (!thread) {
      closeThreadContextMenu();
      return;
    }
    closeThreadContextMenu();
    setThreadArchived(thread, archived).catch((error) => {
      setLogs((prev) => [...prev, `${archived ? "Archive" : "Restore"} thread failed: ${String(error)}`]);
    });
  };

  const handleThreadContextMenuDelete = () => {
    const thread = getThreadFromContextMenu();
    if (!thread) {
      closeThreadContextMenu();
      return;
    }
    closeThreadContextMenu();
    deleteThread(thread).catch((error) => {
      setLogs((prev) => [...prev, `Delete thread failed: ${String(error)}`]);
    });
  };

  const handleThreadContextMenuColor = (color: string) => {
    const thread = getThreadFromContextMenu();
    if (!thread) {
      closeThreadContextMenu();
      return;
    }
    syncThreadContextMenuVisuals({ ...thread, color });
    setThreadColor(thread, color).catch((error) => {
      setLogs((prev) => [...prev, `Set thread color failed: ${String(error)}`]);
    });
  };

  const beginProjectInlineRename = (project: Project) => {
    setEditingProjectId(project.id);
    setEditingProjectName(project.name);
  };

  const submitProjectInlineRename = async (project: Project) => {
    const nextName = editingProjectName.trim();
    if (!nextName || nextName === project.name) {
      setEditingProjectId(null);
      setEditingProjectName("");
      return;
    }
    const updated = await api.projects.update({ id: project.id, name: nextName });
    setProjects((prev) => prev.map((item) => (item.id === updated.id ? updated : item)));
    setEditingProjectId(null);
    setEditingProjectName("");
  };

  const renameThread = async (thread: Thread) => {
    setRenameDialog({
      kind: "thread",
      id: thread.id,
      value: thread.title,
      original: thread.title
    });
  };

  const submitRenameDialog = async () => {
    if (!renameDialog) {
      return;
    }
    const nextValue = renameDialog.value.trim();
    if (!nextValue || nextValue === renameDialog.original) {
      setRenameDialog(null);
      return;
    }
    const updated = await api.threads.update({ id: renameDialog.id, title: nextValue });
    setThreads((prev) => prev.map((item) => (item.id === updated.id ? updated : item)));
    setThreadSummaryById((prev) => ({
      ...prev,
      [updated.id]: suggestThreadSummary(updated.title)
    }));
    setRenameDialog(null);
  };

  useEffect(() => {
    if (!activeThreadId || activePendingUserQuestions.length === 0) {
      return;
    }
    setUserQuestionAnswersByThreadId((prev) => {
      const existing = prev[activeThreadId] ?? {};
      const nextAnswers: Record<string, UserQuestionAnswerState> = {};
      let changed = false;

      activePendingUserQuestions.forEach((question) => {
        const current = existing[question.id];
        if (current) {
          nextAnswers[question.id] = current;
          return;
        }
        changed = true;
        nextAnswers[question.id] = {
          selectedOption: question.options[0]?.label ?? CUSTOM_QUESTION_OPTION_VALUE,
          customValue: ""
        };
      });

      if (Object.keys(existing).some((id) => !(id in nextAnswers))) {
        changed = true;
      }
      if (!changed) {
        return prev;
      }
      return {
        ...prev,
        [activeThreadId]: nextAnswers
      };
    });
  }, [activePendingUserQuestions, activeThreadId]);

  useEffect(() => {
    if (!activeThreadId) {
      return;
    }
    setActiveQuestionIndexByThreadId((prev) => {
      const current = prev[activeThreadId] ?? 0;
      const maxIndex = Math.max(activePendingUserQuestions.length - 1, 0);
      const clamped = Math.max(0, Math.min(current, maxIndex));
      if (current === clamped) {
        return prev;
      }
      return {
        ...prev,
        [activeThreadId]: clamped
      };
    });
  }, [activePendingUserQuestions.length, activeThreadId]);

  const navigateActiveQuestion = (direction: -1 | 1) => {
    if (!activeThreadId || activePendingUserQuestions.length === 0) {
      return;
    }
    setActiveQuestionIndexByThreadId((prev) => {
      const current = prev[activeThreadId] ?? 0;
      const maxIndex = Math.max(activePendingUserQuestions.length - 1, 0);
      const nextIndex = Math.max(0, Math.min(current + direction, maxIndex));
      if (nextIndex === current) {
        return prev;
      }
      return {
        ...prev,
        [activeThreadId]: nextIndex
      };
    });
  };

  const selectQuestionOption = (question: PendingUserQuestion, optionLabel: string) => {
    if (!activeThreadId) {
      return;
    }
    const current = activeUserQuestionAnswers[question.id];
    const alreadySelected = (current?.selectedOption ?? "") === optionLabel;

    setUserQuestionAnswersByThreadId((prev) => ({
      ...prev,
      [activeThreadId]: {
        ...(prev[activeThreadId] ?? {}),
        [question.id]: {
          ...(prev[activeThreadId]?.[question.id] ?? {
            selectedOption: optionLabel,
            customValue: ""
          }),
          selectedOption: optionLabel
        }
      }
    }));

    if (!alreadySelected) {
      return;
    }

    const isLastQuestion = activeQuestionIndex >= activePendingUserQuestions.length - 1;
    if (isLastQuestion) {
      submitRequestedInput().catch((error) => {
        setLogs((prev) => [...prev, `Submit requested input failed: ${String(error)}`]);
      });
      return;
    }
    navigateActiveQuestion(1);
  };

  const submitRequestedInput = async () => {
    if (!activeThreadId || activePendingUserQuestions.length === 0) {
      return;
    }
    if (activeQuestionsRequireAnswer) {
      setLogs((prev) => [...prev, "Please answer all pending questions before sending."]);
      return;
    }

    const answersByQuestionId = Object.fromEntries(
      activePendingUserQuestions.map((question, index) => {
        const answer = activeUserQuestionAnswers[question.id];
        const value =
          answer?.selectedOption === CUSTOM_QUESTION_OPTION_VALUE
            ? answer.customValue.trim()
            : (answer?.selectedOption ?? "").trim();
        const questionId = asString(question.id) ?? `question_${index + 1}`;
        return [questionId, value];
      })
    );

    if (activePendingUserInputRequestId) {
      const result = await api.sessions.submitUserInput({
        threadId: activeThreadId,
        requestId: activePendingUserInputRequestId,
        answersByQuestionId
      });
      if (!result.ok) {
        setLogs((prev) => [...prev, "Submit requested input failed."]);
        return;
      }
    } else {
      const answerLines = activePendingUserQuestions.map((question, index) => {
        const label = asString(question.header) ?? `Question ${index + 1}`;
        return `${label}: ${answersByQuestionId[question.id] ?? ""}`;
      });
      const promptText = `Answers to requested questions:\n${answerLines.map((line) => `- ${line}`).join("\n")}`;
      const prompt: QueuedPrompt = {
        id: crypto.randomUUID(),
        input: promptText,
        attachments: [],
        skills: [],
        options: { ...composerOptions }
      };

      if ((runStateByThreadIdRef.current[activeThreadId] ?? "idle") === "running") {
        setQueuedPromptsByThreadId((prev) => {
          const nextQueue = [...(prev[activeThreadId] ?? []), prompt];
          const next = {
            ...prev,
            [activeThreadId]: nextQueue
          };
          queuedPromptsByThreadIdRef.current = next;
          return next;
        });
      } else {
        await dispatchPromptToThread(activeThreadId, prompt);
      }
    }

    setThreadAwaitingInputById((prev) => {
      if (!prev[activeThreadId]) {
        return prev;
      }
      const next = { ...prev };
      delete next[activeThreadId];
      threadAwaitingInputByIdRef.current = next;
      return next;
    });
    setPendingUserQuestionsByThreadId((prev) => {
      if (!prev[activeThreadId]) {
        return prev;
      }
      const next = { ...prev };
      delete next[activeThreadId];
      pendingUserQuestionsByThreadIdRef.current = next;
      return next;
    });
    setPendingUserInputRequestIdByThreadId((prev) => {
      if (!prev[activeThreadId]) {
        return prev;
      }
      const next = { ...prev };
      delete next[activeThreadId];
      pendingUserInputRequestIdByThreadIdRef.current = next;
      return next;
    });
    setUserQuestionAnswersByThreadId((prev) => {
      if (!prev[activeThreadId]) {
        return prev;
      }
      const next = { ...prev };
      delete next[activeThreadId];
      return next;
    });
    setActiveQuestionIndexByThreadId((prev) => {
      if (!(activeThreadId in prev)) {
        return prev;
      }
      const next = { ...prev };
      delete next[activeThreadId];
      return next;
    });
  };

  const forkThreadFromPrompt = async (thread: Thread, upToStreamSeq: number) => {
    const forked = await api.threads.fork({ id: thread.id, upToStreamSeq });
    setThreads((prev) => [forked, ...prev.filter((item) => item.id !== forked.id)]);
    setActiveProjectId(forked.projectId);
    setActiveThreadId(forked.id);
  };

  const sendPrompt = async () => {
    if (!activeThreadId) return;
    const targetThreadId = activeThreadId;
    if (sendPendingByThreadIdRef.current[targetThreadId]) {
      return;
    }
    const trimmed = composerRef.current.trim();
    const mentionedFiles = composerMentionedFiles;
    if (!trimmed && composerAttachments.length === 0 && mentionedFiles.length === 0) return;
    const targetThread = activeThread;
    const hasStoredSummary = targetThread ? Boolean(threadSummaryById[targetThread.id]?.trim()) : false;
    const shouldRenameThread =
      targetThread &&
      !hasUserPromptInThread &&
      (settings.autoRenameThreadTitles ?? true) &&
      GENERIC_THREAD_TITLES.has(targetThread.title.trim().toLowerCase());
    const shouldGenerateSummary =
      targetThread &&
      !hasUserPromptInThread &&
      !hasStoredSummary;

    const slashSkills = extractSkillsFromInput(trimmed, activeSkills);
    const promptInput = slashSkills.remainder;
    const sendAttachments: PromptAttachment[] = composerAttachments.map((attachment) => ({
      name: attachment.name,
      mimeType: attachment.mimeType,
      dataUrl: attachment.dataUrl,
      size: attachment.size
    }));
    const prompt: QueuedPrompt = {
      id: crypto.randomUUID(),
      input: buildPromptInputWithMentionedFiles(promptInput, mentionedFiles),
      attachments: sendAttachments,
      skills: slashSkills.skills,
      options: { ...composerOptions }
    };

    const clearComposerAfterSubmit = () => {
      applyComposerText("");
      scheduleComposerResize();
      setComposerMentionedFiles([]);
      setComposerMentionedSkills([]);
      setFileMention(null);
      setSkillMention(null);
      setComposerDraftByThreadId((prev) => ({
        ...prev,
        [targetThreadId]: ""
      }));
      setComposerAttachments((prev) => {
        prev.forEach((attachment) => URL.revokeObjectURL(attachment.previewUrl));
        return [];
      });
    };

    const applyFirstPromptMetadata = async () => {
      if (!targetThread || (!shouldRenameThread && !shouldGenerateSummary)) {
        return;
      }

      let generatedTitle: string | null = null;
      let generatedDescription: string | null = null;
      try {
        const metadata = await api.sessions.generateThreadMetadata({
          threadId: targetThread.id,
          input: promptInput || targetThread.title,
          options: prompt.options
        });
        generatedTitle = metadata?.title?.trim() || null;
        generatedDescription = metadata?.description?.trim() || null;
      } catch (error) {
        setLogs((prev) => [...prev, `Thread metadata generation failed: ${String(error)}`]);
      }

      if (shouldRenameThread) {
        const nextTitle = generatedTitle;
        if (nextTitle) {
          try {
            const updated = await api.threads.update({ id: targetThread.id, title: nextTitle });
            setThreads((prev) => prev.map((thread) => (thread.id === updated.id ? updated : thread)));
          } catch (error) {
            setLogs((prev) => [...prev, `Auto rename failed: ${String(error)}`]);
          }
        }
      }

      if (shouldGenerateSummary) {
        const nextSummary = generatedDescription;
        if (nextSummary) {
          setThreadSummaryById((prev) => ({
            ...prev,
            [targetThread.id]: nextSummary
          }));
        }
      }
    };
    setSendPendingByThreadId((prev) => {
      const next = { ...prev, [targetThreadId]: true };
      sendPendingByThreadIdRef.current = next;
      return next;
    });
    try {
      void applyFirstPromptMetadata();

      if ((runStateByThreadIdRef.current[targetThreadId] ?? "idle") === "running") {
        setQueuedPromptsByThreadId((prev) => {
          const nextQueue = [...(prev[targetThreadId] ?? []), prompt];
          const next = {
            ...prev,
            [targetThreadId]: nextQueue
          };
          queuedPromptsByThreadIdRef.current = next;
          return next;
        });
        clearComposerAfterSubmit();
        return;
      }

      await dispatchPromptToThread(targetThreadId, prompt);
      clearComposerAfterSubmit();
    } finally {
      setSendPendingByThreadId((prev) => {
        if (!prev[targetThreadId]) {
          return prev;
        }
        const next = { ...prev };
        delete next[targetThreadId];
        sendPendingByThreadIdRef.current = next;
        return next;
      });
    }
  };

  const steerPrompt = async () => {
    if (!activeThreadId) {
      return;
    }
    const threadId = activeThreadId;
    const trimmed = composerRef.current.trim();
    const mentionedFiles = composerMentionedFiles;
    if (!trimmed && composerAttachments.length === 0 && mentionedFiles.length === 0) {
      return;
    }

    const slashSkills = extractSkillsFromInput(trimmed, activeSkills);
    const promptInput = buildPromptInputWithMentionedFiles(slashSkills.remainder, mentionedFiles);
    const sendAttachments: PromptAttachment[] = composerAttachments.map((attachment) => ({
      name: attachment.name,
      mimeType: attachment.mimeType,
      dataUrl: attachment.dataUrl,
      size: attachment.size
    }));

    const result = await api.sessions.steer({
      threadId,
      input: promptInput,
      attachments: sendAttachments,
      skills: slashSkills.skills
    });
    if (!result.ok) {
      setLogs((prev) => [...prev, "Steer failed."]);
      return;
    }
    appendLocalUserMessage(threadId, promptInput, sendAttachments);

    applyComposerText("");
    scheduleComposerResize();
    setComposerMentionedFiles([]);
    setComposerMentionedSkills([]);
    setFileMention(null);
    setSkillMention(null);
    setComposerDraftByThreadId((prev) => ({
      ...prev,
      [threadId]: ""
    }));
    setComposerAttachments((prev) => {
      prev.forEach((attachment) => URL.revokeObjectURL(attachment.previewUrl));
      return [];
    });
  };

  const buildPlanImplementationPrompt = useCallback((plan: PlanArtifact) => {
    return [
      "Implement this plan now in coding mode.",
      "Execute end-to-end, run relevant validation/tests, and summarize exactly what changed.",
      "",
      "Plan:",
      "```markdown",
      plan.markdown || plan.summary,
      "```"
    ].join("\n");
  }, []);

  const buildNowFromPlan = async (planId: string) => {
    if (!activeThreadId) {
      return;
    }
    const plan = plansById[planId];
    if (!plan) {
      return;
    }

    const prompt: QueuedPrompt = {
      id: crypto.randomUUID(),
      input: buildPlanImplementationPrompt(plan),
      attachments: [],
      skills: [],
      options: {
        ...composerOptions,
        collaborationMode: "coding"
      }
    };

    setComposerOptions((prev) => ({
      ...prev,
      collaborationMode: "coding"
    }));

    if ((runStateByThreadIdRef.current[activeThreadId] ?? "idle") === "running") {
      setQueuedPromptsByThreadId((prev) => {
        const nextQueue = [...(prev[activeThreadId] ?? []), prompt];
        const next = {
          ...prev,
          [activeThreadId]: nextQueue
        };
        queuedPromptsByThreadIdRef.current = next;
        return next;
      });
      return;
    }

    await dispatchPromptToThread(activeThreadId, prompt);
  };

  const copyPlanToClipboard = (planId: string) => {
    const plan = plansById[planId];
    if (!plan) {
      return;
    }
    navigator.clipboard.writeText(plan.markdown).catch((error) => {
      appendLog(`Copy plan failed: ${String(error)}`);
    });
  };

  const openPlanDrawerFor = (planId: string) => {
    const selected = plansById[planId];
    if (!selected) {
      return;
    }
    const popoutPlans = [...planArtifacts].sort(
      (left, right) => new Date(right.ts).getTime() - new Date(left.ts).getTime()
    );
    let currentPlanId = selected.id;

    const existingPlanPopout = planPopoutWindowRef.current;
    if (existingPlanPopout && !existingPlanPopout.closed) {
      existingPlanPopout.close();
      planPopoutWindowRef.current = null;
    }

    const popout = window.open("", "codeapp-plan-viewer", "popup=yes,width=1080,height=820,resizable=yes,scrollbars=yes");
    if (!popout) {
      appendLog("Plan pop-out blocked.");
      return;
    }

    planPopoutWindowRef.current = popout;
    const doc = popout.document;
    doc.open();
    doc.write("<!doctype html><html><head><meta charset=\"utf-8\" /><meta name=\"viewport\" content=\"width=device-width, initial-scale=1\" /><title>Plan Viewer</title></head><body></body></html>");
    doc.close();

    const faLink = doc.createElement("link");
    faLink.rel = "stylesheet";
    faLink.href = "https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.2/css/all.min.css";
    doc.head.appendChild(faLink);

    const style = doc.createElement("style");
    style.textContent = `
      :root { color-scheme: dark; font-family: "Space Grotesk", "Avenir Next", sans-serif; }
      * { box-sizing: border-box; }
      body { margin: 0; background: #0b0d10; color: #e5e7eb; height: 100vh; overflow: hidden; }
      .shell { height: 100vh; display: flex; flex-direction: column; }
      .drag-region { -webkit-app-region: drag; }
      .no-drag { -webkit-app-region: no-drag; }
      .window-header { min-height: max(3rem, env(titlebar-area-height, 3rem)); }
      .window-header-windows { padding-right: 0.75rem; }
      .window-header-macos { padding-left: 5rem; }
      .head { position: sticky; top: 0; z-index: 10; display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 8px 12px; border-bottom: 1px solid #27272a; background: #000000; }
      .brand { display: flex; align-items: center; gap: 8px; min-width: 0; }
      .icon { width: 24px; height: 24px; border-radius: 8px; }
      .title { font-size: 13px; font-weight: 700; color: #f8fafc; }
      .subtitle { font-size: 11px; color: #94a3b8; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 48vw; }
      .actions { display: flex; align-items: center; gap: 8px; }
      .btn-ghost { display: inline-flex; align-items: center; gap: 6px; border: 1px solid transparent; border-radius: 8px; background: transparent; padding: 6px 10px; font-size: 12px; color: #cbd5e1; transition: background 120ms ease, color 120ms ease; cursor: pointer; }
      .btn-ghost:hover { background: #18181b; color: #ffffff; }
      .btn-primary { display: inline-flex; align-items: center; gap: 6px; border: 1px solid #71717a; border-radius: 8px; background: #f4f4f5; padding: 6px 11px; font-size: 12px; font-weight: 600; color: #09090b; transition: background 120ms ease; cursor: pointer; }
      .btn-primary:hover { background: #ffffff; }
      .btn-icon { font-size: 11px; line-height: 1; }
      .window-controls { display: flex; align-items: center; gap: 4px; margin-left: 4px; }
      .window-control-btn { display: inline-flex; align-items: center; justify-content: center; width: 36px; height: 28px; border: 1px solid transparent; border-radius: 8px; background: transparent; color: #cbd5e1; cursor: pointer; transition: background 120ms ease, color 120ms ease; }
      .window-control-icon { font-size: 11px; line-height: 1; }
      .window-control-btn:hover { background: #27272a; color: #ffffff; }
      .window-control-close:hover { background: rgba(239, 68, 68, 0.2); color: #fee2e2; }
      .content { flex: 1; min-height: 0; overflow: hidden; padding: 14px; }
      .layout { height: 100%; min-height: 0; display: grid; grid-template-columns: 290px minmax(0, 1fr); gap: 12px; }
      .sidebar { min-height: 0; overflow: auto; border: 1px solid #252a34; border-radius: 12px; background: #090c12; padding: 12px; }
      .sidebar-title { font-size: 11px; text-transform: uppercase; letter-spacing: 0.12em; color: #94a3b8; margin: 0 0 10px 0; }
      .plan-item { width: 100%; text-align: left; border: 1px solid #2a3343; border-radius: 10px; background: #0c111a; color: #dbe3ee; padding: 10px; margin-bottom: 8px; cursor: pointer; }
      .plan-item:hover { background: #101827; border-color: #334155; }
      .plan-item.active { border-color: #64748b; background: #131c2d; }
      .plan-item-title { font-size: 13px; font-weight: 600; color: #f8fafc; margin-bottom: 4px; }
      .plan-item-meta { font-size: 11px; color: #94a3b8; margin-bottom: 5px; }
      .plan-item-summary { font-size: 12px; line-height: 1.45; color: #cbd5e1; }
      .detail { min-height: 0; overflow: auto; border: 1px solid #252a34; border-radius: 12px; background: #090c12; padding: 18px; }
      .summary { font-size: 16px; line-height: 1.7; color: #dbe3ee; margin: 0 0 10px 0; }
      .markdown { border: 1px solid #252a34; border-radius: 12px; background: #090c12; padding: 18px; font-size: 15px; line-height: 1.72; color: #dbe3ee; overflow-wrap: anywhere; }
      .markdown h1, .markdown h2, .markdown h3 { margin: 22px 0 14px 0; color: #f8fafc; line-height: 1.28; }
      .markdown h1:first-child, .markdown h2:first-child, .markdown h3:first-child { margin-top: 0; }
      .markdown h1 { font-size: 28px; }
      .markdown h2 { font-size: 23px; }
      .markdown h3 { font-size: 19px; }
      .markdown p { margin: 0 0 14px 0; }
      .markdown ul, .markdown ol { margin: 0 0 14px 26px; padding: 0; }
      .markdown li { margin: 0 0 8px 0; }
      .markdown pre { margin: 0 0 14px 0; border: 1px solid #2a3343; border-radius: 10px; background: #06080d; padding: 14px; overflow-x: auto; }
      .markdown code { font-family: "IBM Plex Mono", "Fira Code", monospace; font-size: 13px; }
      .markdown p code, .markdown li code { border: 1px solid #2a3343; border-radius: 6px; background: #0a0f1a; padding: 1px 5px; }
      @media (max-width: 980px) {
        .layout { grid-template-columns: 1fr; }
        .sidebar { max-height: 34vh; }
      }
    `;
    doc.head.appendChild(style);

    const escapeHtml = (value: string) =>
      value
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");

    const renderInlineMarkdown = (value: string) => {
      const escaped = escapeHtml(value);
      return escaped.replace(/`([^`]+)`/g, "<code>$1</code>");
    };

    const renderMarkdownHtml = (source: string) => {
      const lines = source.replace(/\r/g, "").split("\n");
      const html: string[] = [];
      let inCode = false;
      let codeBuffer: string[] = [];
      let inUl = false;
      let inOl = false;

      const closeLists = () => {
        if (inUl) {
          html.push("</ul>");
          inUl = false;
        }
        if (inOl) {
          html.push("</ol>");
          inOl = false;
        }
      };

      const flushCode = () => {
        if (!inCode) {
          return;
        }
        html.push(`<pre><code>${escapeHtml(codeBuffer.join("\n"))}</code></pre>`);
        codeBuffer = [];
        inCode = false;
      };

      for (const rawLine of lines) {
        const line = rawLine.replace(/\t/g, "    ");
        const trimmed = line.trim();

        if (trimmed.startsWith("```")) {
          if (inCode) {
            flushCode();
          } else {
            closeLists();
            inCode = true;
          }
          continue;
        }

        if (inCode) {
          codeBuffer.push(line);
          continue;
        }

        if (!trimmed) {
          closeLists();
          continue;
        }

        const h3 = trimmed.match(/^###\s+(.+)$/);
        if (h3) {
          closeLists();
          html.push(`<h3>${renderInlineMarkdown(h3[1] ?? "")}</h3>`);
          continue;
        }
        const h2 = trimmed.match(/^##\s+(.+)$/);
        if (h2) {
          closeLists();
          html.push(`<h2>${renderInlineMarkdown(h2[1] ?? "")}</h2>`);
          continue;
        }
        const h1 = trimmed.match(/^#\s+(.+)$/);
        if (h1) {
          closeLists();
          html.push(`<h1>${renderInlineMarkdown(h1[1] ?? "")}</h1>`);
          continue;
        }

        const orderedItem = trimmed.match(/^\d+\.\s+(.+)$/);
        if (orderedItem) {
          if (inUl) {
            html.push("</ul>");
            inUl = false;
          }
          if (!inOl) {
            html.push("<ol>");
            inOl = true;
          }
          html.push(`<li>${renderInlineMarkdown(orderedItem[1] ?? "")}</li>`);
          continue;
        }

        const unorderedItem = trimmed.match(/^[-*]\s+(.+)$/);
        if (unorderedItem) {
          if (inOl) {
            html.push("</ol>");
            inOl = false;
          }
          if (!inUl) {
            html.push("<ul>");
            inUl = true;
          }
          html.push(`<li>${renderInlineMarkdown(unorderedItem[1] ?? "")}</li>`);
          continue;
        }

        closeLists();
        html.push(`<p>${renderInlineMarkdown(trimmed)}</p>`);
      }

      flushCode();
      closeLists();
      return html.join("");
    };

    const shell = doc.createElement("div");
    shell.className = "shell";

    const head = doc.createElement("div");
    head.className = `head drag-region window-header ${useWindowsStyleHeader ? "window-header-windows" : ""} ${isMacOS ? "window-header-macos" : ""}`;

    const brand = doc.createElement("div");
    brand.className = "brand";
    const icon = doc.createElement("img");
    icon.src = appIconDark;
    icon.className = "icon";
    icon.alt = "";
    const meta = doc.createElement("div");
    const title = doc.createElement("div");
    title.className = "title";
    title.textContent = "Plan Viewer";
    const subtitle = doc.createElement("div");
    subtitle.className = "subtitle";
    subtitle.textContent = selected.title;
    meta.appendChild(title);
    meta.appendChild(subtitle);
    brand.appendChild(icon);
    brand.appendChild(meta);

    const actions = doc.createElement("div");
    actions.className = "actions no-drag";
    const copyBtn = doc.createElement("button");
    copyBtn.className = "btn-ghost";
    copyBtn.type = "button";
    copyBtn.innerHTML =
      '<i class="fa-regular fa-copy btn-icon" aria-hidden="true"></i><span>Copy</span>';
    copyBtn.addEventListener("click", () => {
      const currentPlan = popoutPlans.find((plan) => plan.id === currentPlanId) ?? selected;
      navigator.clipboard.writeText(currentPlan.markdown || "").catch(() => undefined);
    });

    const buildBtn = doc.createElement("button");
    buildBtn.className = "btn-primary";
    buildBtn.type = "button";
    buildBtn.innerHTML =
      '<i class="fa-solid fa-hammer btn-icon" aria-hidden="true"></i><span>Build now</span>';
    buildBtn.addEventListener("click", () => {
      const currentPlan = popoutPlans.find((plan) => plan.id === currentPlanId) ?? selected;
      buildNowFromPlan(currentPlan.id).catch((error) => {
        setLogs((prev) => [...prev, `Build now failed: ${String(error)}`]);
      });
    });
    actions.appendChild(copyBtn);
    actions.appendChild(buildBtn);
    if (useWindowsStyleHeader) {
      const desktopApi = (popout as Window & { desktopAPI?: typeof api }).desktopAPI;
      const windowControls = doc.createElement("div");
      windowControls.className = "window-controls";

      const minBtn = doc.createElement("button");
      minBtn.className = "window-control-btn";
      minBtn.type = "button";
      minBtn.title = "Minimize";
      minBtn.innerHTML = '<i class="fa-solid fa-minus window-control-icon" aria-hidden="true"></i>';
      minBtn.addEventListener("click", () => {
        if (!desktopApi?.windowControls) {
          popout.close();
          return;
        }
        desktopApi.windowControls.minimize().catch(() => undefined);
      });

      const maxBtn = doc.createElement("button");
      maxBtn.className = "window-control-btn";
      maxBtn.type = "button";
      maxBtn.title = "Maximize or restore";
      maxBtn.innerHTML = '<i class="fa-regular fa-window-maximize window-control-icon" aria-hidden="true"></i>';
      maxBtn.addEventListener("click", async () => {
        if (!desktopApi?.windowControls) {
          return;
        }
        const state = await desktopApi.windowControls.toggleMaximize();
        if (state?.ok) {
          maxBtn.innerHTML = state.maximized
            ? '<i class="fa-regular fa-window-restore window-control-icon" aria-hidden="true"></i>'
            : '<i class="fa-regular fa-window-maximize window-control-icon" aria-hidden="true"></i>';
        }
      });

      const closeBtn = doc.createElement("button");
      closeBtn.className = "window-control-btn window-control-close";
      closeBtn.type = "button";
      closeBtn.title = "Close";
      closeBtn.innerHTML = '<i class="fa-solid fa-xmark window-control-icon" aria-hidden="true"></i>';
      closeBtn.addEventListener("click", () => {
        if (!desktopApi?.windowControls) {
          popout.close();
          return;
        }
        desktopApi.windowControls.close().catch(() => undefined);
      });

      const syncWindowState = async () => {
        if (!desktopApi?.windowControls) {
          return;
        }
        const state = await desktopApi.windowControls.isMaximized();
        if (state?.ok) {
          maxBtn.innerHTML = state.maximized
            ? '<i class="fa-regular fa-window-restore window-control-icon" aria-hidden="true"></i>'
            : '<i class="fa-regular fa-window-maximize window-control-icon" aria-hidden="true"></i>';
        }
      };

      windowControls.appendChild(minBtn);
      windowControls.appendChild(maxBtn);
      windowControls.appendChild(closeBtn);
      actions.appendChild(windowControls);
      syncWindowState().catch(() => undefined);
    }

    head.appendChild(brand);
    head.appendChild(actions);

    const content = doc.createElement("main");
    content.className = "content";
    const layout = doc.createElement("div");
    layout.className = "layout";

    const sidebar = doc.createElement("aside");
    sidebar.className = "sidebar";
    const sidebarTitle = doc.createElement("p");
    sidebarTitle.className = "sidebar-title";
    sidebarTitle.textContent = "Plan Versions";
    sidebar.appendChild(sidebarTitle);
    const listHost = doc.createElement("div");
    sidebar.appendChild(listHost);

    const detail = doc.createElement("section");
    detail.className = "detail";
    const summary = doc.createElement("p");
    summary.className = "summary";
    const markdown = doc.createElement("div");
    markdown.className = "markdown";
    detail.appendChild(summary);
    detail.appendChild(markdown);

    const renderList = () => {
      listHost.replaceChildren();
      popoutPlans.forEach((plan) => {
        const item = doc.createElement("button");
        item.type = "button";
        item.className = `plan-item ${plan.id === currentPlanId ? "active" : ""}`;
        item.addEventListener("click", () => {
          currentPlanId = plan.id;
          renderList();
          renderDetail();
        });

        const title = doc.createElement("div");
        title.className = "plan-item-title";
        title.textContent = plan.title || "Plan";
        const meta = doc.createElement("div");
        meta.className = "plan-item-meta";
        meta.textContent = `${plan.source === "proposed" ? "Proposed" : "Todo"} • ${new Date(plan.ts).toLocaleString()}`;
        const itemSummary = doc.createElement("div");
        itemSummary.className = "plan-item-summary";
        itemSummary.textContent = plan.summary || "Plan ready";

        item.appendChild(title);
        item.appendChild(meta);
        item.appendChild(itemSummary);
        listHost.appendChild(item);
      });
    };

    const renderDetail = () => {
      const currentPlan = popoutPlans.find((plan) => plan.id === currentPlanId) ?? selected;
      subtitle.textContent = currentPlan.title || "Plan";
      summary.textContent = currentPlan.summary || "Plan ready";
      markdown.innerHTML = renderMarkdownHtml(currentPlan.markdown || "");
    };

    renderList();
    renderDetail();

    layout.appendChild(sidebar);
    layout.appendChild(detail);
    content.appendChild(layout);

    shell.appendChild(head);
    shell.appendChild(content);
    doc.body.replaceChildren(shell);
  };

const stopActiveRun = async () => {
    if (!activeThreadId) {
      return;
    }

    const result = await api.sessions.stop({ threadId: activeThreadId });
    if (!result.ok) {
      setLogs((prev) => [...prev, "Stop failed. Session may already be stopped."]);
      return;
    }

    setRunStateByThreadId((prev) => {
      const next = {
        ...prev,
        [activeThreadId]: "idle" as ThreadRunState
      };
      runStateByThreadIdRef.current = next;
      return next;
    });
    drainPromptQueueForThread(activeThreadId);
  };

  const updateFileMentionFromCaret = (nextComposer: string, caret: number) => {
    if (!activeThreadId || !activeProjectId) {
      setFileMention(null);
      return;
    }
    const detected = detectActiveFileMention(nextComposer, caret);
    if (!detected) {
      setFileMention(null);
      return;
    }

    setFileMention((prev) => {
      const shouldResetHighlight = !prev || prev.start !== detected.start || prev.query !== detected.query;
      return {
        ...detected,
        highlightedIndex: shouldResetHighlight ? 0 : prev.highlightedIndex
      };
    });
  };

  const updateSkillMentionFromCaret = (nextComposer: string, caret: number) => {
    if (!activeThreadId) {
      setSkillMention(null);
      return;
    }
    const detected = detectActiveSkillMention(nextComposer, caret);
    if (!detected) {
      setSkillMention(null);
      return;
    }
    setSkillMention((prev) => {
      const shouldResetHighlight =
        !prev || prev.start !== detected.start || prev.query !== detected.query || prev.marker !== detected.marker;
      return {
        ...detected,
        highlightedIndex: shouldResetHighlight ? 0 : prev.highlightedIndex
      };
    });
  };

  const insertMentionedFile = (entry: ProjectFileEntry) => {
    if (!fileMention) {
      return;
    }

    const composerValue = composerRef.current;
    const nextComposer = `${composerValue.slice(0, fileMention.start)}${composerValue.slice(fileMention.end)}`;
    const nextCaret = fileMention.start;
    applyComposerText(nextComposer, false, nextCaret);
    scheduleComposerResize();
    setComposerMentionedFiles((prev) => (prev.includes(entry.path) ? prev : [...prev, entry.path]));
    setFileMention(null);
    setSkillMention(null);
    window.requestAnimationFrame(() => {
      const textarea = composerTextareaRef.current;
      if (!textarea) {
        return;
      }
      textarea.focus();
      textarea.setSelectionRange(nextCaret, nextCaret);
    });
  };

  const removeMentionedFile = (path: string) => {
    setComposerMentionedFiles((prev) => prev.filter((entry) => entry !== path));
  };

  const removeMentionedSkill = (skillName: string) => {
    const escapedSkillName = skillName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const nextComposer = normalizePromptAfterSkillExtraction(composerRef.current.replace(
      new RegExp(`(^|[\\t \\r\\n])[/$]${escapedSkillName}(?=$|[\\t \\r\\n])`, "gi"),
      "$1"
    ));
    applyComposerText(nextComposer, true, nextComposer.length);
    scheduleComposerResize();
    setComposerMentionedSkills(extractSkillsFromInput(nextComposer, activeSkills).skills);
    setFileMention(null);
    setSkillMention(null);
  };

  const insertMentionedSkill = (skill: SkillRecord) => {
    if (!skillMention) {
      return;
    }
    const composerValue = composerRef.current;
    const token = `${skillMention.marker}${skill.name}`;
    const needsSpace = skillMention.end < composerValue.length && !/\s/.test(composerValue[skillMention.end] ?? "");
    const replacement = `${token}${needsSpace ? " " : ""}`;
    const nextComposer = `${composerValue.slice(0, skillMention.start)}${replacement}${composerValue.slice(skillMention.end)}`;
    const nextCaret = skillMention.start + replacement.length;
    applyComposerText(nextComposer, false, nextCaret);
    scheduleComposerResize();
    const nextSkills = extractSkillsFromInput(nextComposer, activeSkills).skills;
    setComposerMentionedSkills((prev) => (areSkillReferencesEqual(prev, nextSkills) ? prev : nextSkills));
    setSkillMention(null);
    window.requestAnimationFrame(() => {
      const textarea = composerTextareaRef.current;
      if (!textarea) {
        return;
      }
      textarea.focus();
      textarea.setSelectionRange(nextCaret, nextCaret);
    });
  };

  const onComposerChange = (value: string, caret: number | null) => {
    updateComposerText(value);
    const extractedSkills = extractSkillsFromInput(value, activeSkills).skills;
    setComposerMentionedSkills((prev) => (areSkillReferencesEqual(prev, extractedSkills) ? prev : extractedSkills));
    scheduleComposerResize();
    if (typeof caret === "number") {
      if (composerMentionRafRef.current !== null) {
        window.cancelAnimationFrame(composerMentionRafRef.current);
      }
      composerMentionRafRef.current = window.requestAnimationFrame(() => {
        composerMentionRafRef.current = null;
        updateFileMentionFromCaret(value, caret);
        updateSkillMentionFromCaret(value, caret);
      });
      return;
    }
    setFileMention(null);
    setSkillMention(null);
  };

  const onComposerKeyDown: KeyboardEventHandler<HTMLTextAreaElement> = (event) => {
    const usesPlatformModifier = isMacOS ? event.metaKey : event.ctrlKey;
    if (
      usesPlatformModifier &&
      !event.shiftKey &&
      !event.altKey &&
      !event.nativeEvent.isComposing &&
      !event.repeat
    ) {
      const key = event.key.toLowerCase();
      if (key === "n" || key === "t" || key === "i") {
        event.preventDefault();
        runShortcutByKey(key);
        return;
      }
    }

    if (
      usesPlatformModifier &&
      event.shiftKey &&
      !event.altKey &&
      !event.nativeEvent.isComposing &&
      event.key.toLowerCase() === "p"
    ) {
      event.preventDefault();
      setComposerOptions((prev) =>
        prev.collaborationMode === "plan"
          ? prev
          : {
              ...prev,
              collaborationMode: "plan"
            }
      );
      setComposerDropdown(null);
      return;
    }

    if (event.key === "Tab" && skillMention && skillMentionMatches.length > 0) {
      event.preventDefault();
      const target = skillMentionMatches[skillMentionHighlightIndex] ?? skillMentionMatches[0];
      if (target) {
        insertMentionedSkill(target);
      }
      return;
    }

    if (event.key === "ArrowDown" && skillMention && skillMentionMatches.length > 0) {
      event.preventDefault();
      setSkillMention((prev) => (prev ? { ...prev, highlightedIndex: (skillMentionHighlightIndex + 1) % skillMentionMatches.length } : prev));
      return;
    }

    if (event.key === "ArrowUp" && skillMention && skillMentionMatches.length > 0) {
      event.preventDefault();
      setSkillMention((prev) =>
        prev
          ? {
              ...prev,
              highlightedIndex: (skillMentionHighlightIndex - 1 + skillMentionMatches.length) % skillMentionMatches.length
            }
          : prev
      );
      return;
    }

    if (event.key === "Tab" && fileMention && fileMentionMatches.length > 0) {
      event.preventDefault();
      const target = fileMentionMatches[fileMentionHighlightIndex] ?? fileMentionMatches[0];
      if (target) {
        insertMentionedFile(target);
      }
      return;
    }

    if (event.key === "ArrowDown" && fileMention && fileMentionMatches.length > 0) {
      event.preventDefault();
      setFileMention((prev) => (prev ? { ...prev, highlightedIndex: (fileMentionHighlightIndex + 1) % fileMentionMatches.length } : prev));
      return;
    }

    if (event.key === "ArrowUp" && fileMention && fileMentionMatches.length > 0) {
      event.preventDefault();
      setFileMention((prev) =>
        prev
          ? {
              ...prev,
              highlightedIndex: (fileMentionHighlightIndex - 1 + fileMentionMatches.length) % fileMentionMatches.length
            }
          : prev
      );
      return;
    }

    if (event.key === "Escape" && (fileMention || skillMention)) {
      setFileMention(null);
      setSkillMention(null);
      return;
    }

    if (event.key === "Enter" && skillMention && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      const target = skillMentionMatches[skillMentionHighlightIndex] ?? skillMentionMatches[0];
      if (target) {
        insertMentionedSkill(target);
      } else {
        setSkillMention(null);
      }
      return;
    }

    if (event.key === "Enter" && fileMention && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      const target = fileMentionMatches[fileMentionHighlightIndex] ?? fileMentionMatches[0];
      if (target) {
        insertMentionedFile(target);
      } else {
        setFileMention(null);
      }
      return;
    }

    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      sendPrompt().catch((error) => {
        setLogs((prev) => [...prev, `Send failed: ${String(error)}`]);
      });
    }
  };

  const syncComposerMentionFromTextarea = (textarea: HTMLTextAreaElement) => {
    const caret = textarea.selectionStart ?? 0;
    updateFileMentionFromCaret(textarea.value, caret);
    updateSkillMentionFromCaret(textarea.value, caret);
  };

  const onComposerPaste: ClipboardEventHandler<HTMLTextAreaElement> = (event) => {
    const files: File[] = [];
    const items = Array.from(event.clipboardData.items ?? []);
    items.forEach((item) => {
      if (item.kind === "file") {
        const file = item.getAsFile();
        if (file && file.type.startsWith("image/")) {
          files.push(file);
        }
      }
    });

    if (files.length === 0) {
      return;
    }

    event.preventDefault();
    addImageFiles(files).catch((error) => {
      setLogs((prev) => [...prev, `Paste image failed: ${String(error)}`]);
    });
  };

  const onDropZoneDragOver: DragEventHandler<HTMLDivElement> = (event) => {
    if (!activeThreadId) {
      return;
    }
    event.preventDefault();
    setIsDraggingFiles(true);
  };

  const onDropZoneDragLeave: DragEventHandler<HTMLDivElement> = (event) => {
    const related = event.relatedTarget as Node | null;
    if (related && event.currentTarget.contains(related)) {
      return;
    }
    setIsDraggingFiles(false);
  };

  const onDropZoneDrop: DragEventHandler<HTMLDivElement> = (event) => {
    if (!activeThreadId) {
      return;
    }
    event.preventDefault();
    setIsDraggingFiles(false);
    const files = Array.from(event.dataTransfer.files ?? []);
    if (files.length === 0) {
      return;
    }
    addImageFiles(files).catch((error) => {
      setLogs((prev) => [...prev, `Drop image failed: ${String(error)}`]);
    });
  };

  const installHarnessCli = async (harnessId: HarnessId) => {
    setLogs((prev) => [...prev, `Checking ${getSupportedHarness(harnessId)?.label ?? harnessId} setup...`]);
    const result = await api.installer.installCli({ harnessId, provider: harnessId });
    setLogs((prev) => [...prev, ...result.logs]);
    await loadInstallerStatus();
  };

  const startCodexLogin = async () => {
    if (codexLoginInFlight) {
      return;
    }

    setCodexLoginInFlight(true);
    try {
      const result = await api.installer.loginCodex();
      setLogs((prev) => [...prev, result.message]);
      await loadInstallerStatus();
      await loadCodexAuthStatus();
      if (!result.ok) {
        return;
      }

      window.setTimeout(() => {
        loadInstallerStatus().catch((error) => {
          setLogs((prev) => [...prev, `Harness refresh failed: ${String(error)}`]);
        });
        loadCodexAuthStatus().catch((error) => {
          setLogs((prev) => [...prev, `Codex auth status refresh failed: ${String(error)}`]);
        });
      }, 3000);
    } catch (error) {
      setLogs((prev) => [...prev, `Codex login failed: ${String(error)}`]);
    } finally {
      setCodexLoginInFlight(false);
    }
  };

  const logoutCodex = async () => {
    if (codexLogoutInFlight) {
      return;
    }

    setCodexLogoutInFlight(true);
    try {
      const result = await api.installer.logoutCodex();
      setLogs((prev) => [...prev, result.message]);
      await loadInstallerStatus();
      await loadCodexAuthStatus();
    } catch (error) {
      setLogs((prev) => [...prev, `Codex logout failed: ${String(error)}`]);
    } finally {
      setCodexLogoutInFlight(false);
    }
  };

  const pollOpenCodeAuthStatus = async (
    predicate: (status: OpenCodeAuthStatus) => boolean,
    attempts = 20,
    intervalMs = 3_000
  ) => {
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      await new Promise((resolve) => window.setTimeout(resolve, intervalMs));
      const status = await loadOpenCodeAuthStatus();
      if (predicate(status)) {
        return status;
      }
    }
    return null;
  };

  const startOpenCodeLogin = async () => {
    if (openCodeLoginInFlight) {
      return;
    }

    const previousCredentialCount = openCodeAuthStatus?.credentialMethods.length ?? 0;
    setOpenCodeLoginInFlight(true);
    try {
      const result = await api.installer.loginOpenCode({
        cwd: activeProject?.path,
        binaryOverride: settings.harnessSettings.opencode?.binaryOverride
      });
      setLogs((prev) => [...prev, result.message]);
      if (!result.ok) {
        await loadInstallerStatus();
        return;
      }
      await pollOpenCodeAuthStatus((status) => status.credentialMethods.length > previousCredentialCount);
      await loadInstallerStatus();
    } catch (error) {
      setLogs((prev) => [...prev, `OpenCode login failed: ${String(error)}`]);
    } finally {
      setOpenCodeLoginInFlight(false);
    }
  };

  const logoutOpenCode = async (providerLabel?: string) => {
    if (openCodeLogoutInFlight) {
      return;
    }

    const previousCredentialCount = openCodeAuthStatus?.credentialMethods.length ?? 0;
    setOpenCodeLogoutInFlight(true);
    try {
      const result = await api.installer.logoutOpenCode({
        cwd: activeProject?.path,
        binaryOverride: settings.harnessSettings.opencode?.binaryOverride,
        providerLabel
      });
      setLogs((prev) => [...prev, result.message]);
      if (!result.ok || !result.launched) {
        await loadInstallerStatus();
        await loadOpenCodeAuthStatus();
        return;
      }
      await pollOpenCodeAuthStatus((status) => status.credentialMethods.length < previousCredentialCount);
      await loadInstallerStatus();
    } catch (error) {
      setLogs((prev) => [...prev, `OpenCode logout failed: ${String(error)}`]);
    } finally {
      setOpenCodeLogoutInFlight(false);
    }
  };

  const runAutomaticSetup = async () => {
    if (!setupPermissionGranted || setupInstalling) {
      return;
    }

    const flushSetupLiveBuffer = () => {
      if (setupLiveFlushTimeoutRef.current) {
        window.clearTimeout(setupLiveFlushTimeoutRef.current);
        setupLiveFlushTimeoutRef.current = null;
      }
      const chunk = setupLiveBufferRef.current;
      if (chunk.length === 0) {
        return;
      }
      setupLiveBufferRef.current = [];
      setSetupLiveLines((prev) => {
        const merged = [...prev, ...chunk];
        return merged.length > 300 ? merged.slice(-300) : merged;
      });
    };

    setSetupInstalling(true);
    setSetupLiveLines([]);
    setupLiveBufferRef.current = [];
    if (setupLiveFlushTimeoutRef.current) {
      window.clearTimeout(setupLiveFlushTimeoutRef.current);
      setupLiveFlushTimeoutRef.current = null;
    }
    setLogs((prev) => [...prev, "Starting automatic dependency setup..."]);

    const unsub = api.installer.onInstallLog((line) => {
      setupLiveBufferRef.current.push(line);
      if (setupLiveFlushTimeoutRef.current) {
        return;
      }
      setupLiveFlushTimeoutRef.current = window.setTimeout(() => {
        flushSetupLiveBuffer();
      }, 80);
    });

    try {
      const result = await api.installer.installDependencies({
        targets: ["node", "npm", "git", "rg"]
      });
      setInstallStatus(result.status);
      setLogs((prev) => [...prev, ...result.logs]);
      if (result.ok) {
        setShowSetupModal(false);
        setSetupPermissionGranted(false);
      }
    } catch (error) {
      setLogs((prev) => [...prev, `Automatic setup failed: ${String(error)}`]);
    } finally {
      unsub();
      flushSetupLiveBuffer();
      setSetupInstalling(false);
    }
  };

  useEffect(() => {
    setupLogEndRef.current?.scrollIntoView({ block: "end" });
  }, [setupLiveLines]);

  useEffect(
    () => () => {
      if (setupLiveFlushTimeoutRef.current) {
        window.clearTimeout(setupLiveFlushTimeoutRef.current);
        setupLiveFlushTimeoutRef.current = null;
      }
      setupLiveBufferRef.current = [];
    },
    []
  );

  const saveSettings = async (draft: { settings: AppSettings; composerOptions: CodexThreadOptions; settingsEnvText: string }) => {
    if (settingsSaving) {
      return;
    }

    let envVars: Record<string, string> = {};
    try {
      envVars = parseEnvText(draft.settingsEnvText);
    } catch (error) {
      const message = `Settings save failed: ${String(error)}`;
      setLogs((prev) => [...prev, message]);
      return;
    }

    setSettingsSaving(true);
    try {
      const mode = draft.settings.permissionMode as PermissionMode;
      const defaultHarnessId = draft.settings.defaultHarnessId ?? settings.defaultHarnessId ?? "codex";
      const nextHarnessSettings = {
        ...settings.harnessSettings,
        ...draft.settings.harnessSettings
      };

      const saved = await api.settings.set({
        permissionMode: mode,
        theme: draft.settings.theme ?? "midnight",
        defaultHarnessId,
        harnessSettings: nextHarnessSettings,
        envVars,
        defaultProjectDirectory: draft.settings.defaultProjectDirectory?.trim() ?? "",
        autoRenameThreadTitles: draft.settings.autoRenameThreadTitles ?? true,
        showThreadSummaries: draft.settings.showThreadSummaries ?? true,
        useTurtleSpinners: draft.settings.useTurtleSpinners ?? false,
        condenseActivityTimeline: draft.settings.condenseActivityTimeline ?? true,
        projectTerminalSwitchBehaviorDefault: draft.settings.projectTerminalSwitchBehaviorDefault ?? "start_stop",
        preferredSystemTerminalId: draft.settings.preferredSystemTerminalId?.trim() ?? "",
        codexDefaults: draft.composerOptions
      });

      await api.permissions.setMode({ mode });

      setSettings(saved);
      setComposerOptions(getHarnessOptionsFromSettings(saved, activeThread?.harnessId ?? saved.defaultHarnessId ?? "codex"));
      setAppSettingsInitialDraft({
        settings: saved,
        composerOptions: getHarnessOptionsFromSettings(saved, saved.defaultHarnessId ?? "codex"),
        settingsEnvText: envVarsToText(saved.envVars),
        settingsTab: "general"
      });
      if (!isSettingsWindow) {
        setShowSettings(false);
      }
      await loadSystemTerminals();
      await loadInstallerStatus();
    } catch (error) {
      const message = `Settings save failed: ${String(error)}`;
      setLogs((prev) => [...prev, message]);
    } finally {
      setSettingsSaving(false);
    }
  };

  const checkUpdatesOnLaunch = async () => {
    try {
      const result = await api.updates.check();
      if (!result.available) {
        setUpdateAvailableVersion(null);
        setUpdateDismissed(false);
        setUpdateInstallPending(false);
        return;
      }
      setUpdateAvailableVersion(result.version ?? "available");
      setUpdateDismissed(false);
      setUpdateInstallPending(false);
    } catch (error) {
      setLogs((prev) => [...prev, `Update check failed: ${String(error)}`]);
    }
  };

  const applyUpdate = async () => {
    if (updateInstallPending) {
      return;
    }
    setUpdateInstallPending(true);
    try {
      const result = await api.updates.apply();
      if (!result.ok) {
        throw new Error("Update apply failed.");
      }
    } catch (error) {
      setLogs((prev) => [...prev, `Update install failed: ${String(error)}`]);
      setUpdateInstallPending(false);
    }
  };

  const dismissUpdatePrompt = () => {
    if (updateInstallPending) {
      return;
    }
    setUpdateDismissed(true);
  };

  const openSkillEditor = async (path: string) => {
    const doc = await api.skills.readDocument({ path });
    setSkillEditorPath(path);
    setSkillEditorContent(doc.content);
  };

  const createProjectSkill = useCallback(
    async (requestedName: string) => {
      if (!activeProjectId) {
        throw new Error("No active project selected.");
      }
      const projectForSettings = projects.find((project) => project.id === activeProjectId);
      if (!projectForSettings?.path) {
        throw new Error("Project path not found.");
      }

      const normalizedName = requestedName
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9-]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .replace(/-{2,}/g, "-");
      if (!normalizedName) {
        throw new Error("Skill name must include letters or numbers.");
      }

      const projectPath = projectForSettings.path.replace(/[\\/]+$/, "");
      const skillDocPath = `${projectPath}/.agents/skills/${normalizedName}/SKILL.md`;
      const normalizePath = (value: string) => value.replace(/\\/g, "/").toLowerCase();
      const hasExisting = (skillsByProjectId[activeProjectId] ?? []).some(
        (skill) => normalizePath(skill.path) === normalizePath(skillDocPath)
      );
      if (hasExisting) {
        throw new Error(`A skill already exists at ${skillDocPath}.`);
      }

      const skillTemplate = `---
name: ${normalizedName}
description: "TODO: short description"
---

# ${normalizedName}

## Purpose
TODO: Describe what this skill does.

## When To Use
- TODO: Trigger condition 1
- TODO: Trigger condition 2

## Instructions
1. TODO: First action
2. TODO: Second action
`;

      await api.skills.writeDocument({
        path: skillDocPath,
        content: skillTemplate
      });
      await loadProjectSkills(activeProjectId);
      await openSkillEditor(skillDocPath);
    },
    [activeProjectId, loadProjectSkills, openSkillEditor, projects, skillsByProjectId]
  );

  const saveSkillEditor = async (): Promise<boolean> => {
    if (!skillEditorPath) {
      return false;
    }
    setSkillEditorSaving(true);
    try {
      const normalized = normalizeSkillFrontmatterYaml(skillEditorContent);
      if (normalized.changed) {
        setSkillEditorContent(normalized.content);
        setLogs((prev) => [...prev, "Skill save note: auto-quoted description field for valid YAML frontmatter."]);
      }
      await api.skills.writeDocument({
        path: skillEditorPath,
        content: normalized.content
      });
      const normalizedSkillPath = skillEditorPath.replace(/\\/g, "/").toLowerCase();
      const ownerProject = projects
        .filter((project) => {
          const normalizedProjectPath = project.path.replace(/\\/g, "/").toLowerCase();
          return normalizedSkillPath.startsWith(`${normalizedProjectPath}/`);
        })
        .sort((a, b) => b.path.length - a.path.length)[0];
      if (ownerProject && normalizedSkillPath.includes("/.agents/skills/")) {
        const lines = skillEditorContent.split(/\r?\n/);
        const nameLine = lines.find((line) => line.trim().toLowerCase().startsWith("name:"));
        const descriptionLine = lines.find((line) => line.trim().toLowerCase().startsWith("description:"));
        const inferredName =
          nameLine?.split(":").slice(1).join(":").trim() ||
          skillEditorPath.replace(/\\/g, "/").split("/").slice(-2, -1)[0] ||
          "skill";
        const inferredDescription = descriptionLine?.split(":").slice(1).join(":").trim() || "";
        setSkillsByProjectId((prev) => {
          const current = prev[ownerProject.id] ?? [];
          const hasExisting = current.some(
            (skill) => skill.path.replace(/\\/g, "/").toLowerCase() === normalizedSkillPath
          );
          if (hasExisting) {
            return prev;
          }
          return {
            ...prev,
            [ownerProject.id]: [
              ...current,
              {
                name: inferredName,
                path: skillEditorPath,
                description: inferredDescription,
                enabled: true,
                scope: "repo"
              }
            ]
          };
        });
      }
      if (ownerProject) {
        void loadProjectSkills(ownerProject.id).catch((error) => {
          setLogs((prev) => [...prev, `Project skill refresh failed: ${String(error)}`]);
        });
      }
      void loadAppSkills().catch((error) => {
        setLogs((prev) => [...prev, `App skill refresh failed: ${String(error)}`]);
      });
      setLogs((prev) => [...prev, `Skill saved: ${skillEditorPath}`]);
      return true;
    } catch (error) {
      const message = `Skill save failed: ${String(error)}`;
      setLogs((prev) => [...prev, message]);
      return false;
    } finally {
      setSkillEditorSaving(false);
    }
  };

  const missingRequiredCoreDependencies = Boolean(
    installStatus &&
      installStatus.details.some((detail) => REQUIRED_SETUP_KEYS.has(detail.key) && !detail.ok)
  );
  const activeHarnessReady = !installStatus || installStatus.readyHarnessIds.includes(activeHarnessId);
  const setupBlocked = Boolean(
    installStatus && (missingRequiredCoreDependencies || !activeHarnessReady)
  );
  const codexAuthBlocked = Boolean(
    activeHarnessId === "codex" && codexAuthStatus?.requiresOpenaiAuth && !codexAuthStatus?.authenticated
  );
  const visibleHarnesses: Partial<Record<HarnessId, boolean>> = {
    codex: installStatus ? installStatus.readyHarnessIds.includes("codex") : true,
    opencode: installStatus ? installStatus.readyHarnessIds.includes("opencode") : true
  };
  const visibleHarnessCount = SUPPORTED_HARNESSES.filter((harness) => visibleHarnesses[harness.id] !== false).length;
  const visibleModelHarnesses = SUPPORTED_HARNESSES.map((harness) => {
    if (visibleHarnesses[harness.id] === false) {
      return null;
    }
    const modelGroupCount = harness.modelGroups.length;
    if (modelGroupCount === 0) {
      return null;
    }
    return { id: harness.id, modelGroupCount };
  }).filter((value): value is { id: HarnessId; modelGroupCount: number } => Boolean(value));
  useEffect(() => {
    if (!setupBlocked) {
      setIsSetupCardDismissed(false);
    }
  }, [setupBlocked]);
  useEffect(() => {
    if (!codexAuthBlocked) {
      setIsCodexAuthCardDismissed(false);
    }
  }, [codexAuthBlocked]);

  useEffect(() => {
    if (!codexAuthBlocked) {
      return;
    }
    const timerId = window.setInterval(() => {
      loadCodexAuthStatus().catch((error) => {
        setLogs((prev) => [...prev, `Codex auth status refresh failed: ${String(error)}`]);
      });
    }, 30_000);
    return () => {
      window.clearInterval(timerId);
    };
  }, [codexAuthBlocked]);
  const planArtifacts = useMemo<PlanArtifact[]>(() => {
    const plans: PlanArtifact[] = [];

    activity.forEach((entry) => {
      if (entry.category !== "plan") {
        return;
      }
      const todos = entry.todos ?? [];
      const markdown = todosToMarkdown(todos);
      plans.push({
        id: `todo:${entry.id}`,
        source: "todo",
        ts: entry.ts,
        title: "Plan",
        summary: summarizePlanMarkdown(markdown),
        markdown,
        todos,
        activityId: entry.id
      });
    });

    messages.forEach((message) => {
      if (message.role !== "assistant") {
        return;
      }
      const segments = splitAssistantContentSegments(message.content, message.id);
      segments.forEach((segment) => {
        if (segment.kind !== "plan" || !segment.planId) {
          return;
        }
        plans.push({
          id: segment.planId,
          source: "proposed",
          ts: message.ts,
          title: "Plan",
          summary: summarizePlanMarkdown(segment.content),
          markdown: segment.content,
          messageId: message.id
        });
      });
    });

    return plans.sort((left, right) => new Date(right.ts).getTime() - new Date(left.ts).getTime());
  }, [activity, messages]);

  const plansById = useMemo<Record<string, PlanArtifact>>(
    () => Object.fromEntries(planArtifacts.map((plan) => [plan.id, plan])),
    [planArtifacts]
  );
  const todoPlans = useMemo(() => planArtifacts.filter((plan) => plan.source === "todo"), [planArtifacts]);
  const getTodoPlanByActivityId = useCallback(
    (activityId: string) => todoPlans.find((plan) => plan.activityId === activityId),
    [todoPlans]
  );
  const handleBuildPlan = useCallback(
    (planId: string) => {
      buildNowFromPlan(planId).catch((error) => {
        appendLog(`Build now failed: ${String(error)}`);
      });
    },
    [appendLog, buildNowFromPlan]
  );
  const togglePreviewPanel = useCallback(() => {
    setIsPreviewOpen((prev) => {
      const next = !prev;
      if (next) {
        setIsGitPanelOpen(false);
      }
      return next;
    });
  }, []);
  const toggleGitPanel = useCallback(() => {
    setIsGitPanelOpen((prev) => {
      const next = !prev;
      if (next) {
        setIsPreviewOpen(false);
      }
      return next;
    });
  }, []);
  const isCodePanelOpen = isCodePanelPoppedOut || isCodeWindow;
  const toggleCodePanel = useCallback(() => {
    if (isCodeWindow) {
      return;
    }
    if (isCodePanelPoppedOut) {
      api.codePanel
        .closePopout()
        .then((result) => {
          if (result.ok) {
            setIsCodePanelPoppedOut(false);
          } else {
            appendLog("Code pop-out failed to close.");
          }
        })
        .catch((error) => {
          appendLog(`Code pop-out close failed: ${String(error)}`);
        });
      return;
    }
    api.codePanel
      .openPopout({ projectId: activeProjectId ?? undefined, projectName: activeProject?.name })
      .then((result) => {
        if (result.ok) {
          setIsCodePanelPoppedOut(true);
        } else {
          appendLog("Code pop-out failed to open.");
        }
      })
      .catch((error) => {
        appendLog(`Code pop-out failed: ${String(error)}`);
      });
    setIsPreviewOpen(false);
    setIsGitPanelOpen(false);
  }, [activeProjectId, activeProject?.name, appendLog, isCodePanelPoppedOut, isCodeWindow]);

  const timelineItems = useMemo(() => {
    const messageItems: TimelineMessageItem[] = messages.map((message, idx) => {
      const tsMs = new Date(message.ts).getTime();
      return {
        id: `msg-${message.id}`,
        tsMs: Number.isFinite(tsMs) ? tsMs : idx,
        order: idx * 2,
        kind: "message",
        message
      };
    });

    const eventItems: TimelineEventItem[] = activity
      .filter((entry) => {
        if (HIDDEN_ACTIVITY_CATEGORIES.has(entry.category ?? "")) {
          return false;
        }
        return !/^thinking\.{0,3}$/i.test(entry.title.trim());
      })
      .map((entry, idx) => {
        const tsMs = new Date(entry.ts).getTime();
        const command = entry.command ?? extractCommandFromTitle(entry.title) ?? "";
        return {
          id: `event-${entry.id}`,
          tsMs: Number.isFinite(tsMs) ? tsMs : idx,
          order: idx * 2 + 1,
          kind: "event",
          entry,
          command,
          isExplorationCommand: entry.category === "command" && isExplorationCommand(command)
        };
      });

    const sortedItems = [...messageItems, ...eventItems]
      .sort((a, b) => (a.tsMs === b.tsMs ? a.order - b.order : a.tsMs - b.tsMs))
      .slice(-300);

    const grouped: TimelineItem[] = [];
    let cursor = 0;

    while (cursor < sortedItems.length) {
      const item = sortedItems[cursor];
      if (!item) {
        break;
      }

      if (
        item.kind === "event" &&
        item.entry.category === "command" &&
        !item.isExplorationCommand
      ) {
        const commandEvents: ActivityEntry[] = [item.entry];
        let next = cursor + 1;
        while (next < sortedItems.length) {
          const candidate = sortedItems[next];
          if (
            !candidate ||
            candidate.kind !== "event" ||
            candidate.entry.category !== "command" ||
            candidate.isExplorationCommand
          ) {
            break;
          }
          commandEvents.push(candidate.entry);
          next += 1;
        }

        const runs = toCommandRuns(commandEvents);
        const childIds = runs.map((run) => `${item.id}:${run.id}`);
        grouped.push({
          id: `command-group-${item.id}`,
          tsMs: item.tsMs,
          order: item.order,
          kind: "command-group",
          label: buildRunGroupLabel("Commands", runs),
          runs,
          stateSummary: summarizeRunStates(runs),
          childIds
        });
        cursor = next;
        continue;
      }

      if (
        item.kind === "event" &&
        (item.entry.category === "file_read" ||
          (item.entry.category === "command" && item.isExplorationCommand))
      ) {
        const readEvents: ActivityEntry[] = [item.entry];
        let next = cursor + 1;
        while (next < sortedItems.length) {
          const candidate = sortedItems[next];
          if (!candidate || candidate.kind !== "event") {
            break;
          }
          const isReadEvent =
            candidate.entry.category === "file_read" ||
            (candidate.entry.category === "command" && candidate.isExplorationCommand);
          if (!isReadEvent) {
            break;
          }
          readEvents.push(candidate.entry);
          next += 1;
        }

        const runs = toCommandRuns(readEvents);
        const childIds = runs.map((run) => `${item.id}:${run.id}`);
        grouped.push({
          id: `read-group-${item.id}`,
          tsMs: item.tsMs,
          order: item.order,
          kind: "read-group",
          label: buildExplorationLabel(runs),
          runs,
          childIds
        });
        cursor = next;
        continue;
      }

      if (item.kind === "event" && item.entry.category === "file_change") {
        const fileEvents: ActivityEntry[] = [item.entry];
        let next = cursor + 1;
        while (next < sortedItems.length) {
          const candidate = sortedItems[next];
          if (!candidate || candidate.kind !== "event" || candidate.entry.category !== "file_change") {
            break;
          }
          fileEvents.push(candidate.entry);
          next += 1;
        }

        const aggregate = toFileChanges(fileEvents);
        const childIds = aggregate.files.map((file, index) => `${item.id}:${file.path}:${file.kind}:${index}`);
        grouped.push({
          id: `file-group-${item.id}`,
          tsMs: item.tsMs,
          order: item.order,
          kind: "file-group",
          files: aggregate.files,
          status: aggregate.status,
          childIds
        });
        cursor = next;
        continue;
      }

      grouped.push(item);
      cursor += 1;
    }

    return grouped;
  }, [messages, activity]);

  const timelineRows = useMemo(() => {
    const rows: Array<
      | { kind: "message"; id: string; item: TimelineMessageItem }
      | { kind: "plan"; id: string; item: TimelineEventItem }
      | { kind: "activity-bundle"; id: string; items: TimelineItem[]; chips: string[]; tsMs: number; durationMs: number }
    > = [];
    let pending: TimelineItem[] = [];

    const pluralizeCount = (count: number, singular: string, plural: string) => `${count} ${count === 1 ? singular : plural}`;

    const flushPending = () => {
      if (pending.length === 0) {
        return;
      }

      const counts = {
        thoughts: 0,
        exploration: 0,
        commands: 0,
        edits: 0,
        searches: 0,
        other: 0
      };

      pending.forEach((item) => {
        if (item.kind === "command-group") {
          counts.commands += item.runs.length;
          return;
        }
        if (item.kind === "read-group") {
          counts.exploration += item.runs.length;
          return;
        }
        if (item.kind === "file-group") {
          counts.edits += item.files.length > 0 ? item.files.length : 1;
          return;
        }
        if (item.kind !== "event") {
          return;
        }

        if (item.entry.category === "reasoning") {
          counts.thoughts += 1;
          return;
        }
        if (item.entry.category === "web_search") {
          counts.searches += 1;
          return;
        }
        if (item.entry.category === "file_change") {
          counts.edits += item.entry.files?.length ?? 1;
          return;
        }
        if (item.entry.category === "file_read") {
          counts.exploration += 1;
          return;
        }
        if (item.entry.category === "command") {
          if (item.isExplorationCommand) {
            counts.exploration += 1;
          } else {
            counts.commands += 1;
          }
          return;
        }
        counts.other += 1;
      });

      const chips: string[] = [];
      if (counts.thoughts > 0) {
        chips.push(pluralizeCount(counts.thoughts, "thought", "thoughts"));
      }
      if (counts.exploration > 0) {
        chips.push(pluralizeCount(counts.exploration, "exploration", "exploration steps"));
      }
      if (counts.commands > 0) {
        chips.push(pluralizeCount(counts.commands, "command", "commands"));
      }
      if (counts.edits > 0) {
        chips.push(pluralizeCount(counts.edits, "edit", "edits"));
      }
      if (counts.searches > 0) {
        chips.push(pluralizeCount(counts.searches, "search", "searches"));
      }
      if (counts.other > 0) {
        chips.push(pluralizeCount(counts.other, "update", "updates"));
      }
      if (chips.length === 0) {
        chips.push(pluralizeCount(pending.length, "update", "updates"));
      }

      const first = pending[0];
      const last = pending[pending.length - 1];
      const tsMs = last?.tsMs ?? first?.tsMs ?? Date.now();
      const durationMs = Math.max(0, (last?.tsMs ?? tsMs) - (first?.tsMs ?? tsMs));
      rows.push({
        kind: "activity-bundle",
        id: `activity-bundle-${first?.id ?? "start"}-${last?.id ?? "end"}`,
        items: pending,
        chips,
        tsMs,
        durationMs
      });
      pending = [];
    };

    timelineItems.forEach((item) => {
      if (item.kind === "message") {
        flushPending();
        rows.push({
          kind: "message",
          id: item.id,
          item
        });
        return;
      }
      if (item.kind === "event" && item.entry.category === "plan") {
        flushPending();
        rows.push({
          kind: "plan",
          id: item.id,
          item
        });
        return;
      }
      pending.push(item);
    });

    flushPending();
    return rows;
  }, [timelineItems]);

  const activeOrchestrationRuns = useMemo(
    () => (activeThreadId ? orchestrationRunsByParentId[activeThreadId] ?? [] : []),
    [activeThreadId, orchestrationRunsByParentId]
  );

  useEffect(() => {
    const pendingRestore = pendingHistoryScrollRestoreRef.current;
    const viewport = timelineViewportRef.current;
    if (!pendingRestore || !viewport || !activeThreadId || pendingRestore.threadId !== activeThreadId) {
      return;
    }

    const heightDelta = viewport.scrollHeight - pendingRestore.previousHeight;
    viewport.scrollTop = pendingRestore.previousTop + Math.max(heightDelta, 0);
    pendingHistoryScrollRestoreRef.current = null;
  }, [activeThreadId, timelineItems.length]);

  useEffect(() => {
    const viewport = timelineViewportRef.current;
    if (!viewport || !activeThreadId) {
      return;
    }

    const handleScroll = () => {
      if (viewport.scrollTop > 80) {
        return;
      }

      loadOlderHistory(activeThreadId).catch((error) => {
        setLogs((prev) => [...prev, `Load older history failed: ${String(error)}`]);
      });
    };

    viewport.addEventListener("scroll", handleScroll);

    return () => {
      viewport.removeEventListener("scroll", handleScroll);
    };
  }, [activeThreadId, activeThreadHasMoreHistory, activeThreadHistoryLoading, activeThreadHistoryCursor, timelineItems.length]);

  useEffect(() => {
    if (activeRunState !== "running") {
      return;
    }
    const viewport = timelineViewportRef.current;
    if (!viewport) {
      return;
    }
    const frameId = window.requestAnimationFrame(() => {
      viewport.scrollTop = viewport.scrollHeight;
    });
    return () => {
      window.cancelAnimationFrame(frameId);
    };
  }, [activeRunState, activeThreadId, timelineItems.length]);

  const stopOrchestrationChild = async (childThreadId: string) => {
    const result = await api.orchestration.stopChild({ childThreadId });
    if (!result.ok) {
      throw new Error("Failed to stop child thread");
    }
    if (activeThreadId) {
      await loadOrchestrationRuns(activeThreadId);
    }
  };

  const closeSettingsModal = useCallback(() => {
    setShowSettings(false);
    setAppSettingsInitialDraft({
      settings,
      composerOptions: getHarnessOptionsFromSettings(settings, settings.defaultHarnessId ?? "codex"),
      settingsEnvText: envVarsToText(settings.envVars),
      settingsTab: "general"
    });
  }, [settings]);

  const toggleAppSkillEnabled = useCallback(
    async (path: string, enabled: boolean) => {
      await api.skills.setEnabled({ path, enabled });
      await loadAppSkills();
    },
    [loadAppSkills]
  );

  const pickDefaultProjectDirectory = useCallback(async () => api.projects.pickPath(), []);

  const closeProjectSettingsModal = useCallback(() => {
    setShowProjectSettings(false);
    setProjectSettingsInitialDraft(null);
  }, []);

  const closeProjectActionsSettingsModal = useCallback(() => {
    setShowProjectActionsSettings(false);
    setProjectActionsSettingsInitialDraft(null);
  }, []);

  const setOverflowActionIds = useCallback(async (overflowActionIds: string[]) => {
    if (!activeProjectId) {
      return;
    }
    const nextOverflowActionIds = Array.from(new Set(overflowActionIds.filter(Boolean)));
    const saved = await api.projectSettings.set({
      projectId: activeProjectId,
      overflowActionCommandIds: nextOverflowActionIds
    });
    setProjectSettingsById((prev) => ({
      ...prev,
      [activeProjectId]: saved
    }));
  }, [activeProjectId]);

  const moveProjectWorkspace = useCallback(
    async (workspaceId: string) => {
      if (!activeProjectId || !workspaceId) {
        return;
      }
      const updated = await api.projects.update({
        id: activeProjectId,
        workspaceId
      });
      setProjects((prev) => prev.map((project) => (project.id === updated.id ? updated : project)));
      setActiveWorkspaceId(updated.workspaceId);
      await loadThreads();
    },
    [activeProjectId, loadThreads]
  );

  const toggleProjectSkillEnabled = useCallback(
    async (path: string, enabled: boolean) => {
      if (!activeProjectId) {
        return;
      }
      await api.skills.setEnabled({ projectId: activeProjectId, path, enabled });
      await loadProjectSkills(activeProjectId);
    },
    [activeProjectId, loadProjectSkills]
  );

  const refreshActiveProjectSkills = useCallback(async () => {
    if (!activeProjectId) {
      return;
    }
    await loadProjectSkills(activeProjectId);
  }, [activeProjectId, loadProjectSkills]);

  const refreshGitStateFromHeader = useCallback(async () => {
    if (!activeProjectId || gitBusyAction || isGitRefreshBusy) {
      return;
    }
    setIsGitRefreshBusy(true);
    try {
      await refreshGitSnapshotSelection(activeProjectId);
    } catch (error) {
      setLogs((prev) => [...prev, `Git refresh failed: ${String(error)}`]);
    } finally {
      setIsGitRefreshBusy(false);
    }
  }, [activeProjectId, gitBusyAction, isGitRefreshBusy, refreshGitSnapshotSelection]);

  const handleSelectWorkspace = useCallback(
    (workspaceId: string) => {
      focusWorkspace(workspaceId).catch((error) => {
        setLogs((prev) => [...prev, `Workspace switch failed: ${String(error)}`]);
      });
    },
    [focusWorkspace]
  );
  const handleForkFromUserMessage = useCallback(
    (message: MessageEvent) => {
      if (!activeThread) {
        return;
      }
      forkThreadFromPrompt(activeThread, message.streamSeq).catch((error) => {
        setLogs((prev) => [...prev, `Fork thread failed: ${String(error)}`]);
      });
    },
    [activeThread, forkThreadFromPrompt]
  );
  const updateMessage = updateAvailableVersion ? `Update ${updateAvailableVersion} available.` : "";
  const showUpdatePrompt = Boolean(updateAvailableVersion) && !updateDismissed;
  const rightColumnWidthPx = isGitPanelOpen ? rightPanelWidthPx : RIGHT_PANEL_DEFAULT_WIDTH_PX;
  const mainLayoutGridTemplateColumns = (isPreviewVisible || isGitPanelOpen)
    ? `300px minmax(0, 1fr) ${rightColumnWidthPx}px`
    : "300px 1fr";

  return (
    <div className="h-screen overflow-hidden bg-bg text-white theme-text">
      <div
        className={
          isSettingsWindow || isCodeWindow
            ? "h-full w-full theme-app-shell"
            : `h-full w-full theme-app-shell ${isMacOS ? "pl-2" : ""}`
        }
      >
        <div
          className={
            isSettingsWindow || isCodeWindow
              ? "flex h-full flex-col overflow-hidden theme-settings-surface"
              : "flex h-full flex-col overflow-hidden rounded-2xl bg-black/40 shadow-neon backdrop-blur-xl"
          }
        >
          {!isSettingsWindow && !isCodeWindow && (
            <MainHeader
              isMacOS={isMacOS}
              isWindows={isWindows}
              isWindowMaximized={isWindowMaximized}
              appIconSrc={appIconSrc}
              appVersionLabel={APP_VERSION_LABEL}
              workspaces={workspaceHeaderItems}
              activeWorkspaceId={activeWorkspaceId}
              onSelectWorkspace={handleSelectWorkspace}
              onRenameWorkspace={renameWorkspaceFromHeaderMenu}
              onSetWorkspaceColor={setWorkspaceColorFromHeaderMenu}
              onDeleteWorkspace={deleteWorkspaceFromHeaderMenu}
              onOpenNewWorkspaceModal={openCreateWorkspaceModal}
              changelogItems={CHANGELOG_ITEMS}
              changelogRef={changelogRef}
              isChangelogOpen={isChangelogOpen}
              setIsChangelogOpen={setIsChangelogOpen}
              updateMessage={updateMessage}
              showUpdatePrompt={showUpdatePrompt}
              updateInstallPending={updateInstallPending}
              onApplyUpdate={applyUpdate}
              onDismissUpdate={dismissUpdatePrompt}
              activeProjectWebLinks={activeProjectWebLinks}
              onOpenProjectWebLink={openProjectWebLink}
              activeProjectId={activeProjectId}
              activeProjectTerminals={activeProjectTerminals}
              systemTerminals={systemTerminals}
              onOpenProjectTerminal={openProjectTerminal}
              onOpenTerminalPopout={openTerminalPopout}
              onAcknowledgeTerminalError={acknowledgeActiveProjectTerminalError}
              onOpenProjectSettings={openActiveProjectActionsSettings}
              overflowActionCommandIds={activeProjectSettings?.overflowActionCommandIds ?? []}
              onSetOverflowActionIds={setOverflowActionIds}
              onStartTerminal={startActiveProjectTerminal}
              onStopTerminal={stopActiveProjectTerminal}
              onCopyTerminalOutput={copyTerminalOutput}
              onOpenProjectFiles={openProjectFiles}
              activeProjectBrowserEnabled={activeProjectBrowserEnabled}
              isCodePanelOpen={isCodePanelOpen}
              isPreviewOpen={isPreviewOpen}
              isGitPanelOpen={isGitPanelOpen}
              isGitPushBusy={Boolean(gitBusyAction)}
              gitPushProgressLabel={gitPushProgressLabel}
              isGitRefreshBusy={isGitRefreshBusy}
              onToggleCodePanel={toggleCodePanel}
              onTogglePreviewPanel={togglePreviewPanel}
              onOpenGitPanel={toggleGitPanel}
              onPushGitChanges={pushGitChanges}
              onRefreshGitState={refreshGitStateFromHeader}
              showHeaderGitDiffStats={Boolean(showHeaderGitDiffStats)}
              activeGitAddedLines={activeGitAddedLines}
              activeGitRemovedLines={activeGitRemovedLines}
              onOpenSettingsWindow={openAppSettingsWindow}
              onMinimizeWindow={minimizeWindow}
              onToggleMaximizeWindow={toggleMaximizeWindow}
              onCloseWindow={closeWindow}
              appendLog={appendLog}
            />
          )}

          <div
            ref={mainLayoutGridRef}
            className={
              isSettingsWindow || isCodeWindow
                ? "hidden"
                : "grid flex-1 min-h-0 overflow-hidden"
            }
            style={isSettingsWindow || isCodeWindow ? undefined : { gridTemplateColumns: mainLayoutGridTemplateColumns }}
          >
            <aside className="main-layout-sidebar relative flex h-full min-h-0 flex-col border-r border-border/90 px-3 py-3">
	              <div className="projects-header">
	                <h2 className="projects-title">Projects</h2>
	                <div className="relative">
	                  <button
	                    className="btn-ghost app-tooltip-target h-7 w-7 p-0 text-sm"
	                    data-app-tooltip={composerTooltipText("Add Project", "Open project creation and import actions.")}
	                    onClick={() => setIsProjectMenuOpen((prev) => !prev)}
	                    aria-label="Add project"
	                  >
	                    <FaPlus
	                      className={`mx-auto text-[12px] transition-transform duration-200 ${
	                        isProjectMenuOpen ? "rotate-45" : "rotate-0"
	                      }`}
	                    />
	                  </button>
	                  {isProjectMenuOpen && (
	                    <div className="project-action-pop">
	                      <button className="btn-ghost w-full text-left" onClick={createProjectInDefaultDirectory}>
	                        New Project
	                      </button>
	                      <button className="btn-ghost w-full text-left" onClick={() => openImportProjectModal().catch((error) => setLogs((prev) => [...prev, `Open import failed: ${String(error)}`]))}>
	                        Import Project
	                      </button>
	                      <button className="btn-ghost w-full text-left" onClick={openProject}>
	                        Open Project
	                      </button>
	                    </div>
	                  )}
                </div>
              </div>

              {!hasProjects && (
                <div className="px-2 pb-3">
                  <p className="text-sm text-slate-300">Add a project to start.</p>
                </div>
              )}

              <div className="projects-scroll-area flex-1 min-h-0 space-y-3 overflow-y-auto pb-3">
                {projectsInActiveWorkspace.length === 0 && <p className="px-2 text-sm text-muted">No active projects in this workspace.</p>}

                {projectsInActiveWorkspace.map((project, projectShortcutIndex) => {
                  const projectShortcutLabel =
                    isCtrlSwitchHintVisible && projectShortcutIndex >= 0 && projectShortcutIndex < 9
                      ? String(projectShortcutIndex + 1)
                      : null;
                  const threadBuckets = threadBucketsByProjectId[project.id];
                  const threadRows = threadRowsByProjectId[project.id];
                  const visibleRows = threadRows?.active ?? [];
                  const archivedRows = threadRows?.archived ?? [];
                  const showArchived = Boolean(showArchivedByProjectId[project.id]);
                  const active = activeProjectId === project.id;
                  const projectPersistedOpen = projectListOpenById[project.id] ?? true;
                  const projectListOpen = projectPersistedOpen || active;
                  const menuOpen = threadMenuProjectId === project.id;
                  const setupState = projectSetupById[project.id];
                  const setupRunning = setupState?.status === "running";
                  const FolderIcon = projectListOpen ? FaFolderOpen : FaFolder;
                  const showProjectActions = active || menuOpen;
                  const visibleShortcutThreadRows = showArchived ? [...visibleRows, ...archivedRows] : visibleRows;
                  const threadShortcutLabelById = isAltThreadSwitchHintVisible
                    ? Object.fromEntries(
                        visibleShortcutThreadRows
                          .slice(0, 9)
                          .map((row, index) => [row.thread.id, String(index + 1)])
                      ) as Record<string, string>
                    : null;

                  return (
                    <section key={project.id} className={active ? "project-section active" : "project-section"}>
                      <div className="project-head" style={getProjectRowStyle(project, active)}>
                        {editingProjectId === project.id ? (
                          <input
                            className="input h-8 flex-1 text-xs"
                            value={editingProjectName}
                            onChange={(event) => setEditingProjectName(event.target.value)}
                            onBlur={() => {
                              submitProjectInlineRename(project).catch((error) => {
                                setLogs((prev) => [...prev, `Project rename failed: ${String(error)}`]);
                              });
                            }}
                            onKeyDown={(event) => {
                              if (event.key === "Enter") {
                                event.preventDefault();
                                submitProjectInlineRename(project).catch((error) => {
                                  setLogs((prev) => [...prev, `Project rename failed: ${String(error)}`]);
                                });
                                return;
                              }
                              if (event.key === "Escape") {
                                event.preventDefault();
                                setEditingProjectId(null);
                                setEditingProjectName("");
                              }
                            }}
                            autoFocus
                          />
                        ) : (
                          <>
                            <button
                              type="button"
                              className={projectListOpen ? "project-folder-toggle open" : "project-folder-toggle"}
                              onClick={() => {
                                setProjectListOpenById((prev) => ({
                                  ...prev,
                                  [project.id]: !projectListOpen
                                }));
                              }}
                              aria-expanded={projectListOpen}
                              aria-label={projectListOpen ? `Collapse ${project.name}` : `Expand ${project.name}`}
                              title={projectListOpen ? "Collapse project" : "Expand project"}
                              style={{ color: project.color ?? "#64748b" }}
                            >
                              <FolderIcon className="project-folder-icon" aria-hidden="true" />
                            </button>
                            <button
                              className={active ? "project-row active" : "project-row"}
                              onClick={() => {
                                focusProjectFromSidebar(project.id).catch((error) => {
                                  setLogs((prev) => [...prev, `Project focus failed: ${String(error)}`]);
                                });
                              }}
                              onDoubleClick={() => beginProjectInlineRename(project)}
                              title="Double-click to rename project"
                            >
                              {projectShortcutLabel && (
                                <span className="project-shortcut-badge" aria-hidden="true">
                                  {projectShortcutLabel}
                                </span>
                              )}
                              <span className="min-w-0 flex-1 overflow-hidden">
                                <span className="block truncate">{project.name}</span>
                                {setupState && (
                                  <span
                                    className={`mt-0.5 block truncate text-[10px] leading-4 ${
                                      setupState.status === "failed" ? "text-red-300" : "text-slate-400"
                                    }`}
                                  >
                                    {setupState.message}
                                  </span>
                                )}
                              </span>
                              {setupState?.status === "running" && (
                                <FaSyncAlt className="ml-2 shrink-0 animate-spin text-[10px] text-slate-400" />
                              )}
                              {setupState?.status === "failed" && (
                                <span className="ml-2 shrink-0 text-xs text-red-300">!</span>
                              )}
                            </button>
                          </>
                        )}
                        <button
                          className={`project-action-btn transition-all duration-300 ${
                            setupRunning
                              ? "pointer-events-none opacity-0 translate-y-0.5"
                              : showProjectActions
                                ? "opacity-100 translate-y-0"
                                : "project-action-btn-idle"
                          }`}
                          onClick={() => {
                            setProjectArchived(project, true).catch((error) => {
                              setLogs((prev) => [...prev, `Archive project failed: ${String(error)}`]);
                            });
                          }}
                          title="Archive project"
                        >
                          <FaArchive className="text-[12px]" />
                        </button>
                        <button
                          className={`project-action-btn transition-all duration-300 ${
                            setupRunning
                              ? "pointer-events-none opacity-0 translate-y-0.5"
                              : showProjectActions
                                ? "opacity-100 translate-y-0"
                                : "project-action-btn-idle"
                          }`}
                          onClick={() => {
                            setActiveProjectId(project.id);
                            openActiveProjectSettings(project.id).catch((error) => {
                              setLogs((prev) => [...prev, `Project settings open failed: ${String(error)}`]);
                            });
                          }}
                          title="Project settings"
                        >
                          <FaCog className="text-[12px]" />
                        </button>
                        <button
                          className={`project-action-btn app-tooltip-target transition-all duration-300 ${
                            setupRunning
                              ? "pointer-events-none opacity-0 translate-y-0.5"
                              : showProjectActions
                                ? "opacity-100 translate-y-0"
                                : "project-action-btn-idle"
                          }`}
                          data-thread-menu-trigger={project.id}
                          data-app-tooltip={composerTooltipText(
                            "New Thread",
                            "Create a new thread in this project.",
                            `${platformShortcutModifier}+N`
                          )}
                          onClick={() => {
                            setActiveProjectId(project.id);
                            setProjectListOpenById((prev) => ({ ...prev, [project.id]: true }));
                            setThreadMenuProjectId((prev) => {
                              const next = prev === project.id ? null : project.id;
                              if (next === null) {
                                setThreadDraftTitle("New thread");
                              }
                              return next;
                            });
                          }}
                          aria-label="New thread"
                        >
                          <FaPlus
                            className={`text-[12px] transition-transform duration-200 ${
                              menuOpen ? "rotate-45" : "rotate-0"
                            }`}
                          />
                        </button>
                      </div>

                      <div className={projectListOpen ? "project-collapse open" : "project-collapse"} aria-hidden={!projectListOpen}>
                        <div>
                          {menuOpen && (
                            <div ref={threadCreateMenuRef} className="thread-create-pop">
                              <input
                                ref={threadCreateInputRef}
                                value={threadDraftTitle}
                                onChange={(event) => setThreadDraftTitle(event.target.value)}
                                className="input h-8 text-xs"
                                placeholder="New thread"
                                onKeyDown={(event) => {
                                  if (event.key === "Enter") {
                                    event.preventDefault();
                                    createThread(project.id, threadDraftTitle).catch((error) => {
                                      setLogs((prev) => [...prev, `Create thread failed: ${String(error)}`]);
                                    });
                                  }
                                }}
                              />
                              <button
                                className="btn-primary h-8 px-2 py-0 text-xs"
                                onClick={() => {
                                  createThread(project.id, threadDraftTitle).catch((error) => {
                                    setLogs((prev) => [...prev, `Create thread failed: ${String(error)}`]);
                                  });
                                }}
                              >
                                Create
                              </button>
                            </div>
                          )}

                          <div className="thread-list">
                        {visibleRows.length === 0 && (
                          <div
                            className={`thread-empty transition-all duration-300 ${
                              setupRunning ? "pointer-events-none opacity-0 -translate-y-1" : "opacity-100 translate-y-0"
                            }`}
                          >
                            No active threads
                          </div>
                        )}
                        {visibleRows.map(({ thread, depth }) => {
                          const threadRuns = orchestrationRunsByParentId[thread.id] ?? [];
                          const runningChildren = threadRuns.flatMap((run) =>
                            (orchestrationChildrenByRunId[run.id] ?? []).filter(
                              (child) => child.status === "running" || child.status === "queued"
                            )
                          );
                          const showRunningChildren = showRunningSubthreadsByThreadId[thread.id] ?? false;

                          return (
                            <div key={thread.id}>
                              <button
                                className={`${activeThreadId === thread.id ? "thread-row active" : "thread-row"} ${
                                  threadCompletionFlashById[thread.id] ? "thread-row-complete-flash" : ""
                                } ${threadAwaitingInputById[thread.id] ? "thread-row-awaiting-input" : ""}`}
                                style={getThreadRowStyle(thread, depth, activeThreadId === thread.id)}
                                onClick={() => {
                                  activateThreadFromSidebar(project.id, thread.id);
                                }}
                                onContextMenu={(event) => openThreadContextMenu(event, project.id, thread.id)}
                              >
                                <div className="thread-row-main">
                                  <div className="thread-row-title-block">
                                    <div className="thread-row-title-line">
                                      {threadShortcutLabelById?.[thread.id] && (
                                        <span className="thread-shortcut-badge" aria-hidden="true">
                                          {threadShortcutLabelById[thread.id]}
                                        </span>
                                      )}
                                      {thread.pinnedAt && <FaThumbtack className="thread-pin-indicator" aria-label="Pinned thread" />}
                                      <div className="truncate text-left text-sm">{thread.title}</div>
                                    </div>
                                  </div>
                                  <div className="thread-row-actions">
                                    <span
                                      className="thread-row-action-btn"
                                      title="Rename thread"
                                      onClick={(event) => {
                                        event.stopPropagation();
                                        renameThread(thread).catch((error) => {
                                          setLogs((prev) => [...prev, `Thread rename failed: ${String(error)}`]);
                                        });
                                      }}
                                      onKeyDown={(event) => {
                                        if (event.key === "Enter" || event.key === " ") {
                                          event.preventDefault();
                                          event.stopPropagation();
                                          renameThread(thread).catch((error) => {
                                            setLogs((prev) => [...prev, `Thread rename failed: ${String(error)}`]);
                                          });
                                        }
                                      }}
                                      role="button"
                                      tabIndex={0}
                                    >
                                      <FaPen className="text-[10px]" />
                                    </span>
                                    <span
                                      className="thread-row-action-btn"
                                      title={thread.pinnedAt ? "Unpin thread before archiving" : "Archive thread"}
                                      onClick={(event) => {
                                        event.stopPropagation();
                                        setThreadArchived(thread, true).catch((error) => {
                                          setLogs((prev) => [...prev, `Archive thread failed: ${String(error)}`]);
                                        });
                                      }}
                                      onKeyDown={(event) => {
                                        if (event.key === "Enter" || event.key === " ") {
                                          event.preventDefault();
                                          event.stopPropagation();
                                          setThreadArchived(thread, true).catch((error) => {
                                            setLogs((prev) => [...prev, `Archive thread failed: ${String(error)}`]);
                                          });
                                        }
                                      }}
                                      role="button"
                                      tabIndex={0}
                                    >
                                      <FaArchive className="text-[10px]" />
                                    </span>
                                    {threadAwaitingInputById[thread.id] ? (
                                      <div className="thread-awaiting-badge" title="Model is waiting for your input">
                                        Needs input
                                        {(pendingUserQuestionsByThreadId[thread.id]?.length ?? 0)
                                          ? ` (${pendingUserQuestionsByThreadId[thread.id]?.length ?? 0})`
                                          : ""}
                                      </div>
                                    ) : (runStateByThreadId[thread.id] ?? "idle") === "running" ? (
                                      <div className="thread-activity-indicator" aria-label="Agent running" title="Agent running">
                                        <span className={settings.useTurtleSpinners ? "loading-ring turtle-spinner" : "loading-ring"} />
                                      </div>
                                    ) : (
                                      <div className="thread-row-time text-[11px] text-muted">{formatRelative(thread.updatedAt)}</div>
                                    )}
                                  </div>
                                </div>
                                {(settings.showThreadSummaries ?? true) && (
                                  <div className="thread-row-subtitle text-left">{getThreadSidebarSummary(thread)}</div>
                                )}
                              </button>
                              {runningChildren.length > 0 && (
                                <>
                                  <button
                                    className="thread-archived-toggle"
                                    style={{ marginLeft: `${Math.max(0, depth) * 14}px` }}
                                    onClick={() =>
                                      setShowRunningSubthreadsByThreadId((prev) => ({
                                        ...prev,
                                        [thread.id]: !showRunningChildren
                                      }))
                                    }
                                    title="View running sub-threads"
                                  >
                                    {showRunningChildren
                                      ? "Hide running sub-threads"
                                      : `View running sub-threads (${runningChildren.length})`}
                                  </button>
                                  <div className={showRunningChildren ? "thread-archived-group expanded" : "thread-archived-group"}>
                                    <div className="thread-archived-group-inner">
                                      {runningChildren.map((child) => {
                                        const childThreadId = child.childThreadId;
                                        const isActiveChild = childThreadId ? activeThreadId === childThreadId : false;
                                        return (
                                          <button
                                            key={`running-subthread-${thread.id}-${child.id}`}
                                            className={`${isActiveChild ? "thread-row active" : "thread-row"} archived`}
                                            style={{ marginLeft: `${(depth + 1) * 14}px` }}
                                            onClick={() => {
                                              if (!childThreadId) {
                                                return;
                                              }
                                              activateThreadFromSidebar(project.id, childThreadId);
                                            }}
                                            disabled={!childThreadId}
                                          >
                                            <div className="thread-row-main">
                                              <div className="thread-row-title-block">
                                                <div className="truncate text-left text-sm">{"-> "}{child.title}</div>
                                              </div>
                                              <div className="thread-row-actions">
                                                <div className="thread-row-time text-[11px] text-muted">{child.status}</div>
                                                {childThreadId && (
                                                  <span
                                                    className="thread-row-action-btn"
                                                    title="Open sub-thread"
                                                    onClick={(event) => {
                                                      event.stopPropagation();
                                                      activateThreadFromSidebar(project.id, childThreadId);
                                                    }}
                                                    onKeyDown={(event) => {
                                                      if (event.key === "Enter" || event.key === " ") {
                                                        event.preventDefault();
                                                        event.stopPropagation();
                                                        activateThreadFromSidebar(project.id, childThreadId);
                                                      }
                                                    }}
                                                    role="button"
                                                    tabIndex={0}
                                                  >
                                                    <FaEye className="text-[10px]" />
                                                  </span>
                                                )}
                                                {childThreadId && child.status === "running" && (
                                                  <span
                                                    className="thread-row-action-btn"
                                                    title="Stop sub-thread"
                                                    onClick={(event) => {
                                                      event.stopPropagation();
                                                      stopOrchestrationChild(childThreadId).catch((error) => {
                                                        setLogs((prev) => [...prev, `Stop sub-thread failed: ${String(error)}`]);
                                                      });
                                                    }}
                                                    onKeyDown={(event) => {
                                                      if (event.key === "Enter" || event.key === " ") {
                                                        event.preventDefault();
                                                        event.stopPropagation();
                                                        stopOrchestrationChild(childThreadId).catch((error) => {
                                                          setLogs((prev) => [...prev, `Stop sub-thread failed: ${String(error)}`]);
                                                        });
                                                      }
                                                    }}
                                                    role="button"
                                                    tabIndex={0}
                                                  >
                                                    <FaStop className="text-[10px]" />
                                                  </span>
                                                )}
                                              </div>
                                            </div>
                                            {child.lastError && (
                                              <div className="thread-row-subtitle text-left text-rose-300">{child.lastError}</div>
                                            )}
                                          </button>
                                        );
                                      })}
                                    </div>
                                  </div>
                                </>
                              )}
                            </div>
                          );
                        })}
                        {archivedRows.length > 0 && (
                          <div className="thread-archived-controls">
                            <button
                              className="thread-archived-toggle"
                              onClick={() =>
                                setShowArchivedByProjectId((prev) => ({
                                  ...prev,
                                  [project.id]: !showArchived
                                }))
                              }
                              title="View archived threads"
                            >
                              {showArchived ? (
                                <>
                                  {isAltThreadSwitchHintVisible && (
                                    <span className="thread-shortcut-badge" aria-hidden="true">
                                      A
                                    </span>
                                  )}
                                  <span>Hide archived</span>
                                </>
                              ) : (
                                <>
                                  {isAltThreadSwitchHintVisible && (
                                    <span className="thread-shortcut-badge" aria-hidden="true">
                                      A
                                    </span>
                                  )}
                                  <span>View archived</span>
                                  <span className="thread-archived-count-chip" aria-label={`${archivedRows.length} archived threads`}>
                                    {archivedRows.length}
                                  </span>
                                </>
                              )}
                            </button>
                            {showArchived ? (
                              <button
                                className="thread-archived-delete-all-btn"
                                title="Delete archived threads"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  deleteArchivedThreadsInProject(project.id).catch((error) => {
                                    setLogs((prev) => [...prev, `Delete archived threads failed: ${String(error)}`]);
                                  });
                                }}
                              >
                                <FaTrashAlt className="text-[10px]" />
                                Delete all
                              </button>
                            ) : null}
                          </div>
                        )}
                        <div className={showArchived ? "thread-archived-group expanded" : "thread-archived-group"}>
                          <div className="thread-archived-group-inner">
                            {archivedRows.map(({ thread, depth }) => (
                            <button
                              key={`archived-${thread.id}`}
                              className={`${activeThreadId === thread.id ? "thread-row active archived" : "thread-row archived"} ${
                                threadCompletionFlashById[thread.id] ? "thread-row-complete-flash" : ""
                              } ${threadAwaitingInputById[thread.id] ? "thread-row-awaiting-input" : ""}`}
                              style={getThreadRowStyle(thread, depth, activeThreadId === thread.id)}
                              onClick={() => {
                                activateThreadFromSidebar(project.id, thread.id);
                              }}
                              onContextMenu={(event) => openThreadContextMenu(event, project.id, thread.id)}
                            >
                              <div className="thread-row-main">
                                <div className="thread-row-title-block">
                                  <div className="thread-row-title-line">
                                    {threadShortcutLabelById?.[thread.id] && (
                                      <span className="thread-shortcut-badge" aria-hidden="true">
                                        {threadShortcutLabelById[thread.id]}
                                      </span>
                                    )}
                                    {thread.pinnedAt && <FaThumbtack className="thread-pin-indicator" aria-label="Pinned thread" />}
                                    <div className="truncate text-left text-sm">{thread.title}</div>
                                  </div>
                                </div>
                                <div className="thread-row-actions">
                                  <span
                                    className="thread-row-action-btn"
                                    title="Rename thread"
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      renameThread(thread).catch((error) => {
                                        setLogs((prev) => [...prev, `Thread rename failed: ${String(error)}`]);
                                      });
                                    }}
                                    onKeyDown={(event) => {
                                      if (event.key === "Enter" || event.key === " ") {
                                        event.preventDefault();
                                        event.stopPropagation();
                                        renameThread(thread).catch((error) => {
                                          setLogs((prev) => [...prev, `Thread rename failed: ${String(error)}`]);
                                        });
                                      }
                                    }}
                                    role="button"
                                    tabIndex={0}
                                  >
                                    <FaPen className="text-[10px]" />
                                  </span>
                                  <span
                                    className="thread-row-action-btn"
                                    title="Restore thread"
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      setThreadArchived(thread, false).catch((error) => {
                                        setLogs((prev) => [...prev, `Restore thread failed: ${String(error)}`]);
                                      });
                                    }}
                                    onKeyDown={(event) => {
                                      if (event.key === "Enter" || event.key === " ") {
                                        event.preventDefault();
                                        event.stopPropagation();
                                        setThreadArchived(thread, false).catch((error) => {
                                          setLogs((prev) => [...prev, `Restore thread failed: ${String(error)}`]);
                                        });
                                      }
                                    }}
                                    role="button"
                                    tabIndex={0}
                                  >
                                    <FaBoxOpen className="text-[10px]" />
                                  </span>
                                  <span
                                    className="thread-row-action-btn"
                                    title="Delete thread"
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      deleteThread(thread).catch((error) => {
                                        setLogs((prev) => [...prev, `Delete thread failed: ${String(error)}`]);
                                      });
                                    }}
                                    onKeyDown={(event) => {
                                      if (event.key === "Enter" || event.key === " ") {
                                        event.preventDefault();
                                        event.stopPropagation();
                                        deleteThread(thread).catch((error) => {
                                          setLogs((prev) => [...prev, `Delete thread failed: ${String(error)}`]);
                                        });
                                      }
                                    }}
                                    role="button"
                                    tabIndex={0}
                                  >
                                    <FaTrashAlt className="text-[10px]" />
                                  </span>
                                  {threadAwaitingInputById[thread.id] ? (
                                    <div className="thread-awaiting-badge" title="Model is waiting for your input">
                                      Needs input
                                      {(pendingUserQuestionsByThreadId[thread.id]?.length ?? 0) > 0
                                        ? ` (${pendingUserQuestionsByThreadId[thread.id]?.length ?? 0})`
                                        : ""}
                                    </div>
                                  ) : (runStateByThreadId[thread.id] ?? "idle") === "running" ? (
                                    <div className="thread-activity-indicator" aria-label="Agent running" title="Agent running">
                                      <span className={settings.useTurtleSpinners ? "loading-ring turtle-spinner" : "loading-ring"} />
                                    </div>
                                  ) : (
                                    <div className="thread-row-time text-[11px] text-muted">{formatRelative(thread.updatedAt)}</div>
                                  )}
                                </div>
                              </div>
                              {(settings.showThreadSummaries ?? true) && (
                                <div className="thread-row-subtitle text-left">{getThreadSidebarSummary(thread)}</div>
                              )}
                            </button>
                            ))}
                          </div>
                        </div>
                          </div>
                      </div>
                    </div>
                    </section>
                  );
                })}

                {archivedProjectsInActiveWorkspace.length > 0 && (
                  <>
                    <div className="thread-archived-controls">
                      <button
                        className="thread-archived-toggle"
                        onClick={() =>
                          setShowArchivedProjectsByWorkspaceId((prev) => ({
                            ...prev,
                            [activeWorkspaceId ?? "__all__"]: !prev[activeWorkspaceId ?? "__all__"]
                          }))
                        }
                        title="View archived projects"
                      >
                        {(showArchivedProjectsByWorkspaceId[activeWorkspaceId ?? "__all__"] ?? false) ? (
                          "Hide archived projects"
                        ) : (
                          <>
                            <span>View archived projects</span>
                            <span
                              className="thread-archived-count-chip"
                              aria-label={`${archivedProjectsInActiveWorkspace.length} archived projects`}
                            >
                              {archivedProjectsInActiveWorkspace.length}
                            </span>
                          </>
                        )}
                      </button>
                    </div>
                    <div
                      className={
                        (showArchivedProjectsByWorkspaceId[activeWorkspaceId ?? "__all__"] ?? false)
                          ? "thread-archived-group expanded"
                          : "thread-archived-group"
                      }
                    >
                      <div className="thread-archived-group-inner">
                        {archivedProjectsInActiveWorkspace.map((project) => (
                          <section key={`archived-project-${project.id}`} className="project-section archived">
                            <div className="project-head" style={getProjectRowStyle(project, false)}>
                              <button
                                type="button"
                                className="project-folder-toggle open"
                                style={{ color: project.color ?? "#64748b" }}
                                title="Archived project"
                                disabled
                              >
                                <FaFolder className="project-folder-icon" aria-hidden="true" />
                              </button>
                              <div className="project-row">
                                <span className="min-w-0 flex-1 overflow-hidden">
                                  <span className="block truncate">{project.name}</span>
                                  <span className="mt-0.5 block truncate text-[10px] leading-4 text-slate-400">
                                    Archived {project.archivedAt ? formatRelative(project.archivedAt) : ""}
                                  </span>
                                </span>
                              </div>
                              <button
                                className="project-action-btn opacity-100"
                                onClick={() => {
                                  setProjectArchived(project, false).catch((error) => {
                                    setLogs((prev) => [...prev, `Restore project failed: ${String(error)}`]);
                                  });
                                }}
                                title="Restore project"
                              >
                                <FaBoxOpen className="text-[12px]" />
                              </button>
                              <button
                                className="project-action-btn opacity-100"
                                onClick={() => {
                                  deleteProjectById(project.id).catch((error) => {
                                    setLogs((prev) => [...prev, `Project remove failed: ${String(error)}`]);
                                  });
                                }}
                                title="Delete project"
                              >
                                <FaTrashAlt className="text-[12px]" />
                              </button>
                            </div>
                          </section>
                        ))}
                      </div>
                    </div>
                  </>
                )}
              </div>
              <div ref={threadContextMenuRef} className="thread-context-menu" style={{ display: "none" }}>
                <button ref={threadContextMenuRenameRef} className="thread-context-menu-item" onClick={handleThreadContextMenuRename}>
                  Rename thread
                </button>
                <button ref={threadContextMenuArchiveRef} className="thread-context-menu-item" onClick={() => handleThreadContextMenuArchive(true)}>
                  Archive thread
                </button>
                <button
                  ref={threadContextMenuUnarchiveRef}
                  className="thread-context-menu-item"
                  style={{ display: "none" }}
                  onClick={() => handleThreadContextMenuArchive(false)}
                >
                  Unarchive thread
                </button>
                <button ref={threadContextMenuButtonRef} className="thread-context-menu-item" onClick={handleThreadContextMenuPin}>
                  Pin thread
                </button>
                <button className="thread-context-menu-item" onClick={handleThreadContextMenuDelete}>
                  Delete thread
                </button>
                <div className="thread-context-menu-divider" />
                <div className="thread-context-menu-colors" role="group" aria-label="Thread color">
                  <button
                    type="button"
                    data-thread-color=""
                    className="thread-context-color-btn is-clear"
                    onClick={() => handleThreadContextMenuColor("")}
                    aria-label="Use default thread color"
                    title="Default color"
                  />
                  {THREAD_COLOR_PRESETS.map((color) => (
                    <button
                      key={color}
                      type="button"
                      data-thread-color={color}
                      className="thread-context-color-btn"
                      style={{ backgroundColor: color }}
                      onClick={() => handleThreadContextMenuColor(color)}
                      aria-label={`Set thread color ${color}`}
                      title={color}
                    />
                  ))}
                </div>
              </div>
            </aside>

            <main className="main-layout-content flex h-full min-h-0 min-w-0 flex-col">
              {codexAuthBlocked && !isCodexAuthCardDismissed && (
                <section className="mx-4 mt-3 rounded-xl border border-border bg-panel/70 p-3">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <h3 className="text-sm font-semibold tracking-wide text-slate-100">Codex Sign-In Required</h3>
                    <button
                      type="button"
                      className="btn-ghost h-7 px-2 py-0 text-xs"
                      onClick={() => setIsCodexAuthCardDismissed(true)}
                      aria-label="Dismiss Codex sign-in notice"
                      title="Dismiss"
                    >
                      <FaTimes className="text-[10px]" />
                    </button>
                  </div>
                  <p className="mb-3 text-sm text-slate-300">
                    {codexAuthStatus?.email
                      ? `Current account: ${codexAuthStatus.email}. Re-authenticate to continue using Codex.`
                      : "You are not signed in to Codex. Sign in to start or continue Codex runs."}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <button
                      className="btn-primary"
                      onClick={() => {
                        startCodexLogin().catch((error) => {
                          setLogs((prev) => [...prev, `Codex login failed: ${String(error)}`]);
                        });
                      }}
                      disabled={codexLoginInFlight}
                    >
                      {codexLoginInFlight ? "Opening Sign-In..." : "Sign In to Codex"}
                    </button>
                    <button
                      className="btn-secondary"
                      onClick={() => {
                        loadCodexAuthStatus().catch((error) => {
                          setLogs((prev) => [...prev, `Codex auth status refresh failed: ${String(error)}`]);
                        });
                      }}
                    >
                      Refresh Status
                    </button>
                  </div>
                </section>
              )}

              {hasUserPromptInThread && installStatus && setupBlocked && !isSetupCardDismissed && (
                <section className="mx-4 mt-3 rounded-xl border border-border bg-panel/70 p-3">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <h3 className="text-sm font-semibold tracking-wide text-slate-100">Setup Required</h3>
                    <button
                      type="button"
                      className="btn-ghost h-7 px-2 py-0 text-xs"
                      onClick={() => setIsSetupCardDismissed(true)}
                      aria-label="Dismiss setup required notice"
                      title="Dismiss"
                    >
                      <FaTimes className="text-[10px]" />
                    </button>
                  </div>
                  <div className="mb-3 grid grid-cols-2 gap-2 text-sm">
                    {installStatus.details
                      .filter((detail) => REQUIRED_SETUP_KEYS.has(detail.key) || SUPPORTED_HARNESSES.some((harness) => harness.id === detail.key))
                      .map((detail) => (
                        <div key={detail.key} className="rounded-lg border border-border bg-black/20 p-2">
                          <div className="font-medium">{INSTALL_DETAIL_LABELS[detail.key] ?? detail.key}</div>
                          <div className={detail.ok ? "text-slate-100" : "text-slate-300"}>
                            {detail.ok ? `Ready${detail.version ? ` (${detail.version})` : ""}` : detail.message}
                          </div>
                        </div>
                      ))}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button className="btn-primary" onClick={() => setShowSetupModal(true)}>
                      Open Setup
                    </button>
                    <button
                      className="btn-secondary"
                      onClick={() => {
                        loadInstallerStatus().catch((error) => {
                          setLogs((prev) => [...prev, `Refresh setup status failed: ${String(error)}`]);
                        });
                      }}
                    >
                      Refresh Status
                    </button>
                  </div>
                </section>
              )}

              <section ref={timelineViewportRef} className="flex-1 min-h-0 overflow-x-hidden overflow-y-auto px-5 py-4">
                {!hasProjects && (
                  <div className="mx-auto mt-20 max-w-lg text-center">
                    <p className="text-sm text-muted">Open a local folder to begin.</p>
                  </div>
                )}

                {hasProjects && !activeThread && (
                  <div className="mx-auto mt-20 max-w-lg text-center">
                    <p className="text-sm text-muted">
                      {activeProject
                        ? `Use the + icon next to ${activeProject.name} to create a thread.`
                        : "Select a project, then use the + icon to create a thread."}
                    </p>
                  </div>
                )}

                {hasProjects && activeThread && !hasUserPromptInThread && (
                  <div className="mb-6 overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-surface/90 via-panel/75 to-surface/60 p-4 shadow-[0_12px_28px_rgba(0,0,0,0.18)]">
                    <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">New Thread</p>
                        <h2 className="text-lg font-semibold text-slate-100">Start with momentum</h2>
                        <p className="mt-1 text-sm text-slate-300">Pick a starter and refine it for your codebase.</p>
                      </div>
                      <div className="rounded-full border border-border bg-black/20 px-3 py-1 text-xs text-slate-300">
                        {activeProject ? activeProject.name : "Project selected"}
                      </div>
                    </div>
                    <div className="mb-4 flex flex-wrap gap-2 text-xs text-slate-300">
                      <span className="rounded-full border border-border bg-black/20 px-2.5 py-1">Mention files with `@`</span>
                      <span className="rounded-full border border-border bg-black/20 px-2.5 py-1">Attach screenshots for UI bugs</span>
                      <span className="rounded-full border border-border bg-black/20 px-2.5 py-1">Shift+Enter adds a new line</span>
                    </div>
                    <div className="grid gap-2 md:grid-cols-2">
                      {STARTER_PROMPT_CARDS.map((card) => {
                        const Icon = card.Icon;
                        return (
                          <button
                            key={card.title}
                            className="group rounded-xl border border-border/80 bg-black/20 p-3 text-left transition hover:border-zinc-500 hover:bg-black/35"
                            onClick={() => {
                              applyComposerText(card.prompt, true, card.prompt.length);
                              scheduleComposerResize();
                            }}
                          >
                            <div className="mb-2 flex items-center gap-2">
                              <span className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-border bg-black/25 text-slate-200">
                                <Icon className="text-xs" />
                              </span>
                              <span className="text-sm font-semibold text-slate-100">{card.title}</span>
                            </div>
                            <p className="text-sm text-slate-300">{card.description}</p>
                            <div className="mt-2 text-xs text-slate-400 transition group-hover:text-slate-200">Insert starter prompt</div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                <div className="min-w-0 space-y-5 pb-6">
                  {activeThread && activeThreadHasMoreHistory && (
                    <div className="text-center text-xs text-slate-500">
                      {activeThreadHistoryLoading ? "Loading older prompts..." : "Scroll up to load earlier prompts"}
                    </div>
                  )}

                  {settings.condenseActivityTimeline !== false ? (
                    timelineRows.map((row, rowIndex) => {
                      if (row.kind === "message") {
                        const item = row.item;
                        return item.message.role === "assistant" ? (
                          <article key={item.id} className="timeline-item min-w-0 overflow-hidden">
                            <MemoizedAssistantMarkdown
                              messageId={item.message.id}
                              content={item.message.content}
                              plansById={plansById}
                              onViewPlan={openPlanDrawerFor}
                              onBuildPlan={handleBuildPlan}
                              onCopyPlan={copyPlanToClipboard}
                            />
                          </article>
                        ) : (
                          <article key={item.id} className="timeline-item group relative min-w-0 overflow-hidden rounded-lg bg-zinc-900/80 p-3">
                            {activeThread && activeHarnessSupportsFork && (
                              <button
                                type="button"
                                className="btn-ghost absolute right-2 top-2 h-7 w-7 p-0 opacity-0 transition-opacity group-hover:opacity-100 focus:opacity-100"
                                onClick={() => {
                                  forkThreadFromPrompt(activeThread, item.message.streamSeq).catch((error) => {
                                    setLogs((prev) => [...prev, `Fork thread failed: ${String(error)}`]);
                                  });
                                }}
                                title="Fork from this prompt"
                                aria-label="Fork from this prompt"
                              >
                                <FaCodeBranch className="text-[10px]" />
                              </button>
                            )}
                            <MemoizedUserMessageContent content={item.message.content} attachments={item.message.attachments} />
                          </article>
                        );
                      }
                      if (row.kind === "plan") {
                        return (
                          <MemoizedTimelinePlanRow
                            key={row.id}
                            item={row.item}
                            plansById={plansById}
                            getTodoPlanByActivityId={getTodoPlanByActivityId}
                            onViewPlan={openPlanDrawerFor}
                            onBuildPlan={handleBuildPlan}
                            onCopyPlan={copyPlanToClipboard}
                            onForkFromUserMessage={activeHarnessSupportsFork ? handleForkFromUserMessage : undefined}
                          />
                        );
                      }

                      const isLastRow = rowIndex === timelineRows.length - 1;
                      return (
                          <MemoizedActivityBundleRow
                            key={row.id}
                            rowId={row.id}
                            chips={row.chips}
                            tsMs={row.tsMs}
                            durationMs={row.durationMs}
                            items={row.items}
                            defaultOpen={isLastRow}
                            plansById={plansById}
                          getTodoPlanByActivityId={getTodoPlanByActivityId}
                          onViewPlan={openPlanDrawerFor}
                          onBuildPlan={handleBuildPlan}
                          onCopyPlan={copyPlanToClipboard}
                          onForkFromUserMessage={activeHarnessSupportsFork ? handleForkFromUserMessage : undefined}
                        />
                      );
                    })
                  ) : (
                    <MemoizedTimelineItemsList
                      timelineItems={timelineItems}
                      plansById={plansById}
                      getTodoPlanByActivityId={getTodoPlanByActivityId}
                      onViewPlan={openPlanDrawerFor}
                      onBuildPlan={handleBuildPlan}
                      onCopyPlan={copyPlanToClipboard}
                      onForkFromUserMessage={activeHarnessSupportsFork ? handleForkFromUserMessage : undefined}
                    />
                  )}

                  {activeRunState === "running" && (
                    <div className="thinking-indicator" role="status" aria-live="polite" aria-label="Assistant is thinking">
                      <span
                        className={
                          settings.useTurtleSpinners
                            ? "loading-ring thinking-indicator-ring turtle-spinner"
                            : "loading-ring thinking-indicator-ring"
                        }
                        aria-hidden="true"
                      />
                      <span className="thinking-indicator-text">Thinking...</span>
                    </div>
                  )}

                </div>
              </section>

              <section className="bg-transparent px-5 py-3">
                <div
                  className={`relative overflow-visible rounded-xl border border-border/70 bg-black/25 p-3 transition ${isDraggingFiles ? "ring-1 ring-zinc-500/80" : ""}`}
                  onDragOver={onDropZoneDragOver}
                  onDragLeave={onDropZoneDragLeave}
                  onDrop={onDropZoneDrop}
                >
                  <input
                    ref={imagePickerRef}
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    onChange={(event) => {
                      const files = Array.from(event.target.files ?? []);
                      if (files.length === 0) {
                        return;
                      }
                      addImageFiles(files).catch((error) => {
                        setLogs((prev) => [...prev, `Image attach failed: ${String(error)}`]);
                      });
                      event.currentTarget.value = "";
                    }}
                  />
                  {composerAttachments.length > 0 && (
                    <div className="mb-2 flex flex-wrap gap-2">
                      {composerAttachments.map((attachment) => (
                        <div key={attachment.id} className="attachment-chip">
                          <img src={attachment.previewUrl} alt={attachment.name} className="attachment-thumb" />
                          <div className="attachment-meta">
                            <div className="truncate text-xs text-slate-100">{attachment.name}</div>
                            <div className="text-[10px] text-slate-400">{Math.max(1, Math.round(attachment.size / 1024))} KB</div>
                          </div>
                          <button
                            className="attachment-remove"
                            onClick={() => removeAttachment(attachment.id)}
                            title={`Remove ${attachment.name}`}
                          >
                            <FaTimes className="mx-auto text-[10px]" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                  {composerMentionedFiles.length > 0 && (
                    <div className="mb-2 flex flex-wrap gap-2">
                      {composerMentionedFiles.map((path) => {
                        const label = formatMentionFileLabel(path, composerMentionedFileDuplicateBasenames);
                        return (
                          <div
                            key={`mentioned-${path}`}
                            className="inline-flex max-w-[280px] items-center gap-2 rounded-md border border-cyan-600/40 bg-cyan-900/15 px-2 py-1 text-xs text-cyan-100"
                            title={path}
                          >
                            <span className="truncate">{label}</span>
                            <button
                              className="rounded bg-cyan-950/40 px-1 text-[10px] text-cyan-200 transition hover:bg-cyan-900/60"
                              onClick={() => removeMentionedFile(path)}
                              title={`Remove ${label}`}
                            >
                              <FaTimes className="mx-auto text-[10px]" />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                  {composerMentionedSkills.length > 0 && (
                    <div className="mb-2 flex flex-wrap gap-2">
                      {composerMentionedSkills.map((skill) => (
                        <div
                          key={`mentioned-skill-${skill.path}`}
                          className="inline-flex max-w-[280px] items-center gap-2 rounded-md border border-emerald-600/40 bg-emerald-900/15 px-2 py-1 text-xs text-emerald-100"
                          title={skill.path}
                        >
                          <span className="truncate">${skill.name}</span>
                          <button
                            className="rounded bg-emerald-950/40 px-1 text-[10px] text-emerald-200 transition hover:bg-emerald-900/60"
                            onClick={() => removeMentionedSkill(skill.name)}
                            title={`Remove ${skill.name}`}
                          >
                            <FaTimes className="mx-auto text-[10px]" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  {showQuestionComposer ? (
                    <div className="w-full">
                      <div className="space-y-3">
                        {activeQuestion && (() => {
                          const answer = activeUserQuestionAnswers[activeQuestion.id] ?? {
                            selectedOption: activeQuestion.options[0]?.label ?? CUSTOM_QUESTION_OPTION_VALUE,
                            customValue: ""
                          };
                          const selectedOption =
                            answer.selectedOption || (activeQuestion.options[0]?.label ?? CUSTOM_QUESTION_OPTION_VALUE);
                          const customValue = selectedOption === CUSTOM_QUESTION_OPTION_VALUE ? answer.customValue : "";
                          const hasMultiple = activePendingUserQuestions.length > 1;
                          const canGoBack = hasMultiple && activeQuestionIndex > 0;
                          const canGoNext = hasMultiple && activeQuestionIndex < activePendingUserQuestions.length - 1;

                          return (
                            <div key={`question-overlay-${activeQuestion.id}`} className="space-y-2">
                              <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0">
                                  <div className="text-[11px] uppercase tracking-[0.08em] text-slate-400">
                                    {activeQuestion.header}
                                    {hasMultiple ? ` (${activeQuestionIndex + 1}/${activePendingUserQuestions.length})` : ""}
                                  </div>
                                  <div className="text-sm text-slate-100">{activeQuestion.question}</div>
                                </div>
                                {hasMultiple && (
                                  <div className="inline-flex items-center gap-1">
                                    <button
                                      className="btn-ghost h-7 w-7 px-0 py-0"
                                      onClick={() => navigateActiveQuestion(-1)}
                                      disabled={!canGoBack}
                                      title="Previous question"
                                    >
                                      <FaChevronLeft className="mx-auto text-[10px]" />
                                    </button>
                                    <button
                                      className="btn-ghost h-7 w-7 px-0 py-0"
                                      onClick={() => navigateActiveQuestion(1)}
                                      disabled={!canGoNext}
                                      title="Next question"
                                    >
                                      <FaChevronRight className="mx-auto text-[10px]" />
                                    </button>
                                  </div>
                                )}
                              </div>
                              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                                {activeQuestion.options.map((option) => {
                                  const selected = selectedOption === option.label;
                                  return (
                                    <button
                                      key={`${activeQuestion.id}-option-${option.label}`}
                                      className={
                                        selected
                                          ? "h-9 w-full rounded-md border border-zinc-600 bg-zinc-800 px-2 text-xs text-slate-100"
                                          : "h-9 w-full rounded-md border border-border bg-zinc-900/60 px-2 text-xs text-slate-300 hover:bg-zinc-800"
                                      }
                                      onClick={() => selectQuestionOption(activeQuestion, option.label)}
                                    >
                                      {option.label}
                                    </button>
                                  );
                                })}
                              </div>
                              <div>
                                <input
                                  className="input h-9 text-xs"
                                  value={customValue}
                                  onChange={(event) =>
                                    setUserQuestionAnswersByThreadId((prev) => {
                                      if (!activeThread) {
                                        return prev;
                                      }
                                      return {
                                        ...prev,
                                        [activeThread.id]: {
                                          ...(prev[activeThread.id] ?? {}),
                                          [activeQuestion.id]: {
                                            ...(prev[activeThread.id]?.[activeQuestion.id] ?? {
                                              selectedOption: CUSTOM_QUESTION_OPTION_VALUE,
                                              customValue: ""
                                            }),
                                            selectedOption: CUSTOM_QUESTION_OPTION_VALUE,
                                            customValue: event.target.value
                                          }
                                        }
                                      };
                                    })
                                  }
                                  placeholder="Write your own response..."
                                />
                              </div>
                            </div>
                          );
                        })()}
                        <div className="flex justify-end">
                          <button
                            className="btn-primary"
                            onClick={() => {
                              submitRequestedInput().catch((error) => {
                                setLogs((prev) => [...prev, `Submit requested input failed: ${String(error)}`]);
                              });
                            }}
                            disabled={!activeThreadId || activeQuestionsRequireAnswer}
                          >
                            Submit
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <>
                      {activeQueuedPromptCount > 0 && (
                        <div className="mb-2 space-y-2">
                          <div className="text-[11px] text-slate-400">Queued prompts: {activeQueuedPromptCount}</div>
                          <div className="space-y-1.5">
                            {activeQueuedPrompts.map((prompt, index) => {
                              const preview = prompt.input.replace(/\s+/g, " ").trim() || "(attachments only)";
                              return (
                                <div
                                  key={prompt.id}
                                  className="rounded-md border border-border/70 bg-black/20 px-2 py-1.5 text-xs text-slate-200"
                                >
                                  <div className="flex items-center justify-between gap-2">
                                    <div className="min-w-0">
                                      <div className="text-[10px] uppercase tracking-wide text-slate-400">
                                        #{index + 1}
                                        {prompt.attachments.length > 0 ? ` | ${prompt.attachments.length} image(s)` : ""}
                                        {prompt.skills.length > 0 ? ` | ${prompt.skills.length} skill(s)` : ""}
                                      </div>
                                      <div className="truncate text-slate-200">{preview}</div>
                                    </div>
                                    <div className="inline-flex items-center gap-1">
                                      <button
                                        className="btn-secondary composer-tooltip-target px-2 py-1 text-[11px]"
                                        data-composer-tooltip={
                                          activeRunState === "running"
                                            ? composerTooltipText(
                                                "Steer Queued Prompt",
                                                "Inject this queued prompt into the active run."
                                              )
                                            : composerTooltipText(
                                                "Steer Queued Prompt",
                                                "Start a run first, then steer this queued prompt."
                                              )
                                        }
                                        aria-label="Steer queued prompt"
                                        onClick={() => {
                                          if (!activeThreadId) {
                                            return;
                                          }
                                          steerQueuedPrompt(activeThreadId, prompt).catch((error) => {
                                            setLogs((prev) => [...prev, `Queued steer failed: ${String(error)}`]);
                                          });
                                        }}
                                        disabled={!activeThreadId || activeRunState !== "running"}
                                      >
                                        <span className="inline-flex items-center gap-1">
                                          <FaPaperPlane className="text-[10px]" />
                                          Steer now
                                        </span>
                                      </button>
                                      <button
                                        className="btn-danger composer-tooltip-target px-2 py-1 text-[11px]"
                                        data-composer-tooltip={composerTooltipText(
                                          "Cancel Queued Prompt",
                                          "Remove this prompt from the queue."
                                        )}
                                        aria-label="Cancel queued prompt"
                                        onClick={() => {
                                          if (!activeThreadId) {
                                            return;
                                          }
                                          cancelQueuedPrompt(activeThreadId, prompt.id);
                                        }}
                                        disabled={!activeThreadId}
                                      >
                                        <span className="inline-flex items-center gap-1">
                                          <FaTimes className="text-[10px]" />
                                          Cancel
                                        </span>
                                      </button>
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                      <textarea
                        ref={composerTextareaRef}
                        className="composer-textarea min-h-[56px] w-full resize-none bg-transparent font-sans text-sm leading-relaxed outline-none"
                        onChange={(event) => onComposerChange(event.target.value, event.target.selectionStart)}
                        onKeyDown={onComposerKeyDown}
                        onSelect={(event) => syncComposerMentionFromTextarea(event.currentTarget)}
                        onClick={(event) => syncComposerMentionFromTextarea(event.currentTarget)}
                        onPaste={onComposerPaste}
                        placeholder={activeThreadSendPending ? "Sending prompt..." : activeThread ? "Send a prompt to the active thread" : "Create a thread to start chatting"}
                        disabled={!activeThreadId || activeThreadSendPending}
                      />
                      {fileMention && (
                        <div
                          ref={fileMentionMenuRef}
                          className="absolute bottom-[calc(100%+8px)] left-2 right-2 z-40 max-h-56 overflow-y-auto rounded-md border border-border bg-zinc-950/95 p-1 shadow-lg backdrop-blur"
                        >
                          {fileMentionMatches.length > 0 ? (
                            fileMentionMatches.map((entry, index) => {
                              const selected = index === fileMentionHighlightIndex;
                              return (
                                <button
                                  key={`mention-${entry.path}`}
                                  className={`flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-xs transition ${
                                    selected ? "bg-zinc-900 text-white" : "text-slate-300 hover:bg-zinc-800 hover:text-white"
                                  }`}
                                  onMouseDown={(event) => {
                                    event.preventDefault();
                                    insertMentionedFile(entry);
                                  }}
                                >
                                  <span className="min-w-0 truncate">
                                    {formatMentionFileLabel(entry.path, fileMentionDuplicateBasenames)}
                                  </span>
                                  <span className="shrink-0 rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-slate-400">
                                    {index === 0 ? "recent" : "file"}
                                  </span>
                                </button>
                              );
                            })
                          ) : (
                            <div className="px-2 py-1.5 text-xs text-slate-500">No matching files in this project.</div>
                          )}
                        </div>
                      )}
                      {skillMention && (
                        <div
                          ref={skillMentionMenuRef}
                          className="absolute bottom-[calc(100%+8px)] left-2 right-2 z-40 max-h-56 overflow-y-auto rounded-md border border-border bg-zinc-950/95 p-1 shadow-lg backdrop-blur"
                        >
                          {skillMentionMatches.length > 0 ? (
                            skillMentionMatches.map((skill, index) => {
                              const selected = index === skillMentionHighlightIndex;
                              return (
                                <button
                                  key={`skill-mention-${skill.path}`}
                                  className={`flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-xs transition ${
                                    selected ? "bg-zinc-900 text-white" : "text-slate-300 hover:bg-zinc-800 hover:text-white"
                                  }`}
                                  onMouseDown={(event) => {
                                    event.preventDefault();
                                    insertMentionedSkill(skill);
                                  }}
                                >
                                  <span className="min-w-0 truncate">{skill.name}</span>
                                  <span className="shrink-0 rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-slate-400">
                                    skill
                                  </span>
                                </button>
                              );
                            })
                          ) : (
                            <div className="px-2 py-1.5 text-xs text-slate-500">No matching enabled skills.</div>
                          )}
                        </div>
                      )}
                  <div className="mt-2 flex items-center justify-between gap-2">
                    <div className="composer-toolbar">
                      <button
                        className="composer-plus-btn composer-tooltip-target"
                        data-composer-tooltip={composerTooltipText("Attach Images", "Add up to 4 images to this prompt.")}
                        aria-label="Attach images"
                        disabled={!activeThreadId || activeThreadSendPending}
                        onClick={() => imagePickerRef.current?.click()}
                      >
                        <FaPlus className="mx-auto text-[11px]" />
                      </button>
                      {SHOW_VOICE_INPUT_BUTTON ? (
                        <button
                          className={`composer-plus-btn composer-tooltip-target ${isVoiceRecording ? "composer-plus-btn-recording" : ""}`}
                          data-composer-tooltip={
                            isVoiceTranscribing
                              ? composerTooltipText("Transcribing Voice", "Converting your recording to text with Whisper.")
                              : isVoiceRecording
                                ? composerTooltipText("Stop Recording", "Finish recording and transcribe into the composer.")
                                : composerTooltipText("Voice Input", "Record speech and insert transcript into the composer.")
                          }
                          aria-label={isVoiceRecording ? "Stop recording voice input" : "Start recording voice input"}
                          disabled={!activeThreadId || activeThreadSendPending || isVoiceTranscribing}
                          onClick={() => {
                            toggleVoiceRecording().catch((error) => {
                              setLogs((prev) => [...prev, `Voice input failed: ${String(error)}`]);
                            });
                          }}
                        >
                          {isVoiceRecording ? <FaStop className="mx-auto text-[11px]" /> : <FaMicrophone className="mx-auto text-[11px]" />}
                        </button>
                      ) : null}
                      <button
                        ref={composerModelTriggerRef}
                        className="composer-dropdown-trigger composer-tooltip-target"
                        data-composer-tooltip={composerTooltipText("Model", "Choose which model handles this request.")}
                        aria-label="Choose model"
                        onClick={() => openComposerDropdown("model", composerModelTriggerRef.current)}
                        disabled={!activeThreadId || activeThreadSendPending}
                      >
                        <span>{formatModelDisplayName(modelLabel)}</span>
                        <FaChevronDown className="text-[10px] text-slate-500" />
                      </button>
                      <button
                        ref={composerEffortTriggerRef}
                        className="composer-dropdown-trigger composer-tooltip-target"
                        data-composer-tooltip={composerTooltipText("Reasoning Effort", "Set how deeply the model reasons.")}
                        aria-label="Choose reasoning effort"
                        onClick={() => openComposerDropdown("effort", composerEffortTriggerRef.current)}
                        disabled={!activeThreadId || activeThreadSendPending}
                      >
                        <span>{effortLabel.toLowerCase()}</span>
                        <FaChevronDown className="text-[10px] text-slate-500" />
                      </button>
                      <button
                        ref={composerModeTriggerRef}
                        className="composer-dropdown-trigger composer-tooltip-target"
                        data-composer-tooltip={composerTooltipText(
                          "Collaboration Mode",
                          "Switch between coding and plan workflows.",
                          `${platformShortcutModifier}+Shift+P sets Plan mode`
                        )}
                        aria-label="Choose collaboration mode"
                        onClick={() => openComposerDropdown("mode", composerModeTriggerRef.current)}
                        disabled={!activeThreadId || activeThreadSendPending}
                      >
                        <span>{modeLabel.toLowerCase()}</span>
                        <FaChevronDown className="text-[10px] text-slate-500" />
                      </button>
                      {composerAttachments.length > 0 && (
                        <span className="text-xs text-muted">{composerAttachments.length} image(s)</span>
                      )}
                    </div>
                    {activeRunState === "running" ? (
                      hasComposerPayload ? (
                        <div className="inline-flex items-center gap-1">
                          <button
                            className="btn-primary composer-tooltip-target"
                            data-composer-tooltip={composerTooltipText(
                              "Steer Active Run",
                              "Inject this prompt into the currently running turn."
                            )}
                            aria-label="Steer active run"
                            onClick={() => {
                              steerPrompt().catch((error) => {
                                setLogs((prev) => [...prev, `Steer failed: ${String(error)}`]);
                              });
                            }}
                            disabled={!activeThreadId}
                          >
                            <span className="inline-flex items-center gap-1.5">
                              <FaPaperPlane className="text-[11px]" />
                              Steer
                            </span>
                          </button>
                          <button
                            className="btn-secondary composer-tooltip-target"
                            data-composer-tooltip={composerTooltipText(
                              "Queue Prompt",
                              "Add this prompt to the queue while the agent is running.",
                              "Enter queues while running"
                            )}
                            aria-label="Queue prompt"
                            onClick={() => {
                              sendPrompt().catch((error) => {
                                setLogs((prev) => [...prev, `Queue failed: ${String(error)}`]);
                              });
                            }}
                            disabled={!activeThreadId || activeThreadSendPending}
                          >
                            {activeThreadSendPending ? "Queueing..." : "Queue"}
                          </button>
                        </div>
                      ) : (
                        <button
                          className="btn-danger composer-tooltip-target"
                          data-composer-tooltip={composerTooltipText("Stop Run", "Stop the active run for this thread.")}
                          aria-label="Stop current run"
                          onClick={() => {
                            stopActiveRun().catch((error) => {
                              setLogs((prev) => [...prev, `Stop failed: ${String(error)}`]);
                            });
                          }}
                          disabled={!activeThreadId}
                        >
                          <span className="inline-flex items-center gap-1.5">
                            <FaStop className="text-[11px]" />
                            Stop
                          </span>
                        </button>
                      )
                    ) : (
                      <button
                        className="btn-primary composer-tooltip-target"
                        data-composer-tooltip={composerTooltipText(
                          "Send Prompt",
                          "Submit this prompt to the selected thread.",
                          "Enter"
                        )}
                        aria-label="Send prompt"
                        onClick={() => {
                          sendPrompt().catch((error) => {
                            setLogs((prev) => [...prev, `Send failed: ${String(error)}`]);
                          });
                        }}
                        disabled={!activeThreadId || !hasComposerPayload || activeThreadSendPending}
                      >
                        <span className="inline-flex items-center gap-1.5">
                          <FaPaperPlane className="text-[11px]" />
                          {activeThreadSendPending ? "Sending..." : "Send"}
                        </span>
                      </button>
                    )}
                  </div>
                    </>
                  )}
                </div>
                {!showQuestionComposer && (
                  <>
                    <div className="mt-2 composer-toolbar-row">
                      <div className="composer-toolbar">
                        <span className="composer-option">
                          <FaTerminal className="composer-option-icon" />
                          <button
                            ref={composerSandboxTriggerRef}
                            className="composer-dropdown-trigger composer-tooltip-target"
                            data-composer-tooltip={composerTooltipText("Sandbox Mode", "Control filesystem and command isolation.")}
                            aria-label="Choose sandbox mode"
                            onClick={() => openComposerDropdown("sandbox", composerSandboxTriggerRef.current)}
                            disabled={!activeThreadId}
                          >
                            <span>{sandboxLabel}</span>
                            <FaChevronDown className="text-[10px] text-slate-500" />
                          </button>
                        </span>
                        {activeHarnessSupportsCompact && (
                          <button
                            className="composer-toggle-btn composer-tooltip-target"
                            data-composer-tooltip={composerTooltipText("Summarize Context", "Summarize older thread history to reduce context size.")}
                            aria-label="Summarize thread context"
                            onClick={() => {
                              if (!activeThreadId) {
                                return;
                              }
                              api.sessions.compact({ threadId: activeThreadId }).catch((error) => {
                                setLogs((prev) => [...prev, `Thread compact failed: ${String(error)}`]);
                              });
                            }}
                            disabled={!activeThreadId}
                          >
                            <FaSyncAlt className="composer-option-icon" />
                            Summarize
                          </button>
                        )}
                        {activeHarnessSupportsReview && (
                          <button
                            className="composer-toggle-btn composer-tooltip-target"
                            data-composer-tooltip={composerTooltipText("Review Thread", "Run a review on the current chat thread.")}
                            aria-label="Review current thread"
                            onClick={() => {
                              if (!activeThreadId) {
                                setLogs((prev) => [...prev, "Open or select a thread before starting review."]);
                                return;
                              }
                              api.sessions
                                .reviewThread({ threadId: activeThreadId })
                                .then((result) => {
                                  if (!result.ok) {
                                    setLogs((prev) => [...prev, "Thread review failed to start."]);
                                  }
                                })
                                .catch((error) => {
                                  setLogs((prev) => [...prev, `Thread review failed: ${String(error)}`]);
                                });
                            }}
                            disabled={!activeThreadId || activeRunState === "running"}
                            title={activeThreadId ? "Review current thread in the active chat" : "Select a thread to review"}
                          >
                            <FaPen className="composer-option-icon" />
                            Review
                          </button>
                        )}
                        <div className="branch-inline" ref={branchTriggerRef}>
                          {showGitInitLoader ? (
                            <div className="branch-init-loader" role="status" aria-live="polite" aria-label="Initializing git repository">
                              <span className="branch-init-loader-orbit" aria-hidden="true">
                                <span />
                                <span />
                                <span />
                              </span>
                              <span className="branch-init-loader-label">Initializing git...</span>
                            </div>
                          ) : showGitInitAction ? (
                            <button
                              className="branch-trigger branch-trigger-init composer-tooltip-target"
                              data-composer-tooltip={composerTooltipText("Initialize Git", "Create a git repository in this project.")}
                              aria-label="Initialize git repository"
                              onClick={() => {
                                initializeGitRepository().catch((error) => {
                                  setLogs((prev) => [...prev, `Git init failed: ${String(error)}`]);
                                });
                              }}
                              disabled={Boolean(gitBusyAction)}
                            >
                              <span className="inline-flex items-center gap-1 truncate">
                                <FaCodeBranch className="shrink-0 text-[10px] text-cyan-300/90" />
                                Initialize git
                              </span>
                            </button>
                          ) : (
                            <button
                              className={`branch-trigger composer-tooltip-target ${activeGitInitReveal ? "branch-trigger-reveal" : ""}`}
                              data-composer-tooltip={composerTooltipText("Switch Branch", "Open the git branch picker for this project.")}
                              aria-label="Switch git branch"
                              onClick={() => {
                                if (!activeProjectId || !activeGitState?.insideRepo || gitBusyAction) {
                                  return;
                                }
                                setIsBranchDropdownOpen((prev) => !prev);
                                setGitBranchSearch("");
                              }}
                              disabled={!activeProjectId || !activeGitState?.insideRepo || Boolean(gitBusyAction)}
                            >
                              <span className="inline-flex items-center gap-1 truncate">
                                <FaCodeBranch className="shrink-0 text-[10px] text-slate-500" />
                                branch: {activeGitState?.branch ?? "(detached)"}
                              </span>
                              <FaChevronDown className="text-[10px] text-slate-500" />
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                    </>
                )}
              </section>

              {SHOW_TERMINAL && (
                <section className="h-48 border-t border-border bg-black/55 px-6 py-3">
                  <div className="mb-2 flex items-center justify-between">
                    <div className="text-xs uppercase tracking-[0.16em] text-muted">Terminal</div>
                    <button className="btn-secondary text-xs" onClick={() => setTerminalLines([])}>
                      Clear
                    </button>
                  </div>
                  <div className="h-[150px] overflow-hidden rounded-lg border border-border bg-black/35 p-2">
                    <div ref={terminalOutputRef} className="h-full w-full" />
                  </div>
                </section>
              )}
            </main>

            {(isPreviewVisible || isGitPanelOpen) && (
              <aside className="relative flex min-h-0 flex-col border-l border-border/90 bg-black/55">
                {isGitPanelOpen && (
                  <div
                    role="separator"
                    aria-orientation="vertical"
                    aria-label="Resize Git side pane"
                    className="absolute inset-y-0 left-0 z-30 w-2 -translate-x-1/2 cursor-col-resize bg-transparent hover:bg-cyan-400/20"
                    onMouseDown={startRightPanelResize}
                  />
                )}
                {isPreviewVisible && (
                  <>
                    <div className="flex items-center justify-between border-b border-border/80 px-3 py-2">
                      <div className="text-xs uppercase tracking-[0.16em] text-muted">Project Dev</div>
                      <div className="flex items-center gap-1">
                        <button
                          className="btn-ghost"
                          onClick={() => openPreviewInDefaultBrowser().catch((error) => setLogs((prev) => [...prev, `Preview open default failed: ${String(error)}`]))}
                          disabled={!activeProjectPreviewUrl}
                        >
                          Open Default
                        </button>
                        {activeProjectBrowserEnabled && activeProjectBrowserMode === "in_app" && (
                          <>
                            <button className="btn-ghost" onClick={reloadPreviewPane} disabled={!activeProjectPreviewUrl || isPreviewPoppedOut}>
                              Reload
                            </button>
                            <button
                              className="btn-ghost"
                              onClick={() => openPreviewDevTools().catch((error) => setLogs((prev) => [...prev, `Preview DevTools failed: ${String(error)}`]))}
                            >
                              DevTools
                            </button>
                            {!isPreviewPoppedOut ? (
                              <button className="btn-ghost" onClick={() => popoutPreview().catch((error) => setLogs((prev) => [...prev, `Preview pop-out failed: ${String(error)}`]))} disabled={!activeProjectPreviewUrl}>
                                Pop Out
                              </button>
                            ) : (
                              <button className="btn-ghost" onClick={() => closePopoutPreview().catch((error) => setLogs((prev) => [...prev, `Preview close failed: ${String(error)}`]))}>
                                Close Pop-out
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    </div>

                    {!isPreviewPoppedOut ? (
                      <section className="flex min-h-0 flex-1 flex-col">
                        <div className="truncate border-b border-border/80 px-3 py-2 text-xs text-slate-300">
                          {activeProjectPreviewUrl || "Start dev command to detect browser URL."}
                        </div>
                        <div className="min-h-0 flex-1">
                          {activeProjectBrowserEnabled && activeProjectBrowserMode === "in_app" && activeProjectPreviewUrl ? (
                            <webview
                              ref={previewWebviewRef}
                              src={activeProjectPreviewUrl}
                              partition={activeProjectPreviewPartition}
                              className="h-full w-full"
                            />
                          ) : activeProjectBrowserEnabled && activeProjectBrowserMode === "default_browser" ? (
                            <div className="flex h-full flex-col items-center justify-center gap-3 px-4 text-center text-sm text-muted">
                              <div>Preview is configured to open in the user&apos;s default browser.</div>
                              <button
                                className="btn-secondary"
                                onClick={() => openPreviewInDefaultBrowser().catch((error) => setLogs((prev) => [...prev, `Preview open default failed: ${String(error)}`]))}
                                disabled={!activeProjectPreviewUrl}
                              >
                                Open Preview
                              </button>
                            </div>
                          ) : (
                            <div className="flex h-full items-center justify-center px-4 text-center text-sm text-muted">
                              {activeProjectBrowserEnabled ? "No browser URL detected yet." : "Browser is disabled for this project."}
                            </div>
                          )}
                        </div>
                      </section>
                    ) : (
                      <section className="flex min-h-0 flex-1 items-center justify-center px-4 text-center text-sm text-muted">
                        Browser is popped out. Close pop-out to return it to the sidebar.
                      </section>
                    )}
                  </>
                )}

                {isGitPanelOpen && (
                  <>
                    <div className="flex items-center justify-between border-b border-border/80 px-3 py-2">
                      <div className="flex items-center gap-2">
                        <div className="text-xs uppercase tracking-[0.16em] text-muted">Git</div>
                        {activeProjectId && activeGitState?.insideRepo && (
                          <span className="git-branch-chip">{activeGitState.branch ?? "(detached)"}</span>
                        )}
                        {activeProjectId &&
                          activeGitState?.insideRepo &&
                          (activeGitState.ahead > 0 || activeGitState.behind > 0) && (
                            <span className="git-branch-status-chip">
                              {`Ahead ${activeGitState.ahead} / Behind ${activeGitState.behind}`}
                            </span>
                          )}
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          className="btn-ghost"
                          onClick={() => {
                            if (!activeProjectId) {
                              return;
                            }
                            loadGitSnapshot(activeProjectId)
                              .then((snapshot) => {
                                const state = snapshot.state;
                                const selectedPath =
                                  activeSelectedGitPath && state.files.some((file) => file.path === activeSelectedGitPath)
                                    ? activeSelectedGitPath
                                    : state.files[0]?.path;
                                selectGitPath(activeProjectId, selectedPath);
                                return snapshot;
                              })
                              .catch((error) => setLogs((prev) => [...prev, `Git refresh failed: ${String(error)}`]));
                          }}
                          disabled={!activeProjectId || Boolean(gitBusyAction)}
                        >
                          Refresh
                        </button>
                        {!isGitPoppedOut ? (
                          <button
                            className="btn-ghost"
                            onClick={() => openGitPopout().catch((error) => setLogs((prev) => [...prev, `Git pop-out failed: ${String(error)}`]))}
                            disabled={!activeProjectId}
                          >
                            Pop Out
                          </button>
                        ) : (
                          <button
                            className="btn-ghost"
                            onClick={() => closeGitPopout().catch((error) => setLogs((prev) => [...prev, `Git pop-out close failed: ${String(error)}`]))}
                          >
                            Close Pop-out
                          </button>
                        )}
                      </div>
                    </div>

                    <section className="min-h-0 flex-1 overflow-y-auto px-3 py-2">
                      {!activeProjectId ? (
                        <p className="text-xs text-slate-500">Select a project to view git state.</p>
                      ) : !activeGitState?.insideRepo ? (
                        <p className="text-xs text-slate-500">This project is not a git repository.</p>
                      ) : (
                        <div className="space-y-3">
                          <div className="git-panel-card">
                            <div className="git-panel-card-title mb-2">
                              Origin Commits ({activeIncomingCommits.length})
                            </div>
                            <button
                              className="btn-ghost mb-2 w-full justify-center"
                              onClick={() =>
                                runGitAction("fetch", (projectId) => api.git.fetch({ projectId })).catch((error) =>
                                  setLogs((prev) => [...prev, `Git fetch failed: ${String(error)}`])
                                )
                              }
                              disabled={Boolean(gitBusyAction)}
                            >
                              <span className="inline-flex items-center gap-1">
                                {gitBusyAction === "fetch" && (
                                  <span className={settings.useTurtleSpinners ? "loading-ring turtle-spinner" : "loading-ring"} />
                                )}
                                Fetch
                              </span>
                            </button>
                            {activeIncomingCommits.length === 0 ? (
                              <p className="text-xs text-slate-500">No origin-only commits.</p>
                            ) : (
                              activeIncomingCommits.map((commit) => (
                                <div
                                  key={`incoming-${commit.hash}`}
                                  className="git-commit-pill git-commit-pill-incoming mt-1 px-2 py-1 text-xs"
                                >
                                  <div className="git-commit-pill-hash truncate text-[10px]">{commit.hash}</div>
                                  <div className="truncate">{commit.summary}</div>
                                </div>
                              ))
                            )}
                          </div>

                          <div className="git-flow-arrow" aria-hidden="true">
                            <span>{"\u2193"}</span>
                          </div>

                          <div className="git-panel-card">
                            <button
                              className="btn-ghost w-full justify-center"
                              onClick={() => toggleSharedGitHistory().catch((error) => setLogs((prev) => [...prev, `Git shared history toggle failed: ${String(error)}`]))}
                              disabled={activeGitSharedHistoryLoading}
                            >
                              <span className="inline-flex items-center gap-1">
                                {activeGitSharedHistoryLoading && (
                                  <span className={settings.useTurtleSpinners ? "loading-ring turtle-spinner" : "loading-ring"} />
                                )}
                                {activeGitSharedHistoryExpanded ? "Hide Synced History" : "View Synced History"}
                              </span>
                            </button>

                            {activeGitSharedHistoryExpanded && (
                              <div className="git-history-expand mt-2 space-y-2">
                                {activeGitSharedHistoryLoading ? (
                                  <p className="text-xs text-slate-500">Loading synced commits...</p>
                                ) : activeSharedHistory.length === 0 ? (
                                  <p className="text-xs text-slate-500">No shared commit history found for this branch/upstream pair.</p>
                                ) : (
                                  <div className="git-history-scroll space-y-2">
                                    {activeSharedHistory.map((commit) => (
                                      <div key={`shared-${commit.hash}`} className="git-history-commit">
                                        <div className="flex items-center justify-between gap-2">
                                          <div className="git-commit-pill-hash truncate text-[10px]">{commit.hash}</div>
                                          <div className="truncate text-[10px] text-muted">{commit.date}</div>
                                        </div>
                                        <div className="truncate text-xs text-slate-100">{commit.summary}</div>
                                        {commit.refs && <div className="truncate text-[10px] text-muted">{commit.refs}</div>}
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            )}
                          </div>

                          <div className="git-flow-arrow" aria-hidden="true">
                            <span>{"\u2191"}</span>
                          </div>

                          <div className="git-panel-card">
                            <div className="git-panel-card-title mb-2">
                              Local Commits ({activeOutgoingCommits.length})
                            </div>
                            <button
                              className="btn-ghost mb-2 w-full justify-center"
                              onClick={() =>
                                runGitAction("sync", (projectId) => api.git.sync({ projectId })).catch((error) =>
                                  setLogs((prev) => [...prev, `Git sync failed: ${String(error)}`])
                                )
                              }
                              disabled={Boolean(gitBusyAction) || (activeGitState.ahead === 0 && activeGitState.behind === 0 && activeOutgoingCommits.length === 0)}
                            >
                              <span className="inline-flex items-center gap-1">
                                {gitBusyAction === "sync" && (
                                  <span className={settings.useTurtleSpinners ? "loading-ring turtle-spinner" : "loading-ring"} />
                                )}
                                Sync
                              </span>
                            </button>
                            {activeOutgoingCommits.length === 0 ? (
                              <p className="text-xs text-slate-500">No local commits to push.</p>
                            ) : (
                              activeOutgoingCommits.map((commit) => (
                                <div
                                  key={`outgoing-${commit.hash}`}
                                  className="git-commit-pill git-commit-pill-outgoing mt-1 px-2 py-1 text-xs"
                                >
                                  <div className="git-commit-pill-hash truncate text-[10px]">{commit.hash}</div>
                                  <div className="truncate">{commit.summary}</div>
                                </div>
                              ))
                            )}
                          </div>

                          <div className="git-flow-arrow" aria-hidden="true">
                            <span>{"\u2191"}</span>
                          </div>

                          <div className="git-panel-card">
                            <div className="git-panel-card-title">
                              Staged ({activeStagedFiles.length})
                            </div>
                            <div className="mt-1">
                              <button
                                className="btn-ghost mb-1 w-full justify-center"
                                onClick={() => commitGitChanges().catch((error) => setLogs((prev) => [...prev, `Git commit failed: ${String(error)}`]))}
                                disabled={Boolean(gitBusyAction) || activeGitState.stagedCount === 0}
                                title="Commit staged changes"
                              >
                                <span className="inline-flex items-center gap-1">
                                  <FaSave className="text-[11px]" />
                                  Commit
                                </span>
                              </button>
                              {gitBusyAction === "commit" && gitCommitIsGeneratingMessage && (
                                <div className="mb-1 inline-flex items-center gap-1 text-[11px] text-slate-400">
                                  <span className={settings.useTurtleSpinners ? "loading-ring turtle-spinner" : "loading-ring"} />
                                  Generating AI commit name...
                                </div>
                              )}
                              <input
                                ref={gitCommitInputRef}
                                className="input h-8 text-xs"
                                placeholder="Commit message"
                                disabled={Boolean(gitBusyAction)}
                              />
                            </div>
                            {activeStagedFiles.length === 0 ? (
                              <p className="mt-1 text-xs text-slate-500">No staged files.</p>
                            ) : (
                              activeStagedFiles.map((file) => (
                                <div
                                  key={`staged-${file.path}-${file.indexStatus}-${file.workTreeStatus}`}
                                  className={`mt-1 rounded border px-2 py-1 text-xs ${
                                    activeSelectedGitPath === file.path
                                      ? "git-file-pill git-file-pill-selected"
                                      : "git-file-pill git-file-pill-staged"
                                  }`}
                                >
                                  <div className="flex items-start justify-between gap-2">
                                    <button
                                      className="min-w-0 flex-1 text-left hover:text-white"
                                      onClick={() => activeProjectId && selectGitPath(activeProjectId, file.path)}
                                    >
                                      <div className="truncate">{file.path}</div>
                                    </button>
                                    <button
                                      className="btn-ghost shrink-0 px-2 py-0 text-[10px]"
                                      onClick={() => unstageGitPath(file.path).catch((error) => setLogs((prev) => [...prev, `Git unstage failed: ${String(error)}`]))}
                                      disabled={Boolean(gitBusyAction)}
                                    >
                                      Unstage
                                    </button>
                                  </div>
                                </div>
                              ))
                            )}
                            {activeStagedFiles.length > 0 && (
                              <button
                                className="btn-ghost mt-2 w-full justify-center"
                                onClick={() => unstageGitPath().catch((error) => setLogs((prev) => [...prev, `Git unstage failed: ${String(error)}`]))}
                                disabled={Boolean(gitBusyAction)}
                              >
                                Unstage All
                              </button>
                            )}
                          </div>

                          <div className="git-flow-arrow" aria-hidden="true">
                            <span>{"\u2191"}</span>
                          </div>

                          <div className="git-panel-card">
                            <div className="git-panel-card-title">
                              Unstaged / Untracked ({activeUnstagedFiles.length})
                              {hasMergeConflicts ? ` | Conflicts ${activeConflictFiles.length}` : ""}
                            </div>
                            {hasMergeConflicts && (
                              <button
                                className="btn-ghost mt-1 mb-2 w-full justify-center"
                                onClick={() =>
                                  resolveMergeConflictsWithAi().catch((error) =>
                                    setLogs((prev) => [...prev, `Open merge conflict thread failed: ${String(error)}`])
                                  )
                                }
                                disabled={Boolean(gitBusyAction)}
                                title="Open a dedicated AI thread for conflict resolution"
                              >
                                Resolve Conflicts (AI)
                              </button>
                            )}
                            {hasStageableFiles && (
                              <button
                                className="btn-ghost mt-1 mb-2 w-full justify-center"
                                onClick={() => stageGitPath().catch((error) => setLogs((prev) => [...prev, `Git stage failed: ${String(error)}`]))}
                                disabled={Boolean(gitBusyAction)}
                              >
                                <span className="inline-flex items-center gap-1">
                                  <FaArrowUp className="text-[11px]" />
                                  Stage All
                                </span>
                              </button>
                            )}
                            {activeUnstagedFiles.length === 0 ? (
                              <p className="mt-1 text-xs text-slate-500">No unstaged files.</p>
                            ) : (
                              activeUnstagedFiles.map((file) => (
                                <div
                                  key={`unstaged-${file.path}-${file.indexStatus}-${file.workTreeStatus}`}
                                  className={`mt-1 rounded border px-2 py-1 text-xs ${
                                    activeSelectedGitPath === file.path
                                      ? "git-file-pill git-file-pill-selected"
                                      : file.untracked
                                        ? "git-file-pill git-file-pill-untracked"
                                        : "git-file-pill git-file-pill-unstaged"
                                  }`}
                                >
                                  <div className="flex items-start justify-between gap-2">
                                    <button
                                      className="min-w-0 flex-1 text-left hover:text-white"
                                      onClick={() => activeProjectId && selectGitPath(activeProjectId, file.path)}
                                    >
                                      <div className="truncate">{file.path}</div>
                                    </button>
                                    <button
                                      className="btn-ghost shrink-0 px-2 py-0 text-[10px]"
                                      onClick={() => stageGitPath(file.path).catch((error) => setLogs((prev) => [...prev, `Git stage failed: ${String(error)}`]))}
                                      disabled={Boolean(gitBusyAction)}
                                    >
                                      Stage
                                    </button>
                                  </div>
                                </div>
                              ))
                            )}
                            {hasStageableFiles && (
                              <button
                                className="btn-ghost mt-2 w-full justify-center text-rose-200 hover:text-rose-100"
                                onClick={() => discardGitChanges().catch((error) => setLogs((prev) => [...prev, `Git discard failed: ${String(error)}`]))}
                                disabled={Boolean(gitBusyAction)}
                                title="Discard all unstaged changes"
                              >
                                <span className="inline-flex items-center gap-1">
                                  <FaTrashAlt className="text-[11px]" />
                                  Discard All
                                </span>
                              </button>
                            )}
                          </div>
                          {activeGitState.files.length === 0 && (
                            <p className="text-xs text-slate-500">Working tree clean.</p>
                          )}
                        </div>
                      )}
                    </section>
                  </>
                )}
              </aside>
            )}
          </div>

          {isCodeWindow && (
            <main className="flex min-h-0 flex-1 flex-col">
              <MonacoCodePanel
                activeProjectId={activeProjectId}
                activeProjectPath={activeProject?.path}
                projectName={activeProject?.name}
                appIconSrc={appIconSrc}
                appTheme={settings.theme}
                isMacOS={isMacOS}
                isWindows={isWindows}
                isWindowMaximized={isWindowMaximized}
                onMinimizeWindow={minimizeWindow}
                onToggleMaximizeWindow={toggleMaximizeWindow}
                onCloseWindow={closeWindow}
                appendLog={appendLog}
              />
            </main>
          )}
        </div>
      </div>

      <BranchDropdownPortal
        isOpen={isBranchDropdownOpen}
        activeProjectId={activeProjectId}
        activeInsideRepo={Boolean(activeGitState?.insideRepo)}
        branchDropdownPosition={branchDropdownPosition}
        branchDropdownMenuRef={branchDropdownMenuRef}
        branchListRef={branchListRef}
        gitBranchSearch={gitBranchSearch}
        setGitBranchSearch={setGitBranchSearch}
        setIsBranchDropdownOpen={setIsBranchDropdownOpen}
        setBranchListScrollTop={setBranchListScrollTop}
        setBranchListViewportHeight={setBranchListViewportHeight}
        filteredBranches={filteredBranches}
        visibleBranches={visibleBranches}
        exactBranchMatch={exactBranchMatch}
        canCreateBranchFromInput={canCreateBranchFromInput}
        gitBranchInput={gitBranchInput}
        gitBusyAction={gitBusyAction}
        onSwitchOrCreateBranch={switchOrCreateBranch}
        appendLog={appendLog}
      />

      <ComposerDropdownPortal
        composerDropdown={composerDropdown}
        composerDropdownMenuRef={composerDropdownMenuRef}
        composerOptions={composerOptions}
        currentHarnessId={activeHarnessId}
        visibleHarnesses={visibleHarnesses}
        visibleHarnessCount={visibleHarnessCount}
        canSwitchHarnesses={canSwitchActiveThreadHarness}
        onSelectHarnessModel={(harnessId, model) => {
          selectHarnessModel(harnessId, model).catch((error) => {
            setLogs((prev) => [...prev, `Model switch failed: ${String(error)}`]);
          });
        }}
        setComposerOptions={setComposerOptions}
        setComposerDropdown={setComposerDropdown}
      />

      <div ref={tooltipElementRef} className="app-global-tooltip" role="tooltip" aria-hidden="true" />

      {showSetupModal && installStatus && (
        <SetupModal
          installStatus={installStatus}
          setupDescription="Install the shared tooling once, then make at least one harness available. Codex is bundled with the app. OpenCode can be installed separately."
          requiredSetupKeys={REQUIRED_SETUP_KEYS}
          setupInstalling={setupInstalling}
          setupPermissionGranted={setupPermissionGranted}
          setSetupPermissionGranted={setSetupPermissionGranted}
          setupLiveLines={setupLiveLines}
          setupLogEndRef={setupLogEndRef}
          onClose={() => {
            setShowSetupModal(false);
            setSetupPermissionGranted(false);
          }}
          onRefreshStatus={loadInstallerStatus}
          onRunAutomaticSetup={runAutomaticSetup}
          onInstallHarness={installHarnessCli}
          appendLog={appendLog}
        />
      )}

      {(showSettings || isSettingsWindow) && (
        <SettingsModal
          initialDraft={appSettingsInitialDraft}
          currentHarnessId={settings.defaultHarnessId ?? "codex"}
          isSettingsWindow={isSettingsWindow}
          isMacOS={isMacOS}
          isWindows={isWindows}
          appIconSrc={appIconSrc}
          appSkills={appSkills}
          installStatus={installStatus}
          systemTerminals={systemTerminals}
          skillEditorPath={skillEditorPath}
          skillEditorContent={skillEditorContent}
          setSkillEditorContent={setSkillEditorContent}
          skillEditorSaving={skillEditorSaving}
          settingsSaving={settingsSaving}
          codexAuthStatus={codexAuthStatus}
          codexLoginInFlight={codexLoginInFlight}
          codexLogoutInFlight={codexLogoutInFlight}
          openCodeAuthStatus={openCodeAuthStatus}
          openCodeLoginInFlight={openCodeLoginInFlight}
          openCodeLogoutInFlight={openCodeLogoutInFlight}
          onClose={closeSettingsModal}
          onCloseWindow={closeWindow}
          onStartCodexLogin={startCodexLogin}
          onLogoutCodex={logoutCodex}
          onStartOpenCodeLogin={startOpenCodeLogin}
          onLogoutOpenCode={logoutOpenCode}
          onSaveSettings={saveSettings}
          onSaveSkillEditor={saveSkillEditor}
          onToggleAppSkillEnabled={toggleAppSkillEnabled}
          onOpenSkillEditor={openSkillEditor}
          onPickDefaultProjectDirectory={pickDefaultProjectDirectory}
          appendLog={appendLog}
        />
      )}

      {showProjectSettings && activeProjectId && projectSettingsInitialDraft && (
        <ProjectSettingsModal
          activeProjectId={activeProjectId}
          activeProjectPath={selectedProject?.path ?? ""}
          initialDraft={projectSettingsInitialDraft}
          workspaces={workspaces}
          skillsByProjectId={skillsByProjectId}
          skillEditorPath={skillEditorPath}
          skillEditorContent={skillEditorContent}
          setSkillEditorContent={setSkillEditorContent}
          skillEditorSaving={skillEditorSaving}
          saveSkillEditor={saveSkillEditor}
          removingProject={removingProject}
          onClose={closeProjectSettingsModal}
          onRemoveProject={removeActiveProject}
          onSaveProjectSettings={saveProjectSettings}
          onMoveProjectWorkspace={moveProjectWorkspace}
          onToggleProjectSkillEnabled={toggleProjectSkillEnabled}
          onRefreshProjectSkills={refreshActiveProjectSkills}
          onCreateProjectSkill={createProjectSkill}
          onOpenSkillEditor={openSkillEditor}
          appendLog={appendLog}
        />
      )}

      {showProjectActionsSettings && projectActionsSettingsInitialDraft && (
        <ProjectActionsSettingsModal
          initialDraft={projectActionsSettingsInitialDraft}
          onClose={closeProjectActionsSettingsModal}
          onSave={saveProjectActionsSettings}
          appendLog={appendLog}
        />
      )}

      {showNewProjectModal && (
        <NewProjectModal
          defaultProjectDirectory={settings.defaultProjectDirectory}
          templateOptions={NEW_PROJECT_TEMPLATE_OPTIONS}
          creatingProject={creatingProject}
          onClose={() => setShowNewProjectModal(false)}
          onSubmit={submitNewProject}
          appendLog={appendLog}
        />
      )}

      {showWorkspaceModal && (
        <WorkspaceModal
          mode={workspaceModalMode}
          workspaces={workspaces}
          projects={projects}
          editingWorkspaceId={workspaceEditingId}
          initialDraft={workspaceModalInitialDraft}
          onClose={() => setShowWorkspaceModal(false)}
          onSave={saveWorkspaceFromModal}
          onDelete={deleteWorkspaceFromModal}
          appendLog={appendLog}
        />
      )}

      {showImportProjectModal && (
        <ImportProjectModal
          defaultProjectDirectory={settings.defaultProjectDirectory}
          importProjectQuery={importProjectQuery}
          setImportProjectQuery={setImportProjectQuery}
          shouldShowCloneAction={shouldShowCloneAction}
          importLoading={importLoading}
          importBusyPath={importBusyPath}
          cloneBusy={cloneBusy}
          importCandidatesFiltered={importCandidatesFiltered}
          projects={projects}
          onClose={() => setShowImportProjectModal(false)}
          onLoadImportCandidates={loadImportCandidates}
          onCloneProjectFromQuery={cloneProjectFromQuery}
          onImportProjectFromPath={importProjectFromPath}
          appendLog={appendLog}
        />
      )}

      {renameDialog && (
        <RenameThreadModal
          renameDialog={renameDialog}
          setRenameDialog={setRenameDialog}
          submitRenameDialog={submitRenameDialog}
          appendLog={appendLog}
        />
      )}

      {logs.length > 0 && <ActivityLogOverlay logs={logs} onClear={() => setLogs([])} />}
    </div>
  );
};
