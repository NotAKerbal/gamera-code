import {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ClipboardEventHandler,
  type DragEventHandler,
  type KeyboardEvent as ReactKeyboardEvent,
  type KeyboardEventHandler
} from "react";
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
  FaGlobeAmericas,
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
  FaTrashAlt,
  FaBoxOpen,
  FaUserShield,
  FaWindowMaximize,
  FaWindowMinimize,
  FaWindowRestore
} from "react-icons/fa";
import appIconDark from "./assets/icon_rounded.png";
import appIconLight from "./assets/icon_light.png";
import type {
  AppSettings,
  CodexApprovalMode,
  CodexCollaborationMode,
  CodexModelReasoningEffort,
  CodexSandboxMode,
  CodexThreadOptions,
  CodexWebSearchMode,
  GitRepositoryCandidate,
  GitOutgoingCommit,
  GitState,
  InstallStatus,
  MessageEvent,
  OrchestrationChild,
  OrchestrationRun,
  PermissionMode,
  PreviewEvent,
  PromptAttachment,
  Project,
  ProjectFileEntry,
  ProjectSettings,
  ProjectTerminalSwitchBehavior,
  ProjectWebLink,
  ProjectTerminalEvent,
  ProjectTerminalState,
  SystemTerminalOption,
  SessionEvent,
  SkillRecord,
  SubthreadPolicy,
  Thread,
  ThreadEventsPage,
  Workspace
} from "@code-app/shared";
import {
  APP_VERSION_LABEL,
  APPROVAL_OPTIONS,
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
  MODEL_SUGGESTIONS,
  PROJECT_SWITCH_BEHAVIOR_OPTIONS,
  QUICK_PROMPTS,
  REASONING_OPTIONS,
  REQUIRED_SETUP_KEYS,
  SANDBOX_OPTIONS,
  SHOW_TERMINAL,
  SKILL_MENTION_MATCH_LIMIT,
  THREAD_SUMMARY_STORAGE_KEY,
  WEB_SEARCH_OPTIONS,
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
  formatMentionFileLabel,
  formatRelative,
  getProjectNameFromPath,
  getTerminalPopoutKey,
  isEditableKeyboardTarget,
  isExplorationCommand,
  isLikelyGitRepositoryUrl,
  isSettingsWindowContext,
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
  ProjectSettingsModal,
  RenameThreadModal,
  WorkspaceModal
} from "./appOverlays";
import { SettingsModal } from "./appSettingsModal";
import { SetupModal } from "./appSetupModal";
import { ComposerDropdownPortal } from "./appComposerDropdown";
import { BranchDropdownPortal } from "./appBranchDropdown";
import { MainHeader } from "./appMainHeader";

const api = window.desktopAPI;
const platformHints = `${navigator.platform} ${navigator.userAgent}`.toLowerCase();
const isMacOS = platformHints.includes("mac");
const isWindows = platformHints.includes("win");
const useWindowsStyleHeader = !isMacOS;
type TooltipPlacement = "above" | "below";
const TOOLTIP_HOVER_DELAY_MS = 500;

export const App = () => {
  const isSettingsWindow = isSettingsWindowContext();
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [threads, setThreads] = useState<Thread[]>([]);
  const [activeWorkspaceId, setActiveWorkspaceId] = useState<string | null>(() => readStoredActiveWorkspaceId());
  const [activeProjectId, setActiveProjectId] = useState<string | null>(() => readStoredActiveProjectId());
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
  const [threadDraftTitle, setThreadDraftTitle] = useState("New thread");
  const [isProjectMenuOpen, setIsProjectMenuOpen] = useState(false);
  const [installStatus, setInstallStatus] = useState<InstallStatus | null>(null);
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
    settingsTab: "general" | "codex" | "env" | "skills";
  }>({
    settings: DEFAULT_SETTINGS,
    composerOptions: DEFAULT_SETTINGS.codexDefaults,
    settingsEnvText: envVarsToText(DEFAULT_SETTINGS.envVars),
    settingsTab: "general"
  });
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [settingsSaveNotice, setSettingsSaveNotice] = useState("");
  const [showProjectSettings, setShowProjectSettings] = useState(false);
  const [projectSettingsInitialDraft, setProjectSettingsInitialDraft] = useState<{
    projectName: string;
    projectWorkspaceTargetId: string;
    projectSettingsBrowserEnabled: boolean;
    projectSettingsEnvText: string;
    projectSettingsCommands: Array<{ id: string; name: string; command: string; autoStart: boolean; useForPreview: boolean }>;
    projectSettingsWebLinks: ProjectWebLink[];
    projectSwitchBehaviorOverride: ProjectTerminalSwitchBehavior | "";
    projectSubthreadPolicyOverride: SubthreadPolicy | "";
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
  const [newProjectName, setNewProjectName] = useState("");
  const [importProjectQuery, setImportProjectQuery] = useState("");
  const [importCandidates, setImportCandidates] = useState<GitRepositoryCandidate[]>([]);
  const [importLoading, setImportLoading] = useState(false);
  const [importBusyPath, setImportBusyPath] = useState<string | null>(null);
  const [cloneBusy, setCloneBusy] = useState(false);
  const [creatingProject, setCreatingProject] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);
  const [updateMessage, setUpdateMessage] = useState<string>("");
  const [activity, setActivity] = useState<ActivityEntry[]>([]);
  const tooltipTargetRef = useRef<HTMLElement | null>(null);
  const tooltipElementRef = useRef<HTMLDivElement | null>(null);
  const tooltipVisibleRef = useRef(false);
  const tooltipAnimationFrameRef = useRef<number | null>(null);
  const tooltipHoverTimeoutRef = useRef<number | null>(null);
  const tooltipTextRef = useRef("");
  const tooltipPlacementRef = useRef<TooltipPlacement>("below");
  const [expandedActivityGroups, setExpandedActivityGroups] = useState<Record<string, boolean>>({});
  const [, setExpandedActivityChildren] = useState<Record<string, boolean>>({});
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
  const [composerOptions, setComposerOptions] = useState<CodexThreadOptions>(DEFAULT_SETTINGS.codexDefaults);
  const [composerAttachments, setComposerAttachments] = useState<ComposerAttachment[]>([]);
  const [composerMentionedFiles, setComposerMentionedFiles] = useState<string[]>([]);
  const [composerMentionedSkills, setComposerMentionedSkills] = useState<Array<{ name: string; path: string }>>([]);
  const [isDraggingFiles, setIsDraggingFiles] = useState(false);
  const [projectFilesByProjectId, setProjectFilesByProjectId] = useState<Record<string, ProjectFileEntry[]>>({});
  const [fileMention, setFileMention] = useState<FileMentionState | null>(null);
  const [skillMention, setSkillMention] = useState<SkillMentionState | null>(null);
  const [projectSettingsById, setProjectSettingsById] = useState<Record<string, ProjectSettings>>({});
  const [projectTerminalById, setProjectTerminalById] = useState<Record<string, ProjectTerminalState>>({});
  const [systemTerminals, setSystemTerminals] = useState<SystemTerminalOption[]>([]);
  const [projectPreviewUrlById, setProjectPreviewUrlById] = useState<Record<string, string>>({});
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [isGitPanelOpen, setIsGitPanelOpen] = useState(false);
  const [isPreviewPoppedOut, setIsPreviewPoppedOut] = useState(false);
  const [terminalPopoutByKey, setTerminalPopoutByKey] = useState<Record<string, boolean>>({});
  const [gitStateByProjectId, setGitStateByProjectId] = useState<Record<string, GitState>>({});
  const [gitOutgoingCommitsByProjectId, setGitOutgoingCommitsByProjectId] = useState<Record<string, GitOutgoingCommit[]>>({});
  const [gitIncomingCommitsByProjectId, setGitIncomingCommitsByProjectId] = useState<Record<string, GitOutgoingCommit[]>>({});
  const [gitSelectedPathByProjectId, setGitSelectedPathByProjectId] = useState<Record<string, string | null>>({});
  const [gitBusyAction, setGitBusyAction] = useState<string | null>(null);
  const [gitBranchSearch, setGitBranchSearch] = useState("");
  const [branchListScrollTop, setBranchListScrollTop] = useState(0);
  const [branchListViewportHeight, setBranchListViewportHeight] = useState(208);
  const [gitActivityByProjectId, setGitActivityByProjectId] = useState<Record<string, GitActivityEntry[]>>({});
  const [gitActivityExpandedByProjectId, setGitActivityExpandedByProjectId] = useState<Record<string, boolean>>({});
  const [isGitPoppedOut, setIsGitPoppedOut] = useState(false);
  const [isTerminalDashboardPoppedOut, setIsTerminalDashboardPoppedOut] = useState(false);
  const planPopoutWindowRef = useRef<Window | null>(null);
  const [orchestrationRunsByParentId, setOrchestrationRunsByParentId] = useState<Record<string, OrchestrationRun[]>>({});
  const [orchestrationChildrenByRunId, setOrchestrationChildrenByRunId] = useState<Record<string, OrchestrationChild[]>>({});
  const [showRunningSubthreadsByThreadId, setShowRunningSubthreadsByThreadId] = useState<Record<string, boolean>>({});
  const [selectedOrchestrationTaskKeysByRunId, setSelectedOrchestrationTaskKeysByRunId] = useState<Record<string, string[]>>({});
  const [removingProject, setRemovingProject] = useState(false);
  const [isWindowMaximized, setIsWindowMaximized] = useState(false);
  const [isBranchDropdownOpen, setIsBranchDropdownOpen] = useState(false);
  const [isTerminalMenuOpen, setIsTerminalMenuOpen] = useState(false);
  const [isChangelogOpen, setIsChangelogOpen] = useState(false);
  const [branchDropdownPosition, setBranchDropdownPosition] = useState<{ bottom: number; left: number; width: number } | null>(null);
  const [composerDropdown, setComposerDropdown] = useState<{
    kind: ComposerDropdownKind;
    bottom: number;
    left: number;
    width: number;
  } | null>(null);
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
  const terminalMenuRef = useRef<HTMLDivElement | null>(null);
  const changelogRef = useRef<HTMLDivElement | null>(null);
  const branchDropdownMenuRef = useRef<HTMLDivElement | null>(null);
  const composerModelTriggerRef = useRef<HTMLButtonElement | null>(null);
  const composerEffortTriggerRef = useRef<HTMLButtonElement | null>(null);
  const composerModeTriggerRef = useRef<HTMLButtonElement | null>(null);
  const composerSandboxTriggerRef = useRef<HTMLButtonElement | null>(null);
  const composerApprovalTriggerRef = useRef<HTMLButtonElement | null>(null);
  const composerWebSearchTriggerRef = useRef<HTMLButtonElement | null>(null);
  const gitCommitInputRef = useRef<HTMLInputElement | null>(null);
  const composerDropdownMenuRef = useRef<HTMLDivElement | null>(null);
  const composerMentionRafRef = useRef<number | null>(null);
  const composerResizeRafRef = useRef<number | null>(null);
  const terminalMenuContentRef = useRef<HTMLDivElement | null>(null);
  const terminalMenuTriggerRef = useRef<HTMLButtonElement | null>(null);
  const threadCreateMenuRef = useRef<HTMLDivElement | null>(null);
  const threadCreateInputRef = useRef<HTMLInputElement | null>(null);
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
  const terminalPopoutWindowsRef = useRef<Record<string, Window | null>>({});
  const terminalDashboardWindowRef = useRef<Window | null>(null);
  const isLightTheme = (settings.theme ?? "midnight") === "dawn" || (settings.theme ?? "midnight") === "linen";
  const appIconSrc = isLightTheme ? appIconLight : appIconDark;
  const appendLog = useCallback((line: string) => {
    setLogs((prev) => [...prev, line]);
  }, []);

  const activeThread = useMemo(() => threads.find((thread) => thread.id === activeThreadId) || null, [threads, activeThreadId]);
  const selectedProject = useMemo(
    () => (activeProjectId ? projects.find((project) => project.id === activeProjectId) || null : null),
    [projects, activeProjectId]
  );
  const activeProject = useMemo(
    () => (activeThread ? projects.find((project) => project.id === activeThread.projectId) || selectedProject : selectedProject),
    [projects, activeThread, selectedProject]
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
  const activeRunningTerminalsCount = useMemo(
    () => activeProjectTerminals.filter((terminal) => terminal.running).length,
    [activeProjectTerminals]
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
  const activeStagedFiles = useMemo(
    () => (activeGitState?.files ?? []).filter((file) => file.staged),
    [activeGitState?.files]
  );
  const activeUnstagedFiles = useMemo(
    () => (activeGitState?.files ?? []).filter((file) => file.unstaged || file.untracked),
    [activeGitState?.files]
  );
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
  const modelLabel = composerOptions.model?.trim() ? composerOptions.model.trim() : "Auto";
  const effortLabel =
    REASONING_OPTIONS.find((option) => option.value === (composerOptions.modelReasoningEffort ?? "medium"))?.label ?? "Medium";
  const modeLabel =
    COLLABORATION_OPTIONS.find((option) => option.value === (composerOptions.collaborationMode ?? "plan"))?.label ?? "Plan";
  const sandboxLabel =
    SANDBOX_OPTIONS.find((option) => option.value === (composerOptions.sandboxMode ?? "workspace-write"))?.label ??
    "Read + Write";
  const approvalLabel =
    APPROVAL_OPTIONS.find((option) => option.value === (composerOptions.approvalPolicy ?? "on-request"))?.label ?? "AI decides";
  const webSearchLabel = WEB_SEARCH_OPTIONS.find((option) => option.value === (composerOptions.webSearchMode ?? "cached"))?.label ?? "Cached";
  const platformShortcutModifier = isMacOS ? "Cmd" : "Ctrl";
  const composerTooltipText = (label: string, detail: string, shortcut?: string) =>
    [label, detail, shortcut ? `Shortcut: ${shortcut}` : null].filter(Boolean).join("\n");
  const clearPendingTooltipHover = useCallback(() => {
    if (tooltipHoverTimeoutRef.current !== null) {
      window.clearTimeout(tooltipHoverTimeoutRef.current);
      tooltipHoverTimeoutRef.current = null;
    }
  }, []);
  const clearGlobalTooltip = useCallback(() => {
    clearPendingTooltipHover();
    tooltipTargetRef.current = null;
    tooltipVisibleRef.current = false;
    const tooltip = tooltipElementRef.current;
    if (!tooltip) {
      return;
    }
    tooltip.classList.remove("is-visible", "is-above", "is-below");
    tooltip.setAttribute("aria-hidden", "true");
  }, [clearPendingTooltipHover]);
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
    [clearGlobalTooltip, clearPendingTooltipHover, scheduleTooltipPositionUpdate]
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

  const threadBucketsByProjectId = useMemo(() => {
    return threads.reduce<Record<string, { active: Thread[]; archived: Thread[] }>>((acc, thread) => {
      const bucket = acc[thread.projectId] ?? (acc[thread.projectId] = { active: [], archived: [] });
      if (thread.archivedAt) {
        bucket.archived.push(thread);
      } else {
        bucket.active.push(thread);
      }
      return acc;
    }, {});
  }, [threads]);
  const workspaceById = useMemo(
    () => Object.fromEntries(workspaces.map((workspace) => [workspace.id, workspace])) as Record<string, Workspace>,
    [workspaces]
  );
  const projectsInActiveWorkspace = useMemo(() => {
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
  const hasPendingSubagentReviewByThreadId = useMemo(() => {
    const next: Record<string, boolean> = {};
    Object.entries(orchestrationRunsByParentId).forEach(([threadId, runs]) => {
      next[threadId] = runs.some((run) => run.policy === "ask" && run.status === "proposed");
    });
    return next;
  }, [orchestrationRunsByParentId]);
  const workspaceHeaderItems = useMemo(() => {
    return workspaces.map((workspace) => {
      const workspaceProjectIds = new Set(
        projects.filter((project) => project.workspaceId === workspace.id).map((project) => project.id)
      );
      const workspaceThreads = threads.filter((thread) => !thread.archivedAt && workspaceProjectIds.has(thread.projectId));
      const runningCount = workspaceThreads.filter((thread) => (runStateByThreadId[thread.id] ?? "idle") === "running").length;
      const reviewCount = workspaceThreads.filter(
        (thread) =>
          Boolean(threadAwaitingInputById[thread.id]) ||
          (pendingUserQuestionsByThreadId[thread.id]?.length ?? 0) > 0 ||
          Boolean(hasPendingSubagentReviewByThreadId[thread.id])
      ).length;
      const finishedCount = workspaceThreads.filter((thread) => Boolean(threadFinishedUnreadById[thread.id])).length;
      return {
        ...workspace,
        runningCount,
        reviewCount,
        finishedCount
      };
    });
  }, [
    workspaces,
    projects,
    threads,
    runStateByThreadId,
    threadAwaitingInputById,
    pendingUserQuestionsByThreadId,
    hasPendingSubagentReviewByThreadId,
    threadFinishedUnreadById
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
    const allProjects = await api.projects.list();
    setProjects(allProjects);

    const activeStillExists = activeProjectId ? allProjects.some((project) => project.id === activeProjectId) : false;
    if (activeStillExists) {
      return;
    }

    const storedProjectId = readStoredActiveProjectId();
    if (storedProjectId && allProjects.some((project) => project.id === storedProjectId)) {
      setActiveProjectId(storedProjectId);
      return;
    }

    const workspaceId = workspaceIdOverride ?? activeWorkspaceId;
    const projectsInWorkspace = workspaceId
      ? allProjects.filter((project) => project.workspaceId === workspaceId)
      : allProjects;
    setActiveProjectId(projectsInWorkspace[0]?.id ?? allProjects[0]?.id ?? null);
  };

  const loadThreads = async () => {
    const data = await api.threads.list({ includeArchived: true });
    const codexThreads = data.filter((thread) => thread.provider === "codex");
    const threadIds = codexThreads.map((thread) => thread.id);
    setThreads(codexThreads);
    await Promise.all(
      threadIds.map((threadId) =>
        loadOrchestrationRuns(threadId).catch((error) => {
          setLogs((prev) => [...prev, `Load orchestration failed: ${String(error)}`]);
        })
      )
    );
    const threadIdSet = new Set(threadIds);
    setOrchestrationRunsByParentId((prev) =>
      Object.fromEntries(Object.entries(prev).filter(([threadId]) => threadIdSet.has(threadId)))
    );

    if (activeThreadId && !codexThreads.some((thread) => thread.id === activeThreadId)) {
      setActiveThreadId(codexThreads[0]?.id ?? null);
      return;
    }

    if (!activeThreadId && codexThreads.length > 0) {
      if (activeWorkspaceId) {
        const workspaceProjectIds = new Set(
          projects.filter((project) => project.workspaceId === activeWorkspaceId).map((project) => project.id)
        );
        const workspaceThread = codexThreads.find((thread) => workspaceProjectIds.has(thread.projectId));
        if (workspaceThread) {
          setActiveThreadId(workspaceThread.id);
          return;
        }
      }
      setActiveThreadId(codexThreads[0]!.id);
    }
  };

  const loadSettings = async () => {
    const current = await api.settings.get();
    applySettings(current);
    setAppSettingsInitialDraft({
      settings: current,
      composerOptions: current.codexDefaults,
      settingsEnvText: envVarsToText(current.envVars),
      settingsTab: "general"
    });
    setSettingsSaveNotice("");
    await loadAppSkills();
  };

  const applySettings = (next: AppSettings) => {
    setSettings(next);
    setComposerOptions(next.codexDefaults);
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
    setProjectTerminalById((prev) => ({
      ...prev,
      [projectId]: state
    }));
    return state;
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
    document.documentElement.setAttribute("data-theme", settings.theme ?? "midnight");
  }, [settings.theme]);

  useEffect(() => {
    if (!activeThreadId) {
      return;
    }
    const target = threads.find((thread) => thread.id === activeThreadId);
    if (!target || target.provider !== "codex") {
      return;
    }
    loadOrchestrationRuns(activeThreadId).catch((error) => {
      setLogs((prev) => [...prev, `Load orchestration failed: ${String(error)}`]);
    });
  }, [activeThreadId, threads]);

  useEffect(() => {
    if (!activeThread || activeProjectId === activeThread.projectId) {
      return;
    }
    setActiveProjectId(activeThread.projectId);
  }, [activeThread, activeProjectId]);

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
      setComposerMentionedFiles([]);
      setComposerMentionedSkills([]);
      setFileMention(null);
      setSkillMention(null);
      return;
    }
    const draft = composerDraftByThreadId[activeThreadId] ?? "";
    applyComposerText(draft);
    setComposerMentionedSkills(extractSkillsFromInput(draft, activeSkills).skills);
    scheduleComposerResize();
  }, [activeThreadId, activeSkills, composerDraftByThreadId]);

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
      const { selectedWorkspaceId } = await loadWorkspaces();
      await loadProjects(selectedWorkspaceId);
      await loadThreads();
      await loadSettings();
      await loadSystemTerminals();
      await loadInstallerStatus();
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
    writeStoredActiveProjectId(activeProjectId);
  }, [activeProjectId]);

  useEffect(() => {
    writeStoredActiveWorkspaceId(activeWorkspaceId);
  }, [activeWorkspaceId]);

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
          setProjectTerminalById((prev) => ({
            ...prev,
            [activeProjectId]: state
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
    if (activeProjectBrowserEnabled || !isPreviewPoppedOut) {
      return;
    }
    api.preview.closePopout().catch((error) => {
      setLogs((prev) => [...prev, `Preview close failed: ${String(error)}`]);
    });
    setIsPreviewPoppedOut(false);
  }, [activeProjectBrowserEnabled, isPreviewPoppedOut]);

  useEffect(() => {
    if (!activeProjectBrowserEnabled && isPreviewOpen) {
      setIsPreviewOpen(false);
    }
  }, [activeProjectBrowserEnabled, isPreviewOpen]);

  useEffect(() => {
    if (!isPreviewPoppedOut || !activeProjectPreviewUrl) {
      return;
    }
    api.preview.navigate({ url: activeProjectPreviewUrl, projectName: activeProject?.name }).catch((error) => {
      setLogs((prev) => [...prev, `Preview pop-out navigate failed: ${String(error)}`]);
    });
  }, [isPreviewPoppedOut, activeProjectPreviewUrl, activeProjectId, activeProject]);

  useEffect(() => {
    (window as Window & {
      __codeappTerminalDashboardAction?: (action: string, commandId?: string) => void;
      __codeappTerminalPopoutAction?: (action: string, commandId: string) => void;
    }).__codeappTerminalDashboardAction = (action: string, commandId?: string) => {
      if (action === "start_all") {
        startActiveProjectTerminal().catch((error) => setLogs((prev) => [...prev, `Terminal start failed: ${String(error)}`]));
        return;
      }
      if (action === "stop_all") {
        stopActiveProjectTerminal().catch((error) => setLogs((prev) => [...prev, `Terminal stop failed: ${String(error)}`]));
        return;
      }
      if (action === "restart_all") {
        Promise.all(
          activeProjectTerminals
            .filter((terminal) => terminal.running)
            .map((terminal) =>
              startActiveProjectTerminal(terminal.commandId).catch((error) =>
                setLogs((prev) => [...prev, `Terminal restart failed: ${String(error)}`])
              )
            )
        ).catch(() => undefined);
        return;
      }
      if (!commandId) {
        return;
      }
      const terminal = activeProjectTerminals.find((item) => item.commandId === commandId);
      if (!terminal) {
        return;
      }
      if (action === "start") {
        startActiveProjectTerminal(commandId).catch((error) => setLogs((prev) => [...prev, `Terminal start failed: ${String(error)}`]));
        return;
      }
      if (action === "stop") {
        stopActiveProjectTerminal(commandId).catch((error) => setLogs((prev) => [...prev, `Terminal stop failed: ${String(error)}`]));
        return;
      }
      if (action === "copy") {
        copyTerminalOutput(terminal.name, terminal.outputTail || "");
        return;
      }
      if (action === "open_popout") {
        openTerminalPopout(terminal);
        return;
      }
      if (action === "close_popout" && activeProjectId) {
        closeTerminalPopout(getTerminalPopoutKey(activeProjectId, commandId));
      }
    };
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
      delete (window as Window & { __codeappTerminalDashboardAction?: (action: string, commandId?: string) => void })
        .__codeappTerminalDashboardAction;
      delete (window as Window & { __codeappTerminalPopoutAction?: (action: string, commandId: string) => void })
        .__codeappTerminalPopoutAction;
    };
  }, [activeProjectId, activeProjectTerminals, terminalPopoutByKey]);

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
      renderTerminalPopout(popout, terminal, projectName);
    });
    const dashboardPopout = terminalDashboardWindowRef.current;
    if (dashboardPopout && !dashboardPopout.closed) {
      renderTerminalDashboardPopout(dashboardPopout);
    }
  }, [projectTerminalById, projects, activeProjectId, activeProject, activeProjectTerminals, activeRunningTerminalsCount, terminalPopoutByKey]);

  useEffect(() => {
    return () => {
      Object.values(terminalPopoutWindowsRef.current).forEach((popout) => {
        if (popout && !popout.closed) {
          popout.close();
        }
      });
      terminalPopoutWindowsRef.current = {};
      if (terminalDashboardWindowRef.current && !terminalDashboardWindowRef.current.closed) {
        terminalDashboardWindowRef.current.close();
      }
      terminalDashboardWindowRef.current = null;
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
    setIsTerminalMenuOpen(false);
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
    if (!isTerminalMenuOpen) {
      return;
    }

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!terminalMenuRef.current?.contains(target)) {
        setIsTerminalMenuOpen(false);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsTerminalMenuOpen(false);
      }
    };

    window.addEventListener("mousedown", handlePointerDown);
    window.addEventListener("keydown", handleEscape);
    return () => {
      window.removeEventListener("mousedown", handlePointerDown);
      window.removeEventListener("keydown", handleEscape);
    };
  }, [isTerminalMenuOpen]);

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
        composerSandboxTriggerRef.current,
        composerApprovalTriggerRef.current,
        composerWebSearchTriggerRef.current
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
      setMessages([]);
      setTerminalLines([]);
      setActivity([]);
      setComposerMentionedFiles([]);
      setComposerMentionedSkills([]);
      setFileMention(null);
      setSkillMention(null);
      pendingHistoryScrollRestoreRef.current = null;
      lastStartedOptionsKeyRef.current = "";
      setComposerAttachments((prev) => {
        prev.forEach((attachment) => URL.revokeObjectURL(attachment.previewUrl));
        return [];
      });
      return;
    }

    clearFinishedUnreadThread(activeThreadId);

    const bootThread = async () => {
      setComposerMentionedFiles([]);
      setComposerMentionedSkills([]);
      setComposerAttachments((prev) => {
        prev.forEach((attachment) => URL.revokeObjectURL(attachment.previewUrl));
        return [];
      });
      setIsDraggingFiles(false);
      setFileMention(null);
      setSkillMention(null);
      const historyPage = await api.threads.events({
        threadId: activeThreadId,
        userPromptCount: HISTORY_USER_PROMPT_WINDOW
      });
      applyThreadHistoryPage(activeThreadId, historyPage, "replace");
      setTerminalLines([]);
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
        composerOptions: settings.codexDefaults,
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

    setNewProjectName("");
    setShowNewProjectModal(true);
  };

  const submitNewProject = async () => {
    const parentDir = settings.defaultProjectDirectory?.trim() ?? "";
    if (!parentDir) {
      setLogs((prev) => [...prev, "Set a default project directory in Settings first."]);
      setShowNewProjectModal(false);
      openAppSettingsWindow().catch((error) => {
        setLogs((prev) => [...prev, `Open settings window failed: ${String(error)}`]);
      });
      return;
    }

    const projectName = sanitizeProjectDirName(newProjectName);
    if (!projectName) {
      setLogs((prev) => [...prev, "Project name is required and cannot contain path separators."]);
      return;
    }

    setCreatingProject(true);
    try {
      const project = await assignProjectToActiveWorkspace(await api.projects.createInDirectory({ name: projectName, parentDir }));
      await loadProjects();
      setActiveProjectId(project.id);
      setShowNewProjectModal(false);
      setNewProjectName("");
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
    const nextCommands = current.devCommands.map((command, index) => ({
      ...command,
      autoStart: command.autoStart ?? index === 0,
      useForPreview: command.useForPreview ?? index === 0
    }));
    const nextWebLinks = (current.webLinks ?? []).map((link, index) => ({
      id: link.id?.trim() || `link-${index + 1}`,
      name: link.name ?? "",
      url: link.url ?? ""
    }));
    const projectName = projects.find((project) => project.id === projectId)?.name ?? "";
    const projectWorkspaceId = projects.find((project) => project.id === projectId)?.workspaceId ?? "";
    setProjectSettingsInitialDraft({
      projectName,
      projectWorkspaceTargetId: projectWorkspaceId,
      projectSettingsBrowserEnabled: current.browserEnabled ?? true,
      projectSettingsEnvText: envVarsToText(current.envVars),
      projectSettingsCommands: nextCommands,
      projectSettingsWebLinks: nextWebLinks,
      projectSwitchBehaviorOverride: current.switchBehaviorOverride ?? "",
      projectSubthreadPolicyOverride: current.subthreadPolicyOverride ?? ""
    });
    if (activeProjectId !== projectId) {
      setActiveProjectId(projectId);
    }
    setShowProjectSettings(true);
  };

  const saveProjectSettings = async (draft: {
    projectName: string;
    projectWorkspaceTargetId: string;
    projectSettingsBrowserEnabled: boolean;
    projectSettingsEnvText: string;
    projectSettingsCommands: Array<{ id: string; name: string; command: string; autoStart: boolean; useForPreview: boolean }>;
    projectSettingsWebLinks: ProjectWebLink[];
    projectSwitchBehaviorOverride: ProjectTerminalSwitchBehavior | "";
    projectSubthreadPolicyOverride: SubthreadPolicy | "";
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

    const sanitizedCommands = draft.projectSettingsCommands
      .map((command) => ({
        id: command.id.trim(),
        name: command.name.trim(),
        command: command.command.trim(),
        autoStart: Boolean(command.autoStart),
        useForPreview: Boolean(command.useForPreview)
      }))
      .filter((command) => command.id && command.name && command.command);

    if (sanitizedCommands.length === 0) {
      setLogs((prev) => [...prev, "Project settings save failed: at least one dev command is required."]);
      return;
    }

    if (!sanitizedCommands.some((command) => command.useForPreview) && sanitizedCommands[0]) {
      sanitizedCommands[0] = { ...sanitizedCommands[0], useForPreview: true };
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
      workspaceId: draft.projectWorkspaceTargetId || undefined
    });
    setProjects((prev) => prev.map((project) => (project.id === updatedProject.id ? updatedProject : project)));
    if (activeProjectId === updatedProject.id) {
      setActiveWorkspaceId(updatedProject.workspaceId);
    }

    const saved = await api.projectSettings.set({
      projectId: activeProjectId,
      envVars,
      devCommands: sanitizedCommands,
      webLinks: sanitizedWebLinks,
      browserEnabled: draft.projectSettingsBrowserEnabled,
      switchBehaviorOverride: draft.projectSwitchBehaviorOverride || undefined,
      subthreadPolicyOverride: draft.projectSubthreadPolicyOverride || undefined
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
  };

  const removeActiveProject = async () => {
    if (!activeProjectId || removingProject) {
      return;
    }

    const project = projects.find((item) => item.id === activeProjectId);
    const projectName = project?.name ?? "this project";
    const confirmed = window.confirm(
      `Remove "${projectName}" from GameraCode?\n\nThis removes its app settings and threads. Project files on disk are not deleted.`
    );
    if (!confirmed) {
      return;
    }

    const projectIdToRemove = activeProjectId;
    setRemovingProject(true);
    try {
      await api.projects.delete({ id: projectIdToRemove });
      setShowProjectSettings(false);
      setProjectSettingsInitialDraft(null);
      setProjectSettingsById((prev) => {
        const next = { ...prev };
        delete next[projectIdToRemove];
        return next;
      });
      setProjectTerminalById((prev) => {
        const next = { ...prev };
        delete next[projectIdToRemove];
        return next;
      });
      setProjectPreviewUrlById((prev) => {
        const next = { ...prev };
        delete next[projectIdToRemove];
        return next;
      });
      setGitStateByProjectId((prev) => {
        const next = { ...prev };
        delete next[projectIdToRemove];
        return next;
      });
      setGitOutgoingCommitsByProjectId((prev) => {
        const next = { ...prev };
        delete next[projectIdToRemove];
        return next;
      });
      setGitSelectedPathByProjectId((prev) => {
        const next = { ...prev };
        delete next[projectIdToRemove];
        return next;
      });
      setGitActivityByProjectId((prev) => {
        const next = { ...prev };
        delete next[projectIdToRemove];
        return next;
      });
      setLogs((prev) => [...prev, `Project removed: ${projectName}`]);
      await Promise.all([loadProjects(), loadThreads()]);
    } catch (error) {
      setLogs((prev) => [...prev, `Project remove failed: ${String(error)}`]);
    } finally {
      setRemovingProject(false);
    }
  };

  const startActiveProjectTerminal = async (commandId?: string) => {
    if (!activeProjectId) {
      return;
    }
    const state = await api.projectTerminal.start({ projectId: activeProjectId, commandId });
    setProjectTerminalById((prev) => ({
      ...prev,
      [activeProjectId]: state
    }));
  };

  const stopActiveProjectTerminal = async (commandId?: string) => {
    if (!activeProjectId) {
      return;
    }
    await api.projectTerminal.stop({ projectId: activeProjectId, commandId });
    const state = await api.projectTerminal.getState({ projectId: activeProjectId });
    setProjectTerminalById((prev) => ({
      ...prev,
      [activeProjectId]: state
    }));
  };

  const runGitAction = async (
    label: string,
    action: (projectId: string) => Promise<{ ok: boolean; stdout: string; stderr: string }>
  ) => {
    if (!activeProjectId) {
      return;
    }

    setGitBusyAction(label);
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

      const nextSnapshot = await loadGitSnapshot(activeProjectId);
      const nextState = nextSnapshot.state;
      const selectedPath =
        activeSelectedGitPath && nextState.files.some((file) => file.path === activeSelectedGitPath)
          ? activeSelectedGitPath
          : nextState.files[0]?.path;
      selectGitPath(activeProjectId, selectedPath);
    } finally {
      setGitBusyAction(null);
    }
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

  const commitGitChanges = async () => {
    if (!activeProjectId) {
      return;
    }
    setGitBusyAction("commit");
    try {
      const result = await api.git.commit({
        projectId: activeProjectId,
        message: gitCommitInputRef.current?.value.trim() || undefined
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
        if (gitCommitInputRef.current) {
          gitCommitInputRef.current.value = "";
        }
      }

      const nextSnapshot = await loadGitSnapshot(activeProjectId);
      const nextState = nextSnapshot.state;
      const selectedPath =
        activeSelectedGitPath && nextState.files.some((file) => file.path === activeSelectedGitPath)
          ? activeSelectedGitPath
          : nextState.files[0]?.path;
      selectGitPath(activeProjectId, selectedPath);
    } finally {
      setGitBusyAction(null);
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
      :root { color-scheme: dark; font-family: "Space Grotesk", "Avenir Next", sans-serif; }
      * { box-sizing: border-box; }
      body { margin: 0; background: #0b0d10; color: #e5e7eb; height: 100vh; }
      .shell { height: 100vh; display: flex; flex-direction: column; }
      .head { display: flex; align-items: center; justify-content: space-between; gap: 8px; min-height: 48px; padding: 8px 10px; border-bottom: 1px solid #2f2f2f; background: #0f1013; -webkit-app-region: drag; }
      .head.macos { padding-left: 5rem; }
      .meta { min-width: 0; }
      .brand { display: flex; align-items: center; gap: 8px; min-width: 0; }
      .icon { width: 26px; height: 26px; border-radius: 8px; }
      .title { font-size: 13px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: #e2e8f0; }
      .command { font-size: 11px; color: #94a3b8; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .controls { display: flex; align-items: center; gap: 6px; -webkit-app-region: no-drag; }
      .btn { height: 30px; border: 1px solid transparent; border-radius: 8px; background: transparent; color: #cbd5e1; padding: 0 10px; font-size: 12px; cursor: pointer; }
      .btn:hover { background: #1f2937; color: #fff; }
      .btn:disabled { opacity: 0.45; cursor: default; }
      .window-btn { width: 34px; height: 28px; border: 0; border-radius: 8px; background: transparent; color: #cbd5e1; font-size: 13px; cursor: pointer; }
      .window-btn:hover { background: #1f2937; color: #fff; }
      .window-btn.close:hover { background: rgba(239, 68, 68, 0.2); color: #fee2e2; }
      .status { font-size: 11px; color: #94a3b8; min-width: 50px; text-align: right; }
      .output { margin: 0; padding: 12px; flex: 1; min-height: 0; overflow: auto; font-family: "IBM Plex Mono", "Fira Code", monospace; font-size: 11px; line-height: 1.35; white-space: pre-wrap; word-break: break-word; background: #0b0d10; }
      .line { display: block; min-height: 1.35em; }
      .dim { opacity: 0.72; }
      .bold { font-weight: 700; }
      .italic { font-style: italic; }
      .underline { text-decoration: underline; }
    </style>
  </head>
  <body>
    <div id="codeapp-terminal-popout" class="shell">
      <div class="head${isMacOS ? " macos" : ""}">
        <div class="brand">
          <img src="${appIconDark}" class="icon" alt="" />
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
      <div id="terminal-output" class="output">No terminal output yet.</div>
    </div>
    <script>
      const colorByCode = {
        30: "#111827", 31: "#f87171", 32: "#4ade80", 33: "#facc15", 34: "#60a5fa", 35: "#c084fc", 36: "#22d3ee", 37: "#e5e7eb",
        90: "#6b7280", 91: "#ef4444", 92: "#22c55e", 93: "#eab308", 94: "#3b82f6", 95: "#a855f7", 96: "#06b6d4", 97: "#f9fafb",
        40: "#111827", 41: "#7f1d1d", 42: "#14532d", 43: "#713f12", 44: "#1e3a8a", 45: "#581c87", 46: "#155e75", 47: "#d1d5db",
        100: "#374151", 101: "#991b1b", 102: "#166534", 103: "#854d0e", 104: "#1d4ed8", 105: "#6b21a8", 106: "#0e7490", 107: "#f3f4f6"
      };

      const defaultStyle = () => ({
        fg: "",
        bg: "",
        bold: false,
        dim: false,
        italic: false,
        underline: false
      });

      const applySgr = (style, paramsText) => {
        const params = paramsText.length ? paramsText.split(";").map((token) => Number(token) || 0) : [0];
        for (const code of params) {
          if (code === 0) {
            Object.assign(style, defaultStyle());
            continue;
          }
          if (code === 1) { style.bold = true; continue; }
          if (code === 2) { style.dim = true; continue; }
          if (code === 3) { style.italic = true; continue; }
          if (code === 4) { style.underline = true; continue; }
          if (code === 22) { style.bold = false; style.dim = false; continue; }
          if (code === 23) { style.italic = false; continue; }
          if (code === 24) { style.underline = false; continue; }
          if (code === 39) { style.fg = ""; continue; }
          if (code === 49) { style.bg = ""; continue; }
          if ((code >= 30 && code <= 37) || (code >= 90 && code <= 97)) {
            style.fg = colorByCode[code] || "";
            continue;
          }
          if ((code >= 40 && code <= 47) || (code >= 100 && code <= 107)) {
            style.bg = colorByCode[code] || "";
          }
        }
      };

      const styleKey = (style) => JSON.stringify(style);

      const pushText = (segments, style, text) => {
        if (!text) {
          return;
        }
        const key = styleKey(style);
        const prev = segments.length > 0 ? segments[segments.length - 1] : null;
        if (prev && prev.key === key) {
          prev.text += text;
          return;
        }
        segments.push({ key, text, style: { ...style } });
      };

      const popBackspace = (segments, buffer) => {
        if (buffer.length > 0) {
          return buffer.slice(0, -1);
        }
        const last = segments.length > 0 ? segments[segments.length - 1] : null;
        if (!last || last.text.length === 0) {
          return buffer;
        }
        last.text = last.text.slice(0, -1);
        if (!last.text) {
          segments.pop();
        }
        return buffer;
      };

      const parseTerminal = (raw) => {
        const lines = [];
        let lineSegments = [];
        let textBuffer = "";
        const style = defaultStyle();

        const flush = () => {
          if (!textBuffer) {
            return;
          }
          pushText(lineSegments, style, textBuffer);
          textBuffer = "";
        };

        for (let index = 0; index < raw.length; index += 1) {
          const ch = raw[index];
          if (ch === "\\u001b" && raw[index + 1] === "]") {
            flush();
            let end = index + 2;
            while (end < raw.length) {
              if (raw[end] === "\\u0007") {
                break;
              }
              if (raw[end] === "\\u001b" && raw[end + 1] === "\\\\") {
                end += 1;
                break;
              }
              end += 1;
            }
            index = end;
            continue;
          }
          if (ch === "\\u001b" && raw[index + 1] === "[") {
            flush();
            let end = index + 2;
            while (end < raw.length && !/[A-Za-z]/.test(raw[end])) {
              end += 1;
            }
            if (end < raw.length) {
              const command = raw[end];
              const params = raw.slice(index + 2, end);
              if (command === "m") {
                applySgr(style, params);
              } else if (command === "K") {
                lineSegments = [];
                textBuffer = "";
              } else if (command === "J" && params.trim() === "2") {
                lines.length = 0;
                lineSegments = [];
                textBuffer = "";
              }
              index = end;
              continue;
            }
          }
          if (ch === "\\r") {
            if (raw[index + 1] === "\\n") {
              continue;
            }
            flush();
            lineSegments = [];
            textBuffer = "";
            continue;
          }
          if (ch === "\\n") {
            flush();
            lines.push(lineSegments);
            lineSegments = [];
            continue;
          }
          if (ch === "\\b") {
            textBuffer = popBackspace(lineSegments, textBuffer);
            continue;
          }
          if (ch === "\\t") {
            textBuffer += "    ";
            continue;
          }
          textBuffer += ch;
        }
        flush();
        lines.push(lineSegments);
        return lines;
      };

      window.__codeappRenderTerminal = (raw) => {
        const output = document.getElementById("terminal-output");
        if (!output) {
          return;
        }
        const isNearBottom = output.scrollTop + output.clientHeight >= output.scrollHeight - 20;
        const source = String(raw || "");
        const lines = parseTerminal(source);
        output.textContent = "";
        const fragment = document.createDocumentFragment();
        for (const segments of lines) {
          const line = document.createElement("div");
          line.className = "line";
          if (segments.length === 0) {
            line.textContent = "";
          } else {
            for (const segment of segments) {
              if (!segment.text) {
                continue;
              }
              const span = document.createElement("span");
              if (segment.style.bold) span.classList.add("bold");
              if (segment.style.dim) span.classList.add("dim");
              if (segment.style.italic) span.classList.add("italic");
              if (segment.style.underline) span.classList.add("underline");
              if (segment.style.fg) span.style.color = segment.style.fg;
              if (segment.style.bg) span.style.backgroundColor = segment.style.bg;
              span.textContent = segment.text;
              line.appendChild(span);
            }
          }
          fragment.appendChild(line);
        }
        output.appendChild(fragment);
        if (source.length === 0) {
          output.textContent = "No terminal output yet.";
        }
        if (isNearBottom) {
          output.scrollTop = output.scrollHeight;
        }
      };
    </script>
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
      const output = doc.getElementById("terminal-output");
      const status = doc.getElementById("terminal-status");
      const text = output?.textContent ?? "";
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

  const renderTerminalPopout = (
    popout: Window,
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
    const outputElement = doc.getElementById("terminal-output");
    const renderer = popout as Window & { __codeappRenderTerminal?: (raw: string) => void };
    if (renderer.__codeappRenderTerminal) {
      renderer.__codeappRenderTerminal(terminal.outputTail || "");
      return;
    }
    if (outputElement) {
      outputElement.textContent = terminal.outputTail || "No terminal output yet.";
    }
  };

  const clearClosedTerminalPopouts = () => {
    const dashboard = terminalDashboardWindowRef.current;
    if (dashboard && dashboard.closed) {
      terminalDashboardWindowRef.current = null;
      setIsTerminalDashboardPoppedOut(false);
    }

    const closedKeys = Object.entries(terminalPopoutWindowsRef.current)
      .filter(([, popout]) => !popout || popout.closed)
      .map(([key]) => key);
    if (closedKeys.length === 0) {
      return;
    }
    closedKeys.forEach((key) => {
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

  const attachTerminalDashboardCloseListener = (popout: Window) => {
    const handleClose = () => {
      terminalDashboardWindowRef.current = null;
      setIsTerminalDashboardPoppedOut(false);
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
      renderTerminalPopout(existing, terminal, activeProject?.name);
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
    renderTerminalPopout(popout, terminal, activeProject?.name);
    setTerminalPopoutByKey((prev) => ({ ...prev, [key]: true }));
    attachTerminalPopoutCloseListener(key, popout);
  };

  const closeTerminalPopout = (key: string) => {
    const popout = terminalPopoutWindowsRef.current[key];
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
    const webview = previewWebviewRef.current as { reload?: () => void } | null;
    webview?.reload?.();
  };

  const popoutPreview = async () => {
    if (!activeProjectPreviewUrl || !activeProjectBrowserEnabled) {
      return;
    }
    await api.preview.openPopout({ url: activeProjectPreviewUrl, projectName: activeProject?.name });
    setIsPreviewPoppedOut(true);
  };

  const closePopoutPreview = async () => {
    await api.preview.closePopout();
    setIsPreviewPoppedOut(false);
  };

  const openPreviewDevTools = async () => {
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
    setComposerDropdown((prev) => {
      if (prev?.kind === kind) {
        return null;
      }
      return {
        kind,
        bottom: Math.max(8, window.innerHeight - rect.top + 6),
        left: Math.max(8, rect.left),
        width: Math.max(180, rect.width)
      };
    });
  };

  const moveTerminalMenuFocus = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") {
      return;
    }

    const focusables = Array.from(
      event.currentTarget.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [role="button"][tabindex]:not([tabindex="-1"])'
      )
    );
    if (focusables.length === 0) {
      return;
    }

    const currentIndex = focusables.findIndex((element) => element === document.activeElement);
    const step = event.key === "ArrowDown" ? 1 : -1;
    const nextIndex = currentIndex === -1 ? (step === 1 ? 0 : focusables.length - 1) : (currentIndex + step + focusables.length) % focusables.length;

    event.preventDefault();
    focusables[nextIndex]?.focus();
  };

  const createThread = async (projectId = activeProjectId, title = "New thread") => {
    if (!projectId) {
      setLogs((prev) => [...prev, "Create or select a project first."]);
      return;
    }

    const thread = await api.threads.create({
      projectId,
      title: title.trim() || "New thread",
      provider: "codex"
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

  const openTerminalMenu = useCallback(() => {
    if (!activeProjectId) {
      setLogs((prev) => [...prev, "Create or select a project first."]);
      return;
    }
    setIsTerminalMenuOpen(true);
    window.requestAnimationFrame(() => {
      const firstFocusable = terminalMenuContentRef.current?.querySelector<HTMLElement>("button:not([disabled]), [tabindex=\"0\"]");
      if (firstFocusable) {
        firstFocusable.focus();
        return;
      }
      terminalMenuTriggerRef.current?.focus();
    });
  }, [activeProjectId]);

  const runShortcutByKey = useCallback(
    (key: string) => {
      if (key === "n") {
        openThreadCreationMenu();
        return;
      }
      if (key === "t") {
        openTerminalMenu();
        return;
      }
      openAppSettingsWindow().catch((error) => {
        setLogs((prev) => [...prev, `Open settings window failed: ${String(error)}`]);
      });
    },
    [openTerminalMenu, openThreadCreationMenu]
  );

  useEffect(() => {
    const onGlobalShortcut = (event: KeyboardEvent) => {
      const usesPlatformModifier = isMacOS ? event.metaKey : event.ctrlKey;
      if (!usesPlatformModifier || event.shiftKey || event.altKey || event.isComposing || event.repeat) {
        return;
      }
      if (isEditableKeyboardTarget(event.target)) {
        return;
      }
      const key = event.key.toLowerCase();
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
  }, [runShortcutByKey]);

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
    const mostRecentActiveThread = threads
      .filter((thread) => thread.projectId === projectId && !thread.archivedAt)
      .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))[0];

    if (mostRecentActiveThread) {
      setActiveThreadId(mostRecentActiveThread.id);
      return;
    }

    await createThread(projectId);
  };

  const focusWorkspace = async (workspaceId: string) => {
    setActiveWorkspaceId(workspaceId);
    const workspaceProjects = projects.filter((project) => project.workspaceId === workspaceId);
    const workspaceProjectIds = new Set(workspaceProjects.map((project) => project.id));
    const mostRecentThread = threads
      .filter((thread) => !thread.archivedAt && workspaceProjectIds.has(thread.projectId))
      .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))[0];

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

  const openWorkspaceSettingsModal = (workspaceId: string) => {
    const workspace = workspaceById[workspaceId];
    if (!workspace) {
      return;
    }
    setWorkspaceModalMode("edit");
    setWorkspaceEditingId(workspace.id);
    setWorkspaceModalInitialDraft({
      name: workspace.name,
      color: workspace.color,
      moveProjectIds: []
    });
    setShowWorkspaceModal(true);
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
      await Promise.all([loadWorkspaces(), loadProjects(), loadThreads()]);
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
    await Promise.all([loadWorkspaces(), loadProjects(), loadThreads()]);
  };

  const setThreadArchived = async (thread: Thread, archived: boolean) => {
    await api.threads.archive({ id: thread.id, archived });
    if (archived && activeThreadId === thread.id) {
      const fallback = threads.find((item) => item.projectId === thread.projectId && !item.archivedAt && item.id !== thread.id);
      setActiveThreadId(fallback?.id ?? null);
    }
    await loadThreads();
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

  const forkThreadFromSidebar = async (thread: Thread) => {
    const forked = await api.threads.fork({ id: thread.id });
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

  const buildPlanImplementationPrompt = (plan: PlanArtifact) => {
    return [
      "Implement this plan now in coding mode.",
      "Execute end-to-end, run relevant validation/tests, and summarize exactly what changed.",
      "",
      "Plan:",
      "```markdown",
      plan.markdown || plan.summary,
      "```"
    ].join("\n");
  };

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

  const ensureTerminalDashboardFrame = (popout: Window) => {
    const doc = popout.document;
    if (doc.getElementById("codeapp-terminal-dashboard-popout")) {
      return;
    }
    doc.open();
    doc.write(`<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Terminal Dashboard</title>
    <style>
      :root { color-scheme: dark; font-family: "Space Grotesk", "Avenir Next", sans-serif; }
      * { box-sizing: border-box; }
      body { margin: 0; background: #0b0d10; color: #e5e7eb; height: 100vh; }
      .shell { height: 100vh; display: flex; flex-direction: column; }
      .head { display: flex; align-items: center; justify-content: space-between; gap: 8px; min-height: 48px; padding: 8px 10px; border-bottom: 1px solid #2f2f2f; background: #0f1013; -webkit-app-region: drag; }
      .head.macos { padding-left: 5rem; }
      .meta { min-width: 0; }
      .brand { display: flex; align-items: center; gap: 8px; min-width: 0; }
      .icon { width: 26px; height: 26px; border-radius: 8px; }
      .title { font-size: 13px; font-weight: 700; color: #e2e8f0; }
      .subtitle { font-size: 11px; color: #94a3b8; }
      .actions { display: flex; gap: 6px; -webkit-app-region: no-drag; align-items: center; }
      .btn { height: 30px; border: 1px solid transparent; border-radius: 8px; background: transparent; color: #cbd5e1; padding: 0 10px; font-size: 12px; cursor: pointer; }
      .btn:hover { background: #1f2937; color: #fff; }
      .window-btn { width: 34px; height: 28px; border: 0; border-radius: 8px; background: transparent; color: #cbd5e1; font-size: 13px; cursor: pointer; }
      .window-btn:hover { background: #1f2937; color: #fff; }
      .window-btn.close:hover { background: rgba(239, 68, 68, 0.2); color: #fee2e2; }
      .content { flex: 1; min-height: 0; overflow: auto; padding: 10px; }
      .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(460px, 1fr)); gap: 10px; }
      .card { display: flex; flex-direction: column; min-height: 250px; border: 1px solid #2f2f2f; border-radius: 10px; background: #121212; padding: 10px; }
      .card-head { display: flex; justify-content: space-between; gap: 8px; margin-bottom: 8px; }
      .card-title { font-size: 12px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .card-command { font-size: 10px; color: #94a3b8; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .badge-running { font-size: 11px; color: #4ade80; }
      .badge-stopped { font-size: 11px; color: #94a3b8; }
      .card-actions { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 8px; }
      .output { margin: 0; padding: 8px; flex: 1; min-height: 0; overflow: auto; border-radius: 8px; border: 1px solid #2f2f2f; background: #0a0a0a; font-family: "IBM Plex Mono", "Fira Code", monospace; font-size: 11px; line-height: 1.35; white-space: pre-wrap; word-break: break-word; }
      .line { display: block; min-height: 1.35em; }
      .dim { opacity: 0.72; }
      .bold { font-weight: 700; }
      .italic { font-style: italic; }
      .underline { text-decoration: underline; }
    </style>
  </head>
  <body>
    <div id="codeapp-terminal-dashboard-popout" class="shell">
      <div class="head${isMacOS ? " macos" : ""}">
        <div class="brand">
          <img src="${appIconDark}" class="icon" alt="" />
          <div class="meta">
            <div id="dashboard-title" class="title">Terminal Dashboard</div>
            <div id="dashboard-subtitle" class="subtitle"></div>
          </div>
        </div>
        <div class="actions">
          <button class="btn" data-action="start_all">Start All</button>
          <button class="btn" data-action="restart_all">Restart Running</button>
          <button class="btn" data-action="stop_all">Stop All</button>
          ${useWindowsStyleHeader
            ? `<button id="windowMinBtn" class="window-btn" title="Minimize">&#8722;</button>
          <button id="windowMaxBtn" class="window-btn" title="Maximize or restore">&#9723;</button>
          <button id="windowCloseBtn" class="window-btn close" title="Close">&times;</button>`
            : ""}
        </div>
      </div>
      <div class="content">
        <div id="dashboard-grid" class="grid"></div>
      </div>
    </div>
    <script>
      const colorByCode = {
        30: "#111827", 31: "#f87171", 32: "#4ade80", 33: "#facc15", 34: "#60a5fa", 35: "#c084fc", 36: "#22d3ee", 37: "#e5e7eb",
        90: "#6b7280", 91: "#ef4444", 92: "#22c55e", 93: "#eab308", 94: "#3b82f6", 95: "#a855f7", 96: "#06b6d4", 97: "#f9fafb",
        40: "#111827", 41: "#7f1d1d", 42: "#14532d", 43: "#713f12", 44: "#1e3a8a", 45: "#581c87", 46: "#155e75", 47: "#d1d5db",
        100: "#374151", 101: "#991b1b", 102: "#166534", 103: "#854d0e", 104: "#1d4ed8", 105: "#6b21a8", 106: "#0e7490", 107: "#f3f4f6"
      };
      const defaultStyle = () => ({ fg: "", bg: "", bold: false, dim: false, italic: false, underline: false });
      const applySgr = (style, paramsText) => {
        const params = paramsText.length ? paramsText.split(";").map((token) => Number(token) || 0) : [0];
        for (const code of params) {
          if (code === 0) { Object.assign(style, defaultStyle()); continue; }
          if (code === 1) { style.bold = true; continue; }
          if (code === 2) { style.dim = true; continue; }
          if (code === 3) { style.italic = true; continue; }
          if (code === 4) { style.underline = true; continue; }
          if (code === 22) { style.bold = false; style.dim = false; continue; }
          if (code === 23) { style.italic = false; continue; }
          if (code === 24) { style.underline = false; continue; }
          if (code === 39) { style.fg = ""; continue; }
          if (code === 49) { style.bg = ""; continue; }
          if ((code >= 30 && code <= 37) || (code >= 90 && code <= 97)) { style.fg = colorByCode[code] || ""; continue; }
          if ((code >= 40 && code <= 47) || (code >= 100 && code <= 107)) { style.bg = colorByCode[code] || ""; }
        }
      };
      const styleKey = (style) => JSON.stringify(style);
      const pushText = (segments, style, text) => {
        if (!text) return;
        const key = styleKey(style);
        const prev = segments.length > 0 ? segments[segments.length - 1] : null;
        if (prev && prev.key === key) { prev.text += text; return; }
        segments.push({ key, text, style: { ...style } });
      };
      const popBackspace = (segments, buffer) => {
        if (buffer.length > 0) return buffer.slice(0, -1);
        const last = segments.length > 0 ? segments[segments.length - 1] : null;
        if (!last || last.text.length === 0) return buffer;
        last.text = last.text.slice(0, -1);
        if (!last.text) segments.pop();
        return buffer;
      };
      const parseTerminal = (raw) => {
        const lines = [];
        let lineSegments = [];
        let textBuffer = "";
        const style = defaultStyle();
        const flush = () => {
          if (!textBuffer) return;
          pushText(lineSegments, style, textBuffer);
          textBuffer = "";
        };
        for (let index = 0; index < raw.length; index += 1) {
          const ch = raw[index];
          if (ch === "\\u001b" && raw[index + 1] === "]") {
            flush();
            let end = index + 2;
            while (end < raw.length) {
              if (raw[end] === "\\u0007") break;
              if (raw[end] === "\\u001b" && raw[end + 1] === "\\\\") { end += 1; break; }
              end += 1;
            }
            index = end;
            continue;
          }
          if (ch === "\\u001b" && raw[index + 1] === "[") {
            flush();
            let end = index + 2;
            while (end < raw.length && !/[A-Za-z]/.test(raw[end])) end += 1;
            if (end < raw.length) {
              const command = raw[end];
              const params = raw.slice(index + 2, end);
              if (command === "m") applySgr(style, params);
              else if (command === "K") { lineSegments = []; textBuffer = ""; }
              else if (command === "J" && params.trim() === "2") { lines.length = 0; lineSegments = []; textBuffer = ""; }
              index = end;
              continue;
            }
          }
          if (ch === "\\r") { if (raw[index + 1] === "\\n") continue; flush(); lineSegments = []; textBuffer = ""; continue; }
          if (ch === "\\n") { flush(); lines.push(lineSegments); lineSegments = []; continue; }
          if (ch === "\\b") { textBuffer = popBackspace(lineSegments, textBuffer); continue; }
          if (ch === "\\t") { textBuffer += "    "; continue; }
          textBuffer += ch;
        }
        flush();
        lines.push(lineSegments);
        return lines;
      };
      const renderOutputTo = (container, raw) => {
        const isNearBottom = container.scrollTop + container.clientHeight >= container.scrollHeight - 20;
        const lines = parseTerminal(String(raw || ""));
        container.textContent = "";
        const fragment = document.createDocumentFragment();
        for (const segments of lines) {
          const line = document.createElement("div");
          line.className = "line";
          for (const segment of segments) {
            if (!segment.text) continue;
            const span = document.createElement("span");
            if (segment.style.bold) span.classList.add("bold");
            if (segment.style.dim) span.classList.add("dim");
            if (segment.style.italic) span.classList.add("italic");
            if (segment.style.underline) span.classList.add("underline");
            if (segment.style.fg) span.style.color = segment.style.fg;
            if (segment.style.bg) span.style.backgroundColor = segment.style.bg;
            span.textContent = segment.text;
            line.appendChild(span);
          }
          fragment.appendChild(line);
        }
        container.appendChild(fragment);
        if (!String(raw || "").length) {
          container.textContent = "No terminal output yet.";
        }
        if (isNearBottom) {
          container.scrollTop = container.scrollHeight;
        }
      };

      const escapeHtml = (value) =>
        String(value || "")
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;")
          .replace(/"/g, "&quot;");

      window.__codeappRenderDashboard = (payload) => {
        const grid = document.getElementById("dashboard-grid");
        const title = document.getElementById("dashboard-title");
        const subtitle = document.getElementById("dashboard-subtitle");
        if (!grid || !title || !subtitle) return;
        const terminals = Array.isArray(payload?.terminals) ? payload.terminals : [];
        const running = Number(payload?.runningCount || 0);
        const projectName = String(payload?.projectName || "Project");
        title.textContent = "Terminal Dashboard - " + projectName;
        subtitle.textContent = "Running " + running + "/" + terminals.length;
        grid.innerHTML = terminals
          .map((terminal) => {
            const statusClass = terminal.running ? "badge-running" : "badge-stopped";
            const statusText = terminal.running ? "Running" : "Stopped";
            const popAction = terminal.poppedOut ? "close_popout" : "open_popout";
            const popLabel = terminal.poppedOut ? "Close Pop-out" : "Pop Out";
            return '<section class="card" data-command-id="' + escapeHtml(terminal.commandId) + '">\
  <div class="card-head">
    <div style="min-width:0;">
      <div class="card-title">' + escapeHtml(terminal.name) + (terminal.useForPreview ? " (Browser)" : "") + '</div>\
      <div class="card-command">' + escapeHtml(terminal.command) + '</div>
    </div>
    <div class="' + statusClass + '">' + statusText + '</div>
  </div>
  <div class="card-actions">
    <button class="btn" data-action="start" data-command-id="' + escapeHtml(terminal.commandId) + '">' + (terminal.running ? "Restart" : "Start") + '</button>\
    <button class="btn" data-action="stop" data-command-id="' + escapeHtml(terminal.commandId) + '" ' + (terminal.running ? "" : "disabled") + '>Stop</button>\
    <button class="btn" data-action="copy" data-command-id="' + escapeHtml(terminal.commandId) + '" ' + (terminal.outputTail ? "" : "disabled") + '>Copy</button>\
    <button class="btn" data-action="' + popAction + '" data-command-id="' + escapeHtml(terminal.commandId) + '">' + popLabel + '</button>
  </div>
  <div id="out-' + escapeHtml(terminal.commandId) + '" class="output"></div>\
</section>';
          })
          .join("");

        terminals.forEach((terminal) => {
          const out = document.getElementById("out-" + terminal.commandId);
          if (out) {
            renderOutputTo(out, terminal.outputTail || "");
          }
        });
      };

      document.addEventListener("click", (event) => {
        const target = event.target instanceof HTMLElement ? event.target : null;
        const action = target?.getAttribute("data-action");
        if (!action) return;
        const commandId = target?.getAttribute("data-command-id") || undefined;
        if (window.opener && typeof window.opener.__codeappTerminalDashboardAction === "function") {
          window.opener.__codeappTerminalDashboardAction(action, commandId);
        }
      });
      const desktopApi = window.desktopAPI;
      const windowMinBtn = document.getElementById("windowMinBtn");
      const windowMaxBtn = document.getElementById("windowMaxBtn");
      const windowCloseBtn = document.getElementById("windowCloseBtn");
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
          window.close();
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
          windowMaxBtn.textContent = state.maximized ? "\u2750" : "\u25A1";
        }
      });
      windowCloseBtn?.addEventListener("click", () => {
        if (!desktopApi?.windowControls) {
          window.close();
          return;
        }
        desktopApi.windowControls.close().catch(() => undefined);
      });
      syncWindowState().catch(() => undefined);
    </script>
  </body>
</html>`);
    doc.close();
  };

  const renderTerminalDashboardPopout = (popout: Window) => {
    if (popout.closed) {
      return;
    }
    ensureTerminalDashboardFrame(popout);
    const renderer = popout as Window & {
      __codeappRenderDashboard?: (payload: {
        projectName: string;
        runningCount: number;
        terminals: Array<
          ProjectTerminalState["terminals"][number] & {
            poppedOut: boolean;
          }
        >;
      }) => void;
    };
    const terminals = activeProjectTerminals.map((terminal) => ({
      ...terminal,
      poppedOut: Boolean(activeProjectId ? terminalPopoutByKey[getTerminalPopoutKey(activeProjectId, terminal.commandId)] : false)
    }));
    renderer.__codeappRenderDashboard?.({
      projectName: activeProject?.name ?? "Project",
      runningCount: activeRunningTerminalsCount,
      terminals
    });
  };

  const openTerminalDashboardPopout = () => {
    if (!activeProjectId) {
      return;
    }
    const existing = terminalDashboardWindowRef.current;
    if (existing && !existing.closed) {
      renderTerminalDashboardPopout(existing);
      existing.focus();
      setIsTerminalDashboardPoppedOut(true);
      return;
    }
    const popout = window.open("", "codeapp-terminal-dashboard", "popup=yes,width=1440,height=920,resizable=yes,scrollbars=yes");
    if (!popout) {
      setLogs((prev) => [...prev, "Terminal dashboard pop-out blocked."]);
      return;
    }
    terminalDashboardWindowRef.current = popout;
    renderTerminalDashboardPopout(popout);
    setIsTerminalDashboardPoppedOut(true);
    attachTerminalDashboardCloseListener(popout);
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

  const verifyCodexSdk = async () => {
    setLogs((prev) => [...prev, "Checking Codex app server..."]);
    const result = await api.installer.installCli({ provider: "codex" });
    setLogs((prev) => [...prev, ...result.logs]);
    await loadInstallerStatus();
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
        targets: ["node", "npm", "git", "rg", "codex"]
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
      setSettingsSaveNotice(message);
      return;
    }

    setSettingsSaving(true);
    setSettingsSaveNotice("");
    try {
      const mode = draft.settings.permissionMode as PermissionMode;

      const saved = await api.settings.set({
        permissionMode: mode,
        theme: draft.settings.theme ?? "midnight",
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
      setComposerOptions(saved.codexDefaults);
      setAppSettingsInitialDraft({
        settings: saved,
        composerOptions: saved.codexDefaults,
        settingsEnvText: envVarsToText(saved.envVars),
        settingsTab: "general"
      });
      setSettingsSaveNotice("Settings saved.");
      if (!isSettingsWindow) {
        setShowSettings(false);
      }
      await loadSystemTerminals();
      await loadInstallerStatus();
    } catch (error) {
      const message = `Settings save failed: ${String(error)}`;
      setLogs((prev) => [...prev, message]);
      setSettingsSaveNotice(message);
    } finally {
      setSettingsSaving(false);
    }
  };

  const checkUpdates = async () => {
    const result = await api.updates.check();
    if (!result.available) {
      setUpdateMessage("No update available.");
      return;
    }

    setUpdateMessage(`Update ${result.version} available.`);
  };

  const openSkillEditor = async (path: string) => {
    const doc = await api.skills.readDocument({ path });
    setSkillEditorPath(path);
    setSkillEditorContent(doc.content);
  };

  const saveSkillEditor = async () => {
    if (!skillEditorPath) {
      return;
    }
    setSkillEditorSaving(true);
    try {
      await api.skills.writeDocument({
        path: skillEditorPath,
        content: skillEditorContent
      });
      setSettingsSaveNotice("Skill saved.");
      if (activeProjectId) {
        await loadProjectSkills(activeProjectId);
      }
      await loadAppSkills();
    } catch (error) {
      const message = `Skill save failed: ${String(error)}`;
      setLogs((prev) => [...prev, message]);
      setSettingsSaveNotice(message);
    } finally {
      setSkillEditorSaving(false);
    }
  };

  const setupBlocked = Boolean(
    installStatus &&
      (!installStatus.nodeOk || !installStatus.npmOk || !installStatus.gitOk || !installStatus.rgOk || !installStatus.codexOk)
  );
  useEffect(() => {
    if (!setupBlocked) {
      setIsSetupCardDismissed(false);
    }
  }, [setupBlocked]);
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
      | { kind: "activity-bundle"; id: string; items: TimelineItem[]; chips: string[] }
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
      rows.push({
        kind: "activity-bundle",
        id: `activity-bundle-${first?.id ?? "start"}-${last?.id ?? "end"}`,
        items: pending,
        chips
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

  const activeAskOrchestrationRuns = useMemo(
    () => activeOrchestrationRuns.filter((run) => run.status === "proposed" && run.policy === "ask"),
    [activeOrchestrationRuns]
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

  const approveOrchestrationRun = async (runId: string, selectedTaskKeys?: string[]) => {
    const result = await api.orchestration.approveProposal({ runId, selectedTaskKeys });
    if (!result.ok) {
      throw new Error("Failed to approve orchestration run");
    }
    setSelectedOrchestrationTaskKeysByRunId((prev) => {
      const next = { ...prev };
      delete next[runId];
      return next;
    });
    if (activeThreadId) {
      await loadOrchestrationRuns(activeThreadId);
    }
  };

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
      composerOptions: settings.codexDefaults,
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

  return (
    <div className="h-screen overflow-hidden bg-bg text-white theme-text">
      <div
        className={
          isSettingsWindow ? "h-full w-full theme-app-shell" : `h-full w-full theme-app-shell ${isMacOS ? "pl-2" : ""}`
        }
      >
        <div className={isSettingsWindow ? "flex h-full flex-col overflow-hidden theme-settings-surface" : "flex h-full flex-col overflow-hidden rounded-2xl bg-black/40 shadow-neon backdrop-blur-xl"}>
          {!isSettingsWindow && (
            <MainHeader
              isMacOS={isMacOS}
              isWindows={isWindows}
              isWindowMaximized={isWindowMaximized}
              appIconSrc={appIconSrc}
              appVersionLabel={APP_VERSION_LABEL}
              workspaces={workspaceHeaderItems}
              activeWorkspaceId={activeWorkspaceId}
              onSelectWorkspace={(workspaceId) => {
                focusWorkspace(workspaceId).catch((error) => {
                  setLogs((prev) => [...prev, `Workspace switch failed: ${String(error)}`]);
                });
              }}
              onOpenWorkspaceSettings={openWorkspaceSettingsModal}
              onOpenNewWorkspaceModal={openCreateWorkspaceModal}
              changelogItems={CHANGELOG_ITEMS}
              changelogRef={changelogRef}
              isChangelogOpen={isChangelogOpen}
              setIsChangelogOpen={setIsChangelogOpen}
              updateMessage={updateMessage}
              activeProjectWebLinks={activeProjectWebLinks}
              onOpenProjectWebLink={openProjectWebLink}
              onCheckUpdates={checkUpdates}
              terminalMenuRef={terminalMenuRef}
              terminalMenuTriggerRef={terminalMenuTriggerRef}
              terminalMenuContentRef={terminalMenuContentRef}
              isTerminalMenuOpen={isTerminalMenuOpen}
              setIsTerminalMenuOpen={setIsTerminalMenuOpen}
              moveTerminalMenuFocus={moveTerminalMenuFocus}
              activeProjectId={activeProjectId}
              activeProjectTerminals={activeProjectTerminals}
              activeRunningTerminalsCount={activeRunningTerminalsCount}
              systemTerminals={systemTerminals}
              isTerminalDashboardPoppedOut={isTerminalDashboardPoppedOut}
              onOpenProjectTerminal={openProjectTerminal}
              onOpenTerminalDashboardPopout={openTerminalDashboardPopout}
              onOpenTerminalPopout={openTerminalPopout}
              onStartTerminal={startActiveProjectTerminal}
              onStopTerminal={stopActiveProjectTerminal}
              onCopyTerminalOutput={copyTerminalOutput}
              onOpenProjectFiles={openProjectFiles}
              activeProjectBrowserEnabled={activeProjectBrowserEnabled}
              isPreviewOpen={isPreviewOpen}
              isGitPanelOpen={isGitPanelOpen}
              onTogglePreviewPanel={togglePreviewPanel}
              onToggleGitPanel={toggleGitPanel}
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
            className={
              isSettingsWindow
                ? "hidden"
                : `grid flex-1 min-h-0 overflow-hidden ${
                    isPreviewVisible || isGitPanelOpen ? "grid-cols-[300px_minmax(0,1fr)_420px]" : "grid-cols-[300px_1fr]"
                  }`
            }
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
	                    <FaPlus className="mx-auto text-[12px]" />
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
                {projectsInActiveWorkspace.length === 0 && <p className="px-2 text-sm text-muted">No projects in this workspace.</p>}

                {projectsInActiveWorkspace.map((project) => {
                  const threadBuckets = threadBucketsByProjectId[project.id];
                  const archivedThreads = threadBuckets?.archived ?? [];
                  const visibleThreads = threadBuckets?.active ?? [];
                  const visibleRows = flattenThreadRows(visibleThreads);
                  const archivedRows = flattenThreadRows(archivedThreads);
                  const showArchived = Boolean(showArchivedByProjectId[project.id]);
                  const active = activeProjectId === project.id;
                  const menuOpen = threadMenuProjectId === project.id;

                  return (
                    <section key={project.id} className={active ? "project-section active" : "project-section"}>
                      <div className="project-head">
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
                            <span className="truncate">{project.name}</span>
                          </button>
                        )}
                        <button
                          className="project-action-btn"
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
                          className="project-action-btn app-tooltip-target"
                          data-thread-menu-trigger={project.id}
                          data-app-tooltip={composerTooltipText(
                            "New Thread",
                            "Create a new thread in this project.",
                            `${platformShortcutModifier}+N`
                          )}
                          onClick={() => {
                            setActiveProjectId(project.id);
                            setThreadMenuProjectId((prev) => (prev === project.id ? null : project.id));
                          }}
                          aria-label="New thread"
                        >
                          <FaPlus className="text-[12px]" />
                        </button>
                      </div>

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
                        {visibleRows.length === 0 && <div className="thread-empty">No active threads</div>}
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
                                style={depth > 0 ? { marginLeft: `${depth * 14}px` } : undefined}
                                onClick={() => {
                                  activateThreadFromSidebar(project.id, thread.id);
                                }}
                              >
                                <div className="thread-row-main">
                                  <div className="thread-row-title-block">
                                    <div className="truncate text-left text-sm">{thread.title}</div>
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
                                      title="Fork thread"
                                      onClick={(event) => {
                                        event.stopPropagation();
                                        forkThreadFromSidebar(thread).catch((error) => {
                                          setLogs((prev) => [...prev, `Fork thread failed: ${String(error)}`]);
                                        });
                                      }}
                                      onKeyDown={(event) => {
                                        if (event.key === "Enter" || event.key === " ") {
                                          event.preventDefault();
                                          event.stopPropagation();
                                          forkThreadFromSidebar(thread).catch((error) => {
                                            setLogs((prev) => [...prev, `Fork thread failed: ${String(error)}`]);
                                          });
                                        }
                                      }}
                                      role="button"
                                      tabIndex={0}
                                    >
                                      <FaCodeBranch className="text-[10px]" />
                                    </span>
                                    <span
                                      className="thread-row-action-btn"
                                      title="Archive thread"
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
                            {showArchived ? "Hide archived" : `View archived (${archivedRows.length})`}
                          </button>
                        )}
                        <div className={showArchived ? "thread-archived-group expanded" : "thread-archived-group"}>
                          <div className="thread-archived-group-inner">
                            {archivedRows.map(({ thread, depth }) => (
                            <button
                              key={`archived-${thread.id}`}
                              className={`${activeThreadId === thread.id ? "thread-row active archived" : "thread-row archived"} ${
                                threadCompletionFlashById[thread.id] ? "thread-row-complete-flash" : ""
                              } ${threadAwaitingInputById[thread.id] ? "thread-row-awaiting-input" : ""}`}
                              style={depth > 0 ? { marginLeft: `${depth * 14}px` } : undefined}
                              onClick={() => {
                                activateThreadFromSidebar(project.id, thread.id);
                              }}
                            >
                              <div className="thread-row-main">
                                <div className="thread-row-title-block">
                                  <div className="truncate text-left text-sm">{thread.title}</div>
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
                                    title="Fork thread"
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      forkThreadFromSidebar(thread).catch((error) => {
                                        setLogs((prev) => [...prev, `Fork thread failed: ${String(error)}`]);
                                      });
                                    }}
                                    onKeyDown={(event) => {
                                      if (event.key === "Enter" || event.key === " ") {
                                        event.preventDefault();
                                        event.stopPropagation();
                                        forkThreadFromSidebar(thread).catch((error) => {
                                          setLogs((prev) => [...prev, `Fork thread failed: ${String(error)}`]);
                                        });
                                      }
                                    }}
                                    role="button"
                                    tabIndex={0}
                                  >
                                    <FaCodeBranch className="text-[10px]" />
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
                    </section>
                  );
                })}
              </div>
            </aside>

            <main className="main-layout-content flex h-full min-h-0 min-w-0 flex-col">
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
                      .filter((detail) => REQUIRED_SETUP_KEYS.has(detail.key))
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
                    <button className="btn-secondary" onClick={verifyCodexSdk}>
                      Verify Codex app server
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
                  <div className="mb-5 space-y-2">
                    <p className="text-sm text-slate-300">Pick a starter prompt or write your own.</p>
                    <div className="grid gap-2">
                {QUICK_PROMPTS.map((prompt) => (
                        <button
                          key={prompt}
                          className="rounded-md bg-black/25 px-3 py-2 text-left text-sm text-slate-300 transition hover:bg-black/35"
                          onClick={() => {
                            applyComposerText(prompt, true, prompt.length);
                            scheduleComposerResize();
                          }}
                        >
                          {prompt}
                        </button>
                      ))}
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
                          <article key={item.id} className="timeline-item min-w-0 overflow-hidden rounded-lg bg-zinc-900/80 p-3">
                            <MemoizedUserMessageContent content={item.message.content} attachments={item.message.attachments} />
                          </article>
                        );
                      }
                      if (row.kind === "plan") {
                        return (
                          <MemoizedTimelineItemsList
                            key={row.id}
                            timelineItems={[row.item]}
                            plansById={plansById}
                            getTodoPlanByActivityId={getTodoPlanByActivityId}
                            onViewPlan={openPlanDrawerFor}
                            onBuildPlan={handleBuildPlan}
                            onCopyPlan={copyPlanToClipboard}
                            expandedActivityGroups={expandedActivityGroups}
                            setExpandedActivityGroups={setExpandedActivityGroups}
                            setExpandedActivityChildren={setExpandedActivityChildren}
                          />
                        );
                      }

                      const isLastRow = rowIndex === timelineRows.length - 1;
                      const groupOpen = expandedActivityGroups[row.id] ?? isLastRow;
                      return (
                        <article key={row.id} className="timeline-item min-w-0 overflow-hidden">
                          <section className={`activity-group activity-group-commands ${groupOpen ? "is-open" : ""}`}>
                            <button
                              type="button"
                              className="activity-summary"
                              aria-expanded={groupOpen}
                              onClick={() => {
                                setExpandedActivityGroups((prev) => ({ ...prev, [row.id]: !groupOpen }));
                              }}
                            >
                              <span>Activity</span>
                              {row.chips.map((chip, index) => (
                                <span key={`${row.id}-chip-${index}`} className="summary-chip">
                                  {chip}
                                </span>
                              ))}
                              <FaChevronDown className={`accordion-chevron ${groupOpen ? "open" : ""}`} />
                            </button>
                            <div className={`activity-bundle-collapse ${groupOpen ? "open" : ""}`} aria-hidden={!groupOpen}>
                              <div className="activity-body">
                                <MemoizedTimelineItemsList
                                  timelineItems={row.items}
                                  plansById={plansById}
                                  getTodoPlanByActivityId={getTodoPlanByActivityId}
                                  onViewPlan={openPlanDrawerFor}
                                  onBuildPlan={handleBuildPlan}
                                  onCopyPlan={copyPlanToClipboard}
                                  expandedActivityGroups={expandedActivityGroups}
                                  setExpandedActivityGroups={setExpandedActivityGroups}
                                  setExpandedActivityChildren={setExpandedActivityChildren}
                                />
                              </div>
                            </div>
                          </section>
                        </article>
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
                      expandedActivityGroups={expandedActivityGroups}
                      setExpandedActivityGroups={setExpandedActivityGroups}
                      setExpandedActivityChildren={setExpandedActivityChildren}
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

              {activeThreadId && activeAskOrchestrationRuns.length > 0 && (
                <section className="px-5 pb-1">
                  <div className="space-y-2">
                    {activeAskOrchestrationRuns.map((run) => {
                      const allTaskKeys = run.proposal.tasks.map((task) => task.key);
                      const selectedTaskKeys = selectedOrchestrationTaskKeysByRunId[run.id] ?? allTaskKeys;
                      const selectedCount = selectedTaskKeys.length;
                      return (
                        <div key={`orchestration-ask-${run.id}`} className="rounded-lg border border-border bg-black/25 p-3">
                          <div className="text-[11px] uppercase tracking-[0.08em] text-slate-400">Sub-thread request</div>
                          <div className="mt-1 text-sm text-slate-100">{run.proposal.reason}</div>
                          <div className="mt-1 text-xs text-slate-400">Goal: {run.proposal.parentGoal}</div>
                          <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                            {run.proposal.tasks.map((task) => {
                              const isSelected = selectedTaskKeys.includes(task.key);
                              return (
                                <button
                                  key={`${run.id}-${task.key}`}
                                  type="button"
                                  className={
                                    isSelected
                                      ? "h-9 w-full rounded-md border border-zinc-600 bg-zinc-800 px-2 text-left text-xs text-slate-100"
                                      : "h-9 w-full rounded-md border border-border bg-zinc-900/60 px-2 text-left text-xs text-slate-300 hover:bg-zinc-800"
                                  }
                                  onClick={() =>
                                    setSelectedOrchestrationTaskKeysByRunId((prev) => {
                                      const prior = prev[run.id] ?? allTaskKeys;
                                      const next = prior.includes(task.key)
                                        ? prior.filter((key) => key !== task.key)
                                        : [...prior, task.key];
                                      return { ...prev, [run.id]: next };
                                    })
                                  }
                                >
                                  {task.title}
                                </button>
                              );
                            })}
                          </div>
                          <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                            <div className="text-[11px] text-slate-400">
                              {selectedCount} of {allTaskKeys.length} selected
                            </div>
                            <div className="inline-flex items-center gap-2">
                              <button
                                className="btn-secondary h-7 px-2 py-0 text-xs"
                                onClick={() => {
                                  approveOrchestrationRun(run.id, []).catch((error) => {
                                    setLogs((prev) => [...prev, `Decline orchestration failed: ${String(error)}`]);
                                  });
                                }}
                              >
                                Decline
                              </button>
                              <button
                                className="btn-secondary h-7 px-2 py-0 text-xs"
                                onClick={() => {
                                  approveOrchestrationRun(run.id, selectedTaskKeys).catch((error) => {
                                    setLogs((prev) => [...prev, `Spawn selected failed: ${String(error)}`]);
                                  });
                                }}
                                disabled={selectedCount === 0}
                              >
                                Spawn selected
                              </button>
                              <button
                                className="btn-primary h-7 px-2 py-0 text-xs"
                                onClick={() => {
                                  approveOrchestrationRun(run.id).catch((error) => {
                                    setLogs((prev) => [...prev, `Spawn all failed: ${String(error)}`]);
                                  });
                                }}
                              >
                                Spawn all
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </section>
              )}

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
                      <textarea
                        ref={composerTextareaRef}
                        className="min-h-[56px] w-full resize-none bg-transparent font-sans text-sm leading-relaxed outline-none"
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
                      <button
                        ref={composerModelTriggerRef}
                        className="composer-dropdown-trigger composer-tooltip-target"
                        data-composer-tooltip={composerTooltipText("Model", "Choose which model handles this request.")}
                        aria-label="Choose model"
                        onClick={() => openComposerDropdown("model", composerModelTriggerRef.current)}
                        disabled={!activeThreadId || activeThreadSendPending}
                      >
                        <span>{modelLabel.toLowerCase()}</span>
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
                    {activeQueuedPromptCount > 0 && (
                      <div className="mt-2 space-y-2">
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
                                          ? composerTooltipText("Steer Queued Prompt", "Inject this queued prompt into the active run.")
                                          : composerTooltipText("Steer Queued Prompt", "Start a run first, then steer this queued prompt.")
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
                                      data-composer-tooltip={composerTooltipText("Cancel Queued Prompt", "Remove this prompt from the queue.")}
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
                        <span className="composer-option">
                          <FaUserShield className="composer-option-icon" />
                          <button
                            ref={composerApprovalTriggerRef}
                            className="composer-dropdown-trigger composer-tooltip-target"
                            data-composer-tooltip={composerTooltipText("Approval Policy", "Decide when actions need manual approval.")}
                            aria-label="Choose approval policy"
                            onClick={() => openComposerDropdown("approval", composerApprovalTriggerRef.current)}
                            disabled={!activeThreadId}
                          >
                            <span>{approvalLabel}</span>
                            <FaChevronDown className="text-[10px] text-slate-500" />
                          </button>
                        </span>
                        <span className="composer-option">
                          <FaGlobeAmericas className="composer-option-icon" />
                          <button
                            ref={composerWebSearchTriggerRef}
                            className="composer-dropdown-trigger composer-tooltip-target"
                            data-composer-tooltip={composerTooltipText("Web Search Mode", "Choose how the agent can use web search.")}
                            aria-label="Choose web search mode"
                            onClick={() => openComposerDropdown("websearch", composerWebSearchTriggerRef.current)}
                            disabled={!activeThreadId}
                          >
                            <span>{webSearchLabel.toLowerCase()}</span>
                            <FaChevronDown className="text-[10px] text-slate-500" />
                          </button>
                        </span>
                        <button
                          className={`composer-toggle-btn composer-tooltip-target ${(composerOptions.networkAccessEnabled ?? true) ? "enabled" : ""}`}
                          data-composer-tooltip={composerTooltipText(
                            "Network Access",
                            "Toggle whether commands may access the network."
                          )}
                          aria-label="Toggle network access"
                          aria-pressed={composerOptions.networkAccessEnabled ?? true}
                          onClick={() =>
                            setComposerOptions((prev) => ({
                              ...prev,
                              networkAccessEnabled: !(prev.networkAccessEnabled ?? true)
                            }))
                          }
                          disabled={!activeThreadId}
                          >
                            <FaNetworkWired className="composer-option-icon" />
                          Network
                        </button>
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
                        <div className="branch-inline" ref={branchTriggerRef}>
                          <button
                            className="branch-trigger composer-tooltip-target"
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
              <aside className="flex min-h-0 flex-col border-l border-border/90 bg-black/55">
                {isPreviewVisible && (
                  <>
                    <div className="flex items-center justify-between border-b border-border/80 px-3 py-2">
                      <div className="text-xs uppercase tracking-[0.16em] text-muted">Project Dev</div>
                      <div className="flex items-center gap-1">
                        <button className="btn-ghost" onClick={reloadPreviewPane} disabled={!activeProjectPreviewUrl || isPreviewPoppedOut}>
                          Reload
                        </button>
                        <button
                          className="btn-ghost"
                          onClick={() => openPreviewDevTools().catch((error) => setLogs((prev) => [...prev, `Preview DevTools failed: ${String(error)}`]))}
                        >
                          DevTools
                        </button>
                        {activeProjectBrowserEnabled &&
                          (!isPreviewPoppedOut ? (
                            <button className="btn-ghost" onClick={() => popoutPreview().catch((error) => setLogs((prev) => [...prev, `Preview pop-out failed: ${String(error)}`]))} disabled={!activeProjectPreviewUrl}>
                              Pop Out
                            </button>
                          ) : (
                            <button className="btn-ghost" onClick={() => closePopoutPreview().catch((error) => setLogs((prev) => [...prev, `Preview close failed: ${String(error)}`]))}>
                              Close Pop-out
                            </button>
                          ))}
                      </div>
                    </div>

                    {!isPreviewPoppedOut ? (
                      <section className="flex min-h-0 flex-1 flex-col">
                        <div className="truncate border-b border-border/80 px-3 py-2 text-xs text-slate-300">
                          {activeProjectPreviewUrl || "Start dev command to detect preview URL."}
                        </div>
                        <div className="min-h-0 flex-1">
                          {activeProjectBrowserEnabled && activeProjectPreviewUrl ? (
                            <webview
                              ref={previewWebviewRef}
                              src={activeProjectPreviewUrl}
                              className="h-full w-full"
                            />
                          ) : (
                            <div className="flex h-full items-center justify-center px-4 text-center text-sm text-muted">
                              {activeProjectBrowserEnabled ? "No preview URL detected yet." : "Browser preview is disabled for this project."}
                            </div>
                          )}
                        </div>
                      </section>
                    ) : (
                      <section className="flex min-h-0 flex-1 items-center justify-center px-4 text-center text-sm text-muted">
                        Preview is popped out. Close pop-out to return it to the sidebar.
                      </section>
                    )}
                  </>
                )}

                {isGitPanelOpen && (
                  <>
                    <div className="flex items-center justify-between border-b border-border/80 px-3 py-2">
                      <div className="text-xs uppercase tracking-[0.16em] text-muted">Git</div>
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

                    <section className="space-y-2 border-b border-border/80 px-3 py-2 max-h-[52vh] overflow-y-auto">
                      {!activeProjectId ? (
                        <p className="text-xs text-slate-400">Select a project to view git state.</p>
                      ) : !activeGitState?.insideRepo ? (
                        <p className="text-xs text-slate-400">This project is not a git repository.</p>
                      ) : (
                        <>
                          <div className="text-xs text-slate-300">
                            Branch: <span className="text-slate-100">{activeGitState.branch ?? "(detached)"}</span>
                            {activeGitState.upstream ? ` -> ${activeGitState.upstream}` : ""}
                          </div>
                          {(activeGitState.ahead > 0 || activeGitState.behind > 0) && (
                            <div className="text-[11px] text-slate-400">
                              Ahead {activeGitState.ahead} / Behind {activeGitState.behind}
                            </div>
                          )}
                        </>
                      )}
                    </section>

                    <section className="min-h-0 flex-1 overflow-y-auto px-3 py-2">
                      {activeGitState?.insideRepo ? (
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
                                  <div className="flex items-center justify-between gap-2">
                                    <div className="truncate">{commit.summary}</div>
                                    <button
                                      className="btn-ghost h-6 px-2 py-0 text-[10px]"
                                      onClick={() => {
                                        if (!activeThreadId) {
                                          setLogs((prev) => [...prev, "Open or select a thread before starting review."]);
                                          return;
                                        }
                                        api.sessions
                                          .reviewCommit({
                                            threadId: activeThreadId,
                                            sha: commit.hash,
                                            title: commit.summary
                                          })
                                          .then((result) => {
                                            if (!result.ok) {
                                              setLogs((prev) => [...prev, "Commit review failed to start."]);
                                            }
                                          })
                                          .catch((error) => {
                                            setLogs((prev) => [...prev, `Commit review failed: ${String(error)}`]);
                                          });
                                      }}
                                      disabled={!activeThreadId || activeRunState === "running"}
                                      title={activeThreadId ? "Review this commit in the active thread" : "Select a thread to review"}
                                    >
                                      Review
                                    </button>
                                  </div>
                                </div>
                              ))
                            )}
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
                          <div className="git-panel-card">
                            <div className="git-panel-card-title">
                              Unstaged / Untracked ({activeUnstagedFiles.length})
                            </div>
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
                      ) : (
                        <p className="text-xs text-slate-500">No git data.</p>
                      )}
                    </section>
                  </>
                )}
              </aside>
            )}
          </div>
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
        setComposerOptions={setComposerOptions}
        setComposerDropdown={setComposerDropdown}
      />

      <div ref={tooltipElementRef} className="app-global-tooltip" role="tooltip" aria-hidden="true" />

      {showSetupModal && installStatus && (
        <SetupModal
          installStatus={installStatus}
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
          appendLog={appendLog}
        />
      )}

      {(showSettings || isSettingsWindow) && (
        <SettingsModal
          initialDraft={appSettingsInitialDraft}
          isSettingsWindow={isSettingsWindow}
          isMacOS={isMacOS}
          isWindows={isWindows}
          appIconSrc={appIconSrc}
          appSkills={appSkills}
          systemTerminals={systemTerminals}
          skillEditorPath={skillEditorPath}
          skillEditorContent={skillEditorContent}
          setSkillEditorContent={setSkillEditorContent}
          skillEditorSaving={skillEditorSaving}
          settingsSaveNotice={settingsSaveNotice}
          settingsSaving={settingsSaving}
          onClose={closeSettingsModal}
          onCloseWindow={closeWindow}
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
          onOpenSkillEditor={openSkillEditor}
          appendLog={appendLog}
        />
      )}

      {showNewProjectModal && (
        <NewProjectModal
          defaultProjectDirectory={settings.defaultProjectDirectory}
          newProjectName={newProjectName}
          setNewProjectName={setNewProjectName}
          creatingProject={creatingProject}
          isNameValid={Boolean(sanitizeProjectDirName(newProjectName))}
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







