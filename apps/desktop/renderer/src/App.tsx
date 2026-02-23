import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ClipboardEventHandler,
  type DragEventHandler,
  type KeyboardEventHandler
} from "react";
import { createPortal } from "react-dom";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  FaChevronDown,
  FaCodeBranch,
  FaCog,
  FaEye,
  FaExternalLinkAlt,
  FaGlobeAmericas,
  FaNetworkWired,
  FaFolderOpen,
  FaPaperPlane,
  FaPlus,
  FaStop,
  FaSyncAlt,
  FaTerminal,
  FaTimes,
  FaTrashAlt,
  FaUserShield
} from "react-icons/fa";
import type {
  AppSettings,
  CodexApprovalMode,
  CodexModelReasoningEffort,
  CodexSandboxMode,
  CodexThreadOptions,
  CodexWebSearchMode,
  GitFileStatus,
  GitRepositoryCandidate,
  GitState,
  InstallStatus,
  MessageEvent,
  PermissionMode,
  PromptAttachment,
  Project,
  ProjectSettings,
  ProjectWebLink,
  ProjectTerminalEvent,
  ProjectTerminalState,
  ProjectTerminalSwitchBehavior,
  SessionEvent,
  Thread
} from "@code-app/shared";

const api = window.desktopAPI;

const DEFAULT_SETTINGS: AppSettings = {
  permissionMode: "prompt_on_risk",
  binaryOverrides: {},
  envVars: {},
  defaultProjectDirectory: "",
  autoRenameThreadTitles: true,
  projectTerminalSwitchBehaviorDefault: "start_stop",
  codexDefaults: {
    sandboxMode: "workspace-write",
    modelReasoningEffort: "medium",
    webSearchMode: "cached",
    networkAccessEnabled: true,
    approvalPolicy: "on-request"
  }
};

const SHOW_TERMINAL = false;
const MAX_ATTACHMENTS = 8;

const QUICK_PROMPTS = [
  "Summarize this repository and list the top 3 risky areas.",
  "Run tests, explain failures, and propose a minimal fix plan.",
  "Find dead code and suggest safe removals with file-by-file diffs.",
  "Audit recent changes and call out regressions or missing tests."
];
const ACTIVITY_EVENT_PREFIX = "__codeapp_activity__:";
const GENERIC_THREAD_TITLES = new Set(["new thread", "thread", "untitled"]);
const THREAD_TITLE_STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "as",
  "at",
  "be",
  "by",
  "for",
  "from",
  "how",
  "i",
  "if",
  "in",
  "into",
  "is",
  "it",
  "my",
  "of",
  "on",
  "or",
  "please",
  "run",
  "that",
  "the",
  "this",
  "to",
  "want",
  "with"
]);

const MODEL_SUGGESTIONS = ["codex-5.3", "codex-5.3-spark", "gpt-5-codex", "gpt-5", "o4-mini"];
const SANDBOX_OPTIONS: Array<{ value: CodexSandboxMode; label: string }> = [
  { value: "workspace-write", label: "Workspace write" },
  { value: "read-only", label: "Read only" },
  { value: "danger-full-access", label: "Danger full access" }
];
const REASONING_OPTIONS: Array<{ value: CodexModelReasoningEffort; label: string }> = [
  { value: "minimal", label: "Minimal" },
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
  { value: "xhigh", label: "XHigh" }
];
const APPROVAL_OPTIONS: Array<{ value: CodexApprovalMode; label: string }> = [
  { value: "on-request", label: "On request" },
  { value: "on-failure", label: "On failure" },
  { value: "untrusted", label: "Untrusted" },
  { value: "never", label: "Never" }
];
const WEB_SEARCH_OPTIONS: Array<{ value: CodexWebSearchMode; label: string }> = [
  { value: "cached", label: "Cached" },
  { value: "live", label: "Live" },
  { value: "disabled", label: "Disabled" }
];
const PROJECT_SWITCH_BEHAVIOR_OPTIONS: Array<{ value: ProjectTerminalSwitchBehavior; label: string }> = [
  { value: "start_stop", label: "Start on enter, stop on leave" },
  { value: "start_only", label: "Start on enter, keep running" },
  { value: "manual", label: "Manual only" }
];

const selectWidthStyle = (label: string, min = 12) => ({
  width: `${Math.max(min, label.length + 4)}ch`
});

const capitalizeFirst = (value: string) => (value.length > 0 ? `${value[0]!.toUpperCase()}${value.slice(1)}` : value);

const ANSI_PATTERN =
  /[\u001B\u009B][[\]()#;?]*(?:\d{1,4}(?:;\d{0,4})*)?[\dA-PR-TZcf-nq-uy=><~]/g;
const DETACHED_CSI_PATTERN = /\[(?:\?|\d)[0-9;]*[A-Za-z]/g;
const DETACHED_SGR_PATTERN = /\[(?:\d{1,3};){1,12}\d{1,3}m/g;
const OSC_REMAINDER_PATTERN = /\]\d+;[^\n\u0007]*(?:\u0007)?/g;
const BLOCK_CHARS_PATTERN = /[░▒▓█▁▂▃▄▅▆▇▉▊▋▌▍▎▏]/g;

const shouldDropDisplayLine = (line: string) => {
  if (!line.trim()) {
    return true;
  }

  const blockCharCount = (line.match(BLOCK_CHARS_PATTERN) || []).length;
  if (blockCharCount > 16) {
    return true;
  }

  if (/\d{1,3};\d{1,3};\d{1,3}/.test(line) && line.length > 40) {
    return true;
  }

  if (line.length > 320 && !/[a-zA-Z]/.test(line)) {
    return true;
  }

  return false;
};

const sanitizeForDisplay = (input: string) =>
  input
    .replace(ANSI_PATTERN, "")
    .replace(DETACHED_CSI_PATTERN, "")
    .replace(DETACHED_SGR_PATTERN, "")
    .replace(OSC_REMAINDER_PATTERN, "")
    .replace(/[\u0000-\u0008\u000B-\u001A\u001C-\u001F\u007F]/g, "")
    .replace(/\r/g, "")
    .split("\n")
    .map((line) => line.trimEnd())
    .filter((line) => !shouldDropDisplayLine(line))
    .join("\n")
    .trim();

const formatRelative = (ts?: string) => {
  if (!ts) return "";
  const delta = Date.now() - new Date(ts).getTime();
  const mins = Math.floor(delta / 60000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
};

const getProjectNameFromPath = (path: string) => {
  const normalized = path.replace(/\\/g, "/");
  const segments = normalized.split("/").filter(Boolean);
  return segments[segments.length - 1] || path;
};

const gitFileStatusText = (file: GitFileStatus) => {
  if (file.untracked) {
    return "untracked";
  }
  if (file.staged && file.unstaged) {
    return "staged + unstaged";
  }
  if (file.staged) {
    return "staged";
  }
  if (file.unstaged) {
    return "unstaged";
  }
  return "unknown";
};

type ActivityTone = "info" | "success" | "warn" | "error";

interface ActivityFileChange {
  path: string;
  kind: string;
  diff?: string;
  diffSource?: string;
  diffTruncated?: boolean;
  diffError?: string;
  diffStats?: {
    added: number;
    removed: number;
  };
}

interface ActivityEntry {
  id: string;
  ts: string;
  title: string;
  detail?: string;
  category?: string;
  itemType?: string;
  itemId?: string;
  status?: string;
  eventType?: string;
  command?: string;
  commandIntent?: string;
  outputPreview?: string;
  outputTail?: string;
  exitCode?: number;
  files?: ActivityFileChange[];
  tone: ActivityTone;
}

interface ComposerAttachment extends PromptAttachment {
  id: string;
  previewUrl: string;
}

interface GitActivityEntry {
  id: string;
  ts: string;
  message: string;
  tone: "info" | "success" | "error";
}

interface CommandRun {
  id: string;
  command: string;
  status: string;
  outputPreview?: string;
  outputTail?: string;
  exitCode?: number;
  lastTitle?: string;
  updates: number;
}

type TimelineMessageItem = {
  id: string;
  tsMs: number;
  order: number;
  kind: "message";
  message: MessageEvent;
};

type TimelineEventItem = {
  id: string;
  tsMs: number;
  order: number;
  kind: "event";
  entry: ActivityEntry;
};

type TimelineCommandGroupItem = {
  id: string;
  tsMs: number;
  order: number;
  kind: "command-group";
  label: string;
  runs: CommandRun[];
};

type TimelineReadGroupItem = {
  id: string;
  tsMs: number;
  order: number;
  kind: "read-group";
  label: string;
  runs: CommandRun[];
};

type TimelineFileGroupItem = {
  id: string;
  tsMs: number;
  order: number;
  kind: "file-group";
  files: ActivityFileChange[];
  status: string;
};

type TimelineItem = TimelineMessageItem | TimelineEventItem | TimelineCommandGroupItem | TimelineReadGroupItem | TimelineFileGroupItem;
type ComposerDropdownKind = "sandbox" | "approval" | "websearch";

const asRecord = (value: unknown): Record<string, unknown> | null => {
  if (!value || typeof value !== "object") {
    return null;
  }

  return value as Record<string, unknown>;
};

const asString = (value: unknown): string | null => {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const safeHref = (href?: string) => {
  if (!href) {
    return "#";
  }

  const normalized = href.trim().toLowerCase();
  if (normalized.startsWith("http://") || normalized.startsWith("https://")) {
    return href;
  }

  return "#";
};

const normalizeWebLinkUrl = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const parsed = new URL(withProtocol);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return null;
    }
    return parsed.toString();
  } catch {
    return null;
  }
};

const fileToDataUrl = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
        return;
      }
      reject(new Error("Failed to read image file."));
    };
    reader.onerror = () => reject(reader.error ?? new Error("Failed to read image file."));
    reader.readAsDataURL(file);
  });

const codexOptionsKey = (options: CodexThreadOptions) =>
  JSON.stringify({
    model: (options.model ?? "").trim(),
    sandboxMode: options.sandboxMode ?? "workspace-write",
    modelReasoningEffort: options.modelReasoningEffort ?? "medium",
    networkAccessEnabled: options.networkAccessEnabled ?? true,
    webSearchMode: options.webSearchMode ?? "cached",
    approvalPolicy: options.approvalPolicy ?? "on-request"
  });

const extractCommandFromTitle = (title: string) => {
  const match = /^(?:Running command|Command completed|Command failed|Tool call|Tool completed):\s+(.+)$/.exec(title.trim());
  return match?.[1]?.trim() || undefined;
};

const stripOuterQuotes = (value: string) => {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith("'") && trimmed.endsWith("'")) ||
    (trimmed.startsWith("\"") && trimmed.endsWith("\""))
  ) {
    return trimmed.slice(1, -1).trim();
  }

  return trimmed;
};

const unwrapShellCommand = (command: string) => {
  let current = stripOuterQuotes(command);
  let previous = "";
  const wrappers: RegExp[] = [
    /^\/bin\/(?:bash|zsh|sh)\s+-lc\s+([\s\S]+)$/i,
    /^(?:bash|zsh|sh)\s+-lc\s+([\s\S]+)$/i,
    /^cmd(?:\.exe)?\s+\/d\s+\/s\s+\/c\s+([\s\S]+)$/i,
    /^"[^"]*(?:powershell|pwsh)(?:\.exe)?"\s+-command\s+([\s\S]+)$/i,
    /^(?:(?:[a-z]:)?[^"' \t\r\n]*[\\/])?powershell(?:\.exe)?\s+-command\s+([\s\S]+)$/i,
    /^(?:(?:[a-z]:)?[^"' \t\r\n]*[\\/])?pwsh(?:\.exe)?\s+-command\s+([\s\S]+)$/i
  ];

  while (current !== previous) {
    previous = current;
    for (const wrapper of wrappers) {
      const match = wrapper.exec(current);
      if (!match?.[1]) {
        continue;
      }
      current = stripOuterQuotes(match[1]);
      break;
    }
    current = current.replace(/\\'/g, "'").replace(/\\"/g, "\"");
  }

  return current;
};

const isExplorationCommand = (command: string) => {
  const normalized = unwrapShellCommand(command).trim().toLowerCase();
  if (!normalized) {
    return false;
  }

  const patterns = [
    /^ls(?:\s|$)/,
    /^(?:get-childitem|gci|dir)(?:\s|$)/,
    /^get-location(?:\s|$)/,
    /^tree(?:\s|$)/,
    /^pwd(?:\s|$)/,
    /^rg(?:\s|$)/,
    /^(?:select-string|sls)(?:\s|$)/,
    /^grep(?:\s|$)/,
    /^find(?:\s|$)/,
    /^fd(?:\s|$)/,
    /^cat(?:\s|$)/,
    /^(?:get-content|gc|type)(?:\s|$)/,
    /^head(?:\s|$)/,
    /^tail(?:\s|$)/,
    /^stat(?:\s|$)/,
    /^git\s+status(?:\s|$)/,
    /^git\s+diff(?:\s|$)/,
    /^git\s+show(?:\s|$)/
  ];

  return patterns.some((pattern) => pattern.test(normalized));
};

const describeExploration = (command: string) => {
  const normalized = unwrapShellCommand(command).trim().toLowerCase();

  if (/^ls(?:\s|$)|^(?:get-childitem|gci|dir)(?:\s|$)|^get-location(?:\s|$)|^tree(?:\s|$)|^pwd(?:\s|$)/.test(normalized)) {
    return "exploring the project folder structure and current working directory";
  }
  if (
    /^rg\s+--files(?:\s|$)|^fd(?:\s|$)|^find(?:\s|$)/.test(normalized) ||
    (/^(?:get-childitem|gci|dir)(?:\s|$)/.test(normalized) && /-recurse(?:\s|$)/.test(normalized) && /-file(?:\s|$)/.test(normalized))
  ) {
    return "exploring which files exist in the repository";
  }
  if (/^rg(?:\s|$)|^grep(?:\s|$)|^(?:select-string|sls)(?:\s|$)/.test(normalized)) {
    return "exploring source text patterns and where code appears";
  }
  if (/^cat(?:\s|$)|^(?:get-content|gc|type)(?:\s|$)|^head(?:\s|$)|^tail(?:\s|$)/.test(normalized)) {
    return "exploring file contents";
  }
  if (/^git\s+status(?:\s|$)|^git\s+diff(?:\s|$)|^git\s+show(?:\s|$)/.test(normalized)) {
    return "exploring git state and code changes";
  }

  return "exploring project state with a read-only inspection command";
};

const parseStoredActivityEvent = (message: MessageEvent): SessionEvent | null => {
  if (message.role !== "system" || !message.content.startsWith(ACTIVITY_EVENT_PREFIX)) {
    return null;
  }

  try {
    const parsed = JSON.parse(message.content.slice(ACTIVITY_EVENT_PREFIX.length)) as {
      type?: SessionEvent["type"];
      payload?: string;
      ts?: string;
      data?: Record<string, unknown> | null;
    };

    if (!parsed || typeof parsed.type !== "string" || typeof parsed.payload !== "string") {
      return null;
    }

    return {
      threadId: message.threadId,
      type: parsed.type,
      payload: parsed.payload,
      ts: parsed.ts ?? message.ts,
      data: parsed.data ?? undefined
    };
  } catch {
    return null;
  }
};

const AssistantMarkdown = ({ content }: { content: string }) => {
  const cleaned = sanitizeForDisplay(content);
  if (!cleaned) {
    return null;
  }

  return (
    <div className="assistant-md text-white">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ href, children }) => (
            <a href={safeHref(href)} target="_blank" rel="noreferrer" className="text-slate-200 underline underline-offset-2">
              {children}
            </a>
          ),
          code: ({ className, children }) => {
            const value = String(children ?? "");
            const isBlock = Boolean(className) || value.includes("\n");

            if (!isBlock) {
              return <code className="rounded bg-zinc-800 px-1 py-0.5 text-[0.92em] text-slate-100">{children}</code>;
            }

            return (
              <code className="block overflow-x-auto rounded-md border border-zinc-700 bg-black/55 p-3 font-mono text-xs text-slate-100">
                {value.replace(/\n$/, "")}
              </code>
            );
          },
          pre: ({ children }) => <pre className="my-2">{children}</pre>
        }}
      >
        {cleaned}
      </ReactMarkdown>
    </div>
  );
};

const eventToActivityEntry = (event: SessionEvent): ActivityEntry | null => {
  if (event.type === "stdout") {
    return null;
  }

  if (!event.payload && !event.data) {
    return null;
  }

  const data = asRecord(event.data);
  const category = asString(data?.category);
  const phase = asString(data?.phase);
  let tone: ActivityTone = "info";

  if (event.type === "stderr" || phase === "failed") {
    tone = "error";
  } else if (phase === "completed") {
    tone = "success";
  } else if (category === "file_change") {
    tone = "success";
  } else if (category === "command") {
    tone = "warn";
  }

  const details: string[] = [];
  const command = asString(data?.command) ?? extractCommandFromTitle(event.payload);
  const itemType = asString(data?.itemType) ?? undefined;
  const outputPreview = asString(data?.outputPreview) ?? undefined;
  const outputTail = asString(data?.outputTail) ?? undefined;
  const itemId = asString(data?.itemId) ?? undefined;
  const status = asString(data?.status) ?? undefined;
  const eventType = asString(data?.eventType) ?? undefined;
  const commandIntent = asString(data?.commandIntent) ?? undefined;
  const exitCode = typeof data?.exitCode === "number" ? data.exitCode : undefined;

  const filesRaw = Array.isArray(data?.files) ? data.files : [];
  const files = filesRaw
    .map((entry) => asRecord(entry))
    .filter((entry): entry is Record<string, unknown> => Boolean(entry))
    .map((entry) => {
      const path = asString(entry.path) ?? "unknown";
      const kind = asString(entry.kind) ?? "update";
      const diff = asString(entry.diff) ?? undefined;
      const diffSource = asString(entry.diffSource) ?? undefined;
      const diffTruncated = Boolean(entry.diffTruncated);
      const diffError = asString(entry.diffError) ?? undefined;
      const diffStatsRecord = asRecord(entry.diffStats);
      const added = typeof diffStatsRecord?.added === "number" ? diffStatsRecord.added : undefined;
      const removed = typeof diffStatsRecord?.removed === "number" ? diffStatsRecord.removed : undefined;
      const diffStats = added !== undefined || removed !== undefined ? { added: added ?? 0, removed: removed ?? 0 } : undefined;

      return { path, kind, diff, diffSource, diffTruncated, diffError, diffStats };
    });

  const reasoningText = sanitizeForDisplay(asString(data?.text) ?? "");
  if (category === "reasoning" && reasoningText) {
    details.push(reasoningText.slice(0, 700));
  }
  if (category === "assistant_draft" && reasoningText) {
    details.push(reasoningText.slice(0, 700));
  }

  const usage = asRecord(data?.usage);
  if (usage) {
    const inTokens = typeof usage.input_tokens === "number" ? usage.input_tokens : undefined;
    const outTokens = typeof usage.output_tokens === "number" ? usage.output_tokens : undefined;
    if (inTokens !== undefined || outTokens !== undefined) {
      details.push(`tokens in/out: ${inTokens ?? 0}/${outTokens ?? 0}`);
    }
  }

  const detail = details.join("\n").trim() || undefined;
  return {
    id: `${event.ts}-${Math.random().toString(36).slice(2, 8)}`,
    ts: event.ts,
    title: event.payload,
    detail,
    category: category ?? undefined,
    itemType,
    itemId,
    status,
    eventType,
    command,
    commandIntent,
    outputPreview,
    outputTail,
    exitCode,
    files,
    tone
  };
};

const normalizeStatus = (status?: string) => {
  if (status === "completed" || status === "failed" || status === "in_progress") {
    return status;
  }

  return "in_progress";
};

const toCommandRuns = (entries: ActivityEntry[]) => {
  const runsById = new Map<string, CommandRun>();

  entries.forEach((entry, index) => {
    const inferredCommand = entry.command ?? extractCommandFromTitle(entry.title) ?? "(command)";
    const key = entry.itemId ?? `${inferredCommand}-${index}`;
    const existing = runsById.get(key);
    const command = unwrapShellCommand(inferredCommand || existing?.command || "(command)");

    if (!existing) {
      runsById.set(key, {
        id: key,
        command,
        status: normalizeStatus(entry.status),
        outputPreview: entry.outputPreview,
        outputTail: entry.outputTail,
        exitCode: entry.exitCode,
        lastTitle: entry.title,
        updates: 1
      });
      return;
    }

    existing.command = command;
    existing.status = normalizeStatus(entry.status);
    existing.updates += 1;
    existing.lastTitle = entry.title;

    if (entry.outputPreview) {
      existing.outputPreview = entry.outputPreview;
    }
    if (entry.outputTail) {
      existing.outputTail = entry.outputTail;
    }
    if (typeof entry.exitCode === "number") {
      existing.exitCode = entry.exitCode;
    }
  });

  return Array.from(runsById.values());
};

const toFileChanges = (entries: ActivityEntry[]) => {
  const filesByPath = new Map<string, ActivityFileChange>();
  let status = "in_progress";

  entries.forEach((entry) => {
    status = normalizeStatus(entry.status);
    entry.files?.forEach((file) => {
      filesByPath.set(file.path, file);
    });
  });

  return {
    files: Array.from(filesByPath.values()),
    status
  };
};

const summarizeRunStates = (runs: CommandRun[]) => {
  const completed = runs.filter((run) => run.status === "completed").length;
  const failed = runs.filter((run) => run.status === "failed").length;
  const inProgress = runs.filter((run) => run.status === "in_progress").length;
  return { completed, failed, inProgress };
};

const buildRunGroupLabel = (prefix: string, runs: CommandRun[]) => {
  const states = summarizeRunStates(runs);
  const segments = [`${prefix} (${runs.length})`];
  if (states.completed > 0) {
    segments.push(`${states.completed} done`);
  }
  if (states.failed > 0) {
    segments.push(`${states.failed} failed`);
  }
  if (states.inProgress > 0) {
    segments.push(`${states.inProgress} running`);
  }

  return segments.join(" • ");
};

const pluralize = (count: number, singular: string, plural: string) => `${count} ${count === 1 ? singular : plural}`;

const basename = (value: string) => {
  const normalized = value.replace(/\\/g, "/");
  const parts = normalized.split("/").filter(Boolean);
  return parts[parts.length - 1] ?? value;
};

const sanitizeProjectDirName = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }

  return trimmed.replace(/[\\/]/g, "").replace(/\s+/g, " ");
};

const isLikelyGitRepositoryUrl = (value: string) => {
  const input = value.trim();
  if (!input) {
    return false;
  }

  return /^(https?:\/\/|ssh:\/\/|git@|git:\/\/)/i.test(input) || /^[^/\s]+@[^:\s]+:.+/.test(input);
};

const toTitleCaseWord = (word: string) => (word.length > 1 ? `${word[0]!.toUpperCase()}${word.slice(1)}` : word.toUpperCase());

const suggestThreadTitle = (prompt: string) => {
  const normalized = prompt
    .toLowerCase()
    .replace(/[`*_#>()[\]{}:;,.!?/\\|-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!normalized) {
    return "Image review";
  }

  const tokens = normalized
    .split(" ")
    .map((token) => token.trim())
    .filter((token) => token.length > 1 && !THREAD_TITLE_STOP_WORDS.has(token));
  const deduped = Array.from(new Set(tokens));
  const picked = deduped.slice(0, 3);

  if (picked.length === 0) {
    const fallback = normalized.split(" ").filter((token) => token.length > 0).slice(0, 3);
    return fallback.map(toTitleCaseWord).join(" ");
  }

  if (picked.length === 1) {
    const second = deduped[1] ?? "Task";
    return [picked[0] ?? "Thread", second].map(toTitleCaseWord).join(" ");
  }

  return picked.map(toTitleCaseWord).join(" ");
};

const clipPath = (value: string, max = 44) => {
  if (value.length <= max) {
    return value;
  }
  return `...${value.slice(-max + 3)}`;
};

const buildFileGroupLabel = (files: ActivityFileChange[]) => {
  if (files.length === 1) {
    return `Edited ${basename(files[0]?.path ?? "file")}`;
  }
  return `File edits (${files.length})`;
};

const diffLineClass = (line: string) => {
  if (line.startsWith("+++ ") || line.startsWith("--- ")) {
    return "diff-line-meta";
  }
  if (line.startsWith("+")) {
    return "diff-line-add";
  }
  if (line.startsWith("-")) {
    return "diff-line-remove";
  }
  if (line.startsWith("@@")) {
    return "diff-line-hunk";
  }
  return "";
};

const renderDiff = (diff: string) => {
  const lines = diff.split("\n");
  return (
    <pre className="file-diff">
      {lines.map((line, idx) => (
        <div key={`${idx}-${line.slice(0, 32)}`} className={diffLineClass(line)}>
          {line || " "}
        </div>
      ))}
    </pre>
  );
};

const tokenizeShell = (command: string) => {
  const matches = command.match(/"[^"]*"|'[^']*'|[^\s]+/g) ?? [];
  return matches.map((token) => stripOuterQuotes(token));
};

const candidateLinesFromRun = (run: CommandRun) => {
  const text = run.outputTail ?? run.outputPreview ?? "";
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
};

const commandMeaning = (command: string) => {
  const normalized = unwrapShellCommand(command).trim().toLowerCase();
  if (!normalized) {
    return "Inspected repository state";
  }

  if (/^ls(?:\s|$)|^(?:get-childitem|gci|dir)(?:\s|$)|^get-location(?:\s|$)|^tree(?:\s|$)|^pwd(?:\s|$)/.test(normalized)) {
    return "Inspected directory structure";
  }
  if (
    /^rg\s+--files(?:\s|$)|^fd(?:\s|$)|^find(?:\s|$).*-type\s+f/.test(normalized) ||
    (/^(?:get-childitem|gci|dir)(?:\s|$)/.test(normalized) && /-recurse(?:\s|$)/.test(normalized) && /-file(?:\s|$)/.test(normalized))
  ) {
    return "Listed files in the project";
  }
  if (/^rg(?:\s|$)|^grep(?:\s|$)|^(?:select-string|sls)(?:\s|$)/.test(normalized)) {
    return "Searched code for matching text";
  }
  if (/^(cat|head|tail|stat)(?:\s|$)|^(?:get-content|gc|type)(?:\s|$)/.test(normalized)) {
    return "Read file contents";
  }
  if (/^git\s+status(?:\s|$)/.test(normalized)) {
    return "Checked git working tree status";
  }
  if (/^git\s+diff(?:\s|$)|^git\s+show(?:\s|$)/.test(normalized)) {
    return "Inspected code diffs";
  }
  if (/^npm\s+test(?:\s|$)|^pnpm\s+test(?:\s|$)|^yarn\s+test(?:\s|$)/.test(normalized)) {
    return "Ran test suite";
  }
  if (/^npm\s+run\s+build(?:\s|$)|^pnpm\s+build(?:\s|$)|^yarn\s+build(?:\s|$)/.test(normalized)) {
    return "Built the project";
  }
  if (/^apply_patch(?:\s|$)|^sed\s+-i(?:\s|$)|^perl\s+-pi(?:\s|$)/.test(normalized)) {
    return "Edited files";
  }

  return "Ran a shell command";
};

const extractPathLikeValue = (line: string) => {
  if (!line || line === "." || line === "..") {
    return null;
  }

  if (line.startsWith("total ")) {
    return null;
  }

  const parts = line.split(/\s+/);
  if (/^[d-][a-z-]{5}\s+\d{1,2}\/\d{1,2}\/\d{4}\s+\d{1,2}:\d{2}\s+[ap]m\s+/.test(line.toLowerCase()) && parts.length >= 5) {
    return parts[parts.length - 1] ?? null;
  }

  if (/^[\-dlpscb]/.test(parts[0] ?? "") && parts.length > 1) {
    return parts.slice(8).join(" ").trim() || null;
  }

  return line;
};

const explorationStatsFromRuns = (runs: CommandRun[]) => {
  const directoryKeys = new Set<string>();
  const fileKeys = new Set<string>();
  const directoryNames = new Set<string>();
  const fileNames = new Set<string>();

  runs.forEach((run) => {
    const command = unwrapShellCommand(run.command).trim();
    const normalized = command.toLowerCase();
    const lines = candidateLinesFromRun(run);

    if (/^pwd(?:\s|$)|^get-location(?:\s|$)/.test(normalized)) {
      directoryKeys.add(`pwd:${run.id}`);
      const pwdLine = lines[0];
      if (pwdLine) {
        directoryNames.add(pwdLine);
      }
    }

    if (/^ls(?:\s|$)|^(?:get-childitem|gci|dir)(?:\s|$)/.test(normalized)) {
      if (/-recurse(?:\s|$)/.test(normalized) && /-file(?:\s|$)/.test(normalized)) {
        lines
          .map((line) => extractPathLikeValue(line))
          .filter((value): value is string => Boolean(value))
          .forEach((value) => {
            fileKeys.add(`listed:${value}`);
            fileNames.add(value);
          });
        return;
      }

      const lsDirs = lines
        .map((line) => extractPathLikeValue(line))
        .filter((value): value is string => Boolean(value))
        .filter((value, index, values) => values.indexOf(value) === index && value !== "");

      if (lsDirs.length > 0) {
        lsDirs.forEach((value) => {
          directoryKeys.add(`ls:${value}`);
          directoryNames.add(value);
        });
      } else {
        directoryKeys.add(`ls:${run.id}`);
      }
    }

    if (/^tree(?:\s|$)/.test(normalized) || (/^find(?:\s|$)/.test(normalized) && /-type\s+d/.test(normalized))) {
      const dirs = lines
        .map((line) => extractPathLikeValue(line))
        .filter((value): value is string => Boolean(value));
      if (dirs.length > 0) {
        dirs.forEach((value) => {
          directoryKeys.add(`dir:${value}`);
          directoryNames.add(value);
        });
      } else {
        directoryKeys.add(`dir:${run.id}`);
      }
    }

    if ((/^rg(?:\s|$)/.test(normalized) && /--files(?:\s|$)/.test(normalized)) || (/^find(?:\s|$)/.test(normalized) && /-type\s+f/.test(normalized))) {
      lines
        .map((line) => extractPathLikeValue(line))
        .filter((value): value is string => Boolean(value))
        .forEach((value) => {
          fileKeys.add(`listed:${value}`);
          fileNames.add(value);
        });
    }

    if (/^(cat|head|tail|stat)(?:\s|$)|^(?:get-content|gc|type)(?:\s|$)/.test(normalized)) {
      const baseSegment = command.split(/\||&&|\|\|/)[0]?.trim() ?? command;
      const tokens = tokenizeShell(baseSegment);
      const args = tokens.slice(1).filter((token) => token && !token.startsWith("-"));
      args.forEach((arg) => {
        fileKeys.add(`read:${arg}`);
        fileNames.add(arg);
      });
      if (args.length === 0) {
        fileKeys.add(`read:${run.id}`);
      }
    }
  });

  return {
    directories: directoryKeys.size,
    files: fileKeys.size,
    directoryNames: Array.from(directoryNames),
    fileNames: Array.from(fileNames)
  };
};

const buildExplorationLabel = (runs: CommandRun[]) => {
  const { directories, files, directoryNames, fileNames } = explorationStatsFromRuns(runs);
  const segments: string[] = [];

  if (directories > 0) {
    if (directories === 1 && directoryNames[0]) {
      segments.push(`Explored ${clipPath(directoryNames[0])}`);
    } else {
      segments.push(`Explored ${pluralize(directories, "directory", "directories")}`);
    }
  }

  if (files > 0) {
    if (files === 1 && fileNames[0]) {
      segments.push(`Read ${basename(fileNames[0])}`);
    } else {
      segments.push(`Read ${pluralize(files, "file", "files")}`);
    }
  }

  if (segments.length === 0) {
    segments.push(`Exploration (${runs.length})`);
  }

  return segments.join(" • ");
};

export const App = () => {
  const [projects, setProjects] = useState<Project[]>([]);
  const [threads, setThreads] = useState<Thread[]>([]);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [messages, setMessages] = useState<MessageEvent[]>([]);
  const [terminalLines, setTerminalLines] = useState<string[]>([]);
  const [composer, setComposer] = useState("");
  const [threadMenuProjectId, setThreadMenuProjectId] = useState<string | null>(null);
  const [threadDraftTitle, setThreadDraftTitle] = useState("New thread");
  const [isProjectMenuOpen, setIsProjectMenuOpen] = useState(false);
  const [installStatus, setInstallStatus] = useState<InstallStatus | null>(null);
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [showSettings, setShowSettings] = useState(false);
  const [showProjectSettings, setShowProjectSettings] = useState(false);
  const [showNewProjectModal, setShowNewProjectModal] = useState(false);
  const [showImportProjectModal, setShowImportProjectModal] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");
  const [importProjectQuery, setImportProjectQuery] = useState("");
  const [importCandidates, setImportCandidates] = useState<GitRepositoryCandidate[]>([]);
  const [importLoading, setImportLoading] = useState(false);
  const [importBusyPath, setImportBusyPath] = useState<string | null>(null);
  const [cloneBusy, setCloneBusy] = useState(false);
  const [creatingProject, setCreatingProject] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);
  const [updateMessage, setUpdateMessage] = useState<string>("");
  const [settingsEnvText, setSettingsEnvText] = useState("{}");
  const [activity, setActivity] = useState<ActivityEntry[]>([]);
  const [runState, setRunState] = useState<"idle" | "running" | "completed" | "failed">("idle");
  const [composerOptions, setComposerOptions] = useState<CodexThreadOptions>(DEFAULT_SETTINGS.codexDefaults);
  const [composerAttachments, setComposerAttachments] = useState<ComposerAttachment[]>([]);
  const [isDraggingFiles, setIsDraggingFiles] = useState(false);
  const [projectSettingsById, setProjectSettingsById] = useState<Record<string, ProjectSettings>>({});
  const [projectTerminalById, setProjectTerminalById] = useState<Record<string, ProjectTerminalState>>({});
  const [projectPreviewUrlById, setProjectPreviewUrlById] = useState<Record<string, string>>({});
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [isGitPanelOpen, setIsGitPanelOpen] = useState(false);
  const [isPreviewPoppedOut, setIsPreviewPoppedOut] = useState(false);
  const [gitStateByProjectId, setGitStateByProjectId] = useState<Record<string, GitState>>({});
  const [gitDiffByProjectId, setGitDiffByProjectId] = useState<Record<string, string>>({});
  const [gitSelectedPathByProjectId, setGitSelectedPathByProjectId] = useState<Record<string, string | null>>({});
  const [gitBusyAction, setGitBusyAction] = useState<string | null>(null);
  const [gitCommitMessage, setGitCommitMessage] = useState("");
  const [gitBranchSearch, setGitBranchSearch] = useState("");
  const [gitActivityByProjectId, setGitActivityByProjectId] = useState<Record<string, GitActivityEntry[]>>({});
  const [isGitPoppedOut, setIsGitPoppedOut] = useState(false);
  const [projectSettingsEnvText, setProjectSettingsEnvText] = useState("{}");
  const [projectSettingsCommands, setProjectSettingsCommands] = useState<
    Array<{ id: string; name: string; command: string; autoStart: boolean; useForPreview: boolean }>
  >([]);
  const [projectSettingsWebLinks, setProjectSettingsWebLinks] = useState<ProjectWebLink[]>([]);
  const [projectSettingsAutoStart, setProjectSettingsAutoStart] = useState(true);
  const [projectSettingsBrowserEnabled, setProjectSettingsBrowserEnabled] = useState(true);
  const [projectSwitchBehaviorOverride, setProjectSwitchBehaviorOverride] = useState<ProjectTerminalSwitchBehavior | "">("");
  const [isBranchDropdownOpen, setIsBranchDropdownOpen] = useState(false);
  const [branchDropdownPosition, setBranchDropdownPosition] = useState<{ bottom: number; left: number; width: number } | null>(null);
  const [composerDropdown, setComposerDropdown] = useState<{
    kind: ComposerDropdownKind;
    bottom: number;
    left: number;
    width: number;
  } | null>(null);
  const activeThreadIdRef = useRef<string | null>(null);
  const lastStartedOptionsKeyRef = useRef<string>("");
  const attachmentsRef = useRef<ComposerAttachment[]>([]);
  const imagePickerRef = useRef<HTMLInputElement | null>(null);
  const composerTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const previewWebviewRef = useRef<HTMLElement | null>(null);
  const branchTriggerRef = useRef<HTMLDivElement | null>(null);
  const branchDropdownMenuRef = useRef<HTMLDivElement | null>(null);
  const composerSandboxTriggerRef = useRef<HTMLButtonElement | null>(null);
  const composerApprovalTriggerRef = useRef<HTMLButtonElement | null>(null);
  const composerWebSearchTriggerRef = useRef<HTMLButtonElement | null>(null);
  const composerDropdownMenuRef = useRef<HTMLDivElement | null>(null);

  const activeThread = useMemo(() => threads.find((thread) => thread.id === activeThreadId) || null, [threads, activeThreadId]);
  const selectedProject = useMemo(
    () => (activeProjectId ? projects.find((project) => project.id === activeProjectId) || null : null),
    [projects, activeProjectId]
  );
  const activeProject = useMemo(
    () => (activeThread ? projects.find((project) => project.id === activeThread.projectId) || selectedProject : selectedProject),
    [projects, activeThread, selectedProject]
  );
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
  const activeProjectPreviewUrl = useMemo(
    () => (activeProjectId ? projectPreviewUrlById[activeProjectId] ?? "" : ""),
    [activeProjectId, projectPreviewUrlById]
  );
  const activeGitState = useMemo(
    () => (activeProjectId ? gitStateByProjectId[activeProjectId] : undefined),
    [activeProjectId, gitStateByProjectId]
  );
  const activeGitDiff = useMemo(
    () => (activeProjectId ? gitDiffByProjectId[activeProjectId] ?? "" : ""),
    [activeProjectId, gitDiffByProjectId]
  );
  const activeSelectedGitPath = useMemo(
    () => (activeProjectId ? gitSelectedPathByProjectId[activeProjectId] ?? null : null),
    [activeProjectId, gitSelectedPathByProjectId]
  );
  const activeGitActivity = useMemo(
    () => (activeProjectId ? gitActivityByProjectId[activeProjectId] ?? [] : []),
    [activeProjectId, gitActivityByProjectId]
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
  const filteredBranches = useMemo(() => {
    const branches = activeGitState?.branches ?? [];
    if (!gitBranchInput) {
      return branches;
    }
    const search = gitBranchInput.toLowerCase();
    return branches.filter((branch) => branch.name.toLowerCase().includes(search));
  }, [activeGitState?.branches, gitBranchInput]);
  const exactBranchMatch = useMemo(() => {
    if (!gitBranchInput || !activeGitState?.insideRepo) {
      return null;
    }
    return activeGitState.branches.find((branch) => branch.name === gitBranchInput) ?? null;
  }, [activeGitState, gitBranchInput]);
  const canCreateBranchFromInput = Boolean(gitBranchInput) && !/\s/.test(gitBranchInput) && !exactBranchMatch;
  const sandboxLabel = SANDBOX_OPTIONS.find((option) => option.value === (composerOptions.sandboxMode ?? "workspace-write"))?.label ?? "Workspace write";
  const approvalLabel = APPROVAL_OPTIONS.find((option) => option.value === (composerOptions.approvalPolicy ?? "on-request"))?.label ?? "On request";
  const webSearchLabel = WEB_SEARCH_OPTIONS.find((option) => option.value === (composerOptions.webSearchMode ?? "cached"))?.label ?? "Cached";
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

  const groupedThreads = useMemo(() => {
    return threads.reduce<Record<string, Thread[]>>((acc, thread) => {
      const bucket = acc[thread.projectId] ?? (acc[thread.projectId] = []);
      bucket.push(thread);
      return acc;
    }, {});
  }, [threads]);
  const hasUserPromptInThread = useMemo(() => messages.some((message) => message.role === "user"), [messages]);

  const loadProjects = async () => {
    const allProjects = await api.projects.list();
    setProjects(allProjects);

    if (!activeProjectId && allProjects.length > 0) {
      setActiveProjectId(allProjects[0]!.id);
    }
  };

  const loadThreads = async () => {
    const data = await api.threads.list();
    const codexThreads = data.filter((thread) => thread.provider === "codex");
    setThreads(codexThreads);

    if (activeThreadId && !codexThreads.some((thread) => thread.id === activeThreadId)) {
      setActiveThreadId(codexThreads[0]?.id ?? null);
      return;
    }

    if (!activeThreadId && codexThreads.length > 0) {
      setActiveThreadId(codexThreads[0]!.id);
    }
  };

  const loadSettings = async () => {
    const current = await api.settings.get();
    setSettings(current);
    setSettingsEnvText(JSON.stringify(current.envVars, null, 2));
    setComposerOptions(current.codexDefaults);
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

  const loadProjectTerminalState = async (projectId: string) => {
    const state = await api.projectTerminal.getState({ projectId });
    setProjectTerminalById((prev) => ({
      ...prev,
      [projectId]: state
    }));
    return state;
  };

  const loadGitState = async (projectId: string) => {
    const gitState = await api.git.getState({ projectId });
    setGitStateByProjectId((prev) => ({
      ...prev,
      [projectId]: gitState
    }));
    return gitState;
  };

  const loadGitDiff = async (projectId: string, path?: string) => {
    const result = await api.git.getDiff({ projectId, path });
    const nextDiff = result.ok ? result.diff : result.stderr ?? "No diff available.";
    setGitDiffByProjectId((prev) => ({
      ...prev,
      [projectId]: nextDiff
    }));
    setGitSelectedPathByProjectId((prev) => ({
      ...prev,
      [projectId]: path ?? null
    }));
    return result;
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

  useEffect(() => {
    activeThreadIdRef.current = activeThreadId;
  }, [activeThreadId]);

  useEffect(() => {
    attachmentsRef.current = composerAttachments;
  }, [composerAttachments]);

  useEffect(() => {
    const textarea = composerTextareaRef.current;
    if (!textarea) {
      return;
    }
    const minHeight = 56;
    const maxHeight = 140;
    textarea.style.height = "0px";
    const nextHeight = Math.min(Math.max(textarea.scrollHeight, minHeight), maxHeight);
    textarea.style.height = `${nextHeight}px`;
    textarea.style.overflowY = textarea.scrollHeight > maxHeight ? "auto" : "hidden";
  }, [composer, activeThreadId]);

  useEffect(
    () => () => {
      attachmentsRef.current.forEach((attachment) => {
        URL.revokeObjectURL(attachment.previewUrl);
      });
    },
    []
  );

  useEffect(() => {
    const initialize = async () => {
      await loadProjects();
      await loadThreads();
      await loadSettings();
      await loadInstallerStatus();
    };

    initialize().catch((error) => {
      setLogs((prev) => [...prev, `Init failed: ${String(error)}`]);
    });
  }, []);

  useEffect(() => {
    const unsubscribe = api.sessions.onEvent((event: SessionEvent) => {
      if (event.threadId !== activeThreadIdRef.current) {
        return;
      }

      const entry = eventToActivityEntry(event);
      if (entry) {
        setActivity((prev) => [...prev.slice(-199), entry]);
      }

      const data = asRecord(event.data);
      const phase = asString(data?.phase);
      if (phase === "running") {
        setRunState("running");
      } else if (phase === "completed") {
        setRunState("completed");
      } else if (phase === "failed") {
        setRunState("failed");
      } else if (phase === "ready" || phase === "stopped") {
        setRunState("idle");
      }

      const category = asString(data?.category);
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
          setTerminalLines((prev) => [...prev.slice(-400), cleaned]);
        }

        setMessages((prev) => [
          ...prev,
          {
            id: crypto.randomUUID(),
            threadId: event.threadId,
            role: "assistant",
            content: cleaned,
            ts: event.ts,
            streamSeq: prev.length + 1
          }
        ]);
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
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    const unsubscribe = api.projectTerminal.onEvent((event: ProjectTerminalEvent) => {
      if (event.type === "preview_url_detected") {
        setProjectPreviewUrlById((prev) => ({
          ...prev,
          [event.projectId]: event.payload
        }));
        setProjectSettingsById((prev) => {
          const existing = prev[event.projectId];
          if (!existing) {
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
          });
      }
    });
    return () => {
      unsubscribe();
    };
  }, [activeProjectId]);

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
    if (!isPreviewPoppedOut || !activeProjectPreviewUrl) {
      return;
    }
    api.preview.navigate({ url: activeProjectPreviewUrl, projectName: activeProject?.name }).catch((error) => {
      setLogs((prev) => [...prev, `Preview pop-out navigate failed: ${String(error)}`]);
    });
  }, [isPreviewPoppedOut, activeProjectPreviewUrl, activeProjectId, activeProject]);

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
  }, [activeProjectId]);

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
    if (!composerDropdown) {
      return;
    }

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      const triggerRefs = [
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
      loadProjectTerminalState(targetProjectId),
      loadGitState(targetProjectId)
    ])
      .then(([, projectSettings, , gitState]) => {
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
        loadGitDiff(targetProjectId, gitState.files[0]?.path).catch((error) => {
          setLogs((prev) => [...prev, `Git diff load failed: ${String(error)}`]);
        });
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
      setRunState("idle");
      lastStartedOptionsKeyRef.current = "";
      setComposerAttachments((prev) => {
        prev.forEach((attachment) => URL.revokeObjectURL(attachment.previewUrl));
        return [];
      });
      return;
    }

    const bootThread = async () => {
      setComposerAttachments((prev) => {
        prev.forEach((attachment) => URL.revokeObjectURL(attachment.previewUrl));
        return [];
      });
      setIsDraggingFiles(false);
      const history = await api.threads.events({ threadId: activeThreadId });
      const restoredActivity: ActivityEntry[] = [];
      const restoredMessages: MessageEvent[] = [];

      history.forEach((message) => {
        const storedEvent = parseStoredActivityEvent(message);
        if (storedEvent) {
          const entry = eventToActivityEntry(storedEvent);
          if (entry) {
            restoredActivity.push(entry);
          }
          return;
        }

        if (message.role === "system") {
          return;
        }

        const content = sanitizeForDisplay(message.content);
        if (!content) {
          return;
        }

        restoredMessages.push({
          ...message,
          content
        });
      });

      setMessages(restoredMessages);
      setTerminalLines([]);
      setActivity(restoredActivity.slice(-200));
      setRunState("idle");
      await api.sessions.start({ threadId: activeThreadId, options: composerOptions });
      lastStartedOptionsKeyRef.current = codexOptionsKey(composerOptions);
    };

    bootThread().catch((error) => {
      setLogs((prev) => [...prev, `Thread startup failed: ${String(error)}`]);
    });
  }, [activeThreadId]);

  const openProject = async () => {
    setIsProjectMenuOpen(false);
    const path = await api.projects.pickPath();
    if (!path) return;

    const name = getProjectNameFromPath(path);
    const project = await api.projects.create({ name, path });
    await loadProjects();
    setActiveProjectId(project.id);
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
      setShowSettings(true);
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
      const project = await api.projects.importFromPath({ path });
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
      const project = await api.projects.cloneFromGitUrl({ url });
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
      setShowSettings(true);
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
      setShowSettings(true);
      return;
    }

    const projectName = sanitizeProjectDirName(newProjectName);
    if (!projectName) {
      setLogs((prev) => [...prev, "Project name is required and cannot contain path separators."]);
      return;
    }

    setCreatingProject(true);
    try {
      const project = await api.projects.createInDirectory({ name: projectName, parentDir });
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
    setProjectSettingsEnvText(JSON.stringify(current.envVars, null, 2));
    setProjectSettingsCommands(
      current.devCommands.map((command, index) => ({
        ...command,
        autoStart: command.autoStart ?? index === 0,
        useForPreview: command.useForPreview ?? index === 0
      }))
    );
    setProjectSettingsWebLinks(
      (current.webLinks ?? []).map((link, index) => ({
        id: link.id?.trim() || `link-${index + 1}`,
        name: link.name ?? "",
        url: link.url ?? ""
      }))
    );
    setProjectSettingsAutoStart(current.autoStartDevTerminal);
    setProjectSettingsBrowserEnabled(current.browserEnabled ?? true);
    setProjectSwitchBehaviorOverride(current.switchBehaviorOverride ?? "");
    if (activeProjectId !== projectId) {
      setActiveProjectId(projectId);
    }
    setShowProjectSettings(true);
  };

  const saveProjectSettings = async () => {
    if (!activeProjectId) {
      return;
    }

    let envVars: Record<string, string> = {};
    try {
      envVars = JSON.parse(projectSettingsEnvText) as Record<string, string>;
    } catch {
      setLogs((prev) => [...prev, "Project settings save failed: env vars must be valid JSON object."]);
      return;
    }

    const sanitizedCommands = projectSettingsCommands
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
    for (const [index, link] of projectSettingsWebLinks.entries()) {
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

    const saved = await api.projectSettings.set({
      projectId: activeProjectId,
      envVars,
      devCommands: sanitizedCommands,
      webLinks: sanitizedWebLinks,
      browserEnabled: projectSettingsBrowserEnabled,
      autoStartDevTerminal: projectSettingsAutoStart,
      switchBehaviorOverride: projectSwitchBehaviorOverride || undefined
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

      const nextState = await loadGitState(activeProjectId);
      const selectedPath =
        activeSelectedGitPath && nextState.files.some((file) => file.path === activeSelectedGitPath)
          ? activeSelectedGitPath
          : nextState.files[0]?.path;
      await loadGitDiff(activeProjectId, selectedPath);
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

  const commitGitChanges = async () => {
    if (!activeProjectId) {
      return;
    }
    setGitBusyAction("commit");
    try {
      const result = await api.git.commit({
        projectId: activeProjectId,
        message: gitCommitMessage.trim() || undefined
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
        setGitCommitMessage("");
      }

      const nextState = await loadGitState(activeProjectId);
      const selectedPath =
        activeSelectedGitPath && nextState.files.some((file) => file.path === activeSelectedGitPath)
          ? activeSelectedGitPath
          : nextState.files[0]?.path;
      await loadGitDiff(activeProjectId, selectedPath);
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
          [activeProjectId ?? ""]: [...existing, { id: crypto.randomUUID(), ts: new Date().toISOString(), message: "Branch name is required.", tone: "info" }].slice(-80)
        };
      });
      return;
    }
    if (/\s/.test(branch)) {
      setGitActivityByProjectId((prev) => {
        const existing = prev[activeProjectId ?? ""] ?? [];
        return {
          ...prev,
          [activeProjectId ?? ""]: [...existing, { id: crypto.randomUUID(), ts: new Date().toISOString(), message: "Branch name cannot contain spaces.", tone: "info" }].slice(-80)
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

  const openProjectTerminal = async () => {
    if (!activeProjectId) {
      return;
    }
    await api.projects.openTerminal({ projectId: activeProjectId });
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

  const sendPrompt = async () => {
    if (!activeThreadId) return;
    const trimmed = composer.trim();
    if (!trimmed && composerAttachments.length === 0) return;

    const optionKey = codexOptionsKey(composerOptions);
    if (optionKey !== lastStartedOptionsKeyRef.current) {
      await api.sessions.start({ threadId: activeThreadId, options: composerOptions });
      lastStartedOptionsKeyRef.current = optionKey;
    }

    const sendAttachments: PromptAttachment[] = composerAttachments.map((attachment) => ({
      name: attachment.name,
      mimeType: attachment.mimeType,
      dataUrl: attachment.dataUrl,
      size: attachment.size
    }));

    if (
      activeThread &&
      !hasUserPromptInThread &&
      (settings.autoRenameThreadTitles ?? true) &&
      GENERIC_THREAD_TITLES.has(activeThread.title.trim().toLowerCase())
    ) {
      const nextTitle = suggestThreadTitle(trimmed);
      try {
        const updated = await api.threads.update({ id: activeThread.id, title: nextTitle });
        setThreads((prev) => prev.map((thread) => (thread.id === updated.id ? updated : thread)));
      } catch (error) {
        setLogs((prev) => [...prev, `Auto rename failed: ${String(error)}`]);
      }
    }

    await api.sessions.sendInput({
      threadId: activeThreadId,
      input: trimmed,
      options: composerOptions,
      attachments: sendAttachments
    });
    setMessages((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        threadId: activeThreadId,
        role: "user",
        content:
          sendAttachments.length > 0
            ? `${trimmed ? `${trimmed}\n\n` : ""}Attached images:\n${sendAttachments.map((attachment) => `- [image] ${attachment.name}`).join("\n")}`
            : trimmed,
        ts: new Date().toISOString(),
        streamSeq: prev.length + 1
      }
    ]);
    setRunState("running");
    setComposer("");
    setComposerAttachments((prev) => {
      prev.forEach((attachment) => URL.revokeObjectURL(attachment.previewUrl));
      return [];
    });
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

    setRunState("idle");
  };

  const onComposerKeyDown: KeyboardEventHandler<HTMLTextAreaElement> = (event) => {
    if (runState === "running") {
      return;
    }

    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      sendPrompt().catch((error) => {
        setLogs((prev) => [...prev, `Send failed: ${String(error)}`]);
      });
    }
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
    if (!activeThreadId || runState === "running") {
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
    if (!activeThreadId || runState === "running") {
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
    setLogs((prev) => [...prev, "Checking Codex SDK..."]);
    const result = await api.installer.installCli({ provider: "codex" });
    setLogs((prev) => [...prev, ...result.logs]);
    await loadInstallerStatus();
  };

  const saveSettings = async () => {
    let envVars: Record<string, string> = {};
    try {
      envVars = JSON.parse(settingsEnvText) as Record<string, string>;
    } catch {
      setLogs((prev) => [...prev, "Settings save failed: envVars must be valid JSON object."]);
      return;
    }

    const mode = settings.permissionMode as PermissionMode;

    const saved = await api.settings.set({
      permissionMode: mode,
      envVars,
      defaultProjectDirectory: settings.defaultProjectDirectory?.trim() ?? "",
      autoRenameThreadTitles: settings.autoRenameThreadTitles ?? true,
      projectTerminalSwitchBehaviorDefault: settings.projectTerminalSwitchBehaviorDefault ?? "start_stop",
      codexDefaults: composerOptions
    });

    await api.permissions.setMode({ mode });

    setSettings(saved);
    setComposerOptions(saved.codexDefaults);
    setShowSettings(false);
    await loadInstallerStatus();
  };

  const checkUpdates = async () => {
    const result = await api.updates.check();
    if (!result.available) {
      setUpdateMessage("No update available.");
      return;
    }

    setUpdateMessage(`Update ${result.version} available.`);
  };

  const codexInstallBlocked = Boolean(installStatus && (!installStatus.nodeOk || !installStatus.npmOk || !installStatus.codexOk));
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

    const eventItems: TimelineEventItem[] = activity.map((entry, idx) => {
      const tsMs = new Date(entry.ts).getTime();
      return {
        id: `event-${entry.id}`,
        tsMs: Number.isFinite(tsMs) ? tsMs : idx,
        order: idx * 2 + 1,
        kind: "event",
        entry
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
        (item.entry.category === "command" &&
          !isExplorationCommand(item.entry.command ?? extractCommandFromTitle(item.entry.title) ?? ""))
      ) {
        const commandEvents: ActivityEntry[] = [item.entry];
        let next = cursor + 1;
        while (next < sortedItems.length) {
          const candidate = sortedItems[next];
          if (
            !candidate ||
            candidate.kind !== "event" ||
            candidate.entry.category !== "command" ||
            isExplorationCommand(candidate.entry.command ?? extractCommandFromTitle(candidate.entry.title) ?? "")
          ) {
            break;
          }
          commandEvents.push(candidate.entry);
          next += 1;
        }

        const runs = toCommandRuns(commandEvents);
        grouped.push({
          id: `command-group-${item.id}`,
          tsMs: item.tsMs,
          order: item.order,
          kind: "command-group",
          label: buildRunGroupLabel("Commands", runs),
          runs
        });
        cursor = next;
        continue;
      }

      if (
        item.kind === "event" &&
        (item.entry.category === "file_read" ||
          (item.entry.category === "command" &&
            isExplorationCommand(item.entry.command ?? extractCommandFromTitle(item.entry.title) ?? "")))
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
            (candidate.entry.category === "command" &&
              isExplorationCommand(candidate.entry.command ?? extractCommandFromTitle(candidate.entry.title) ?? ""));
          if (!isReadEvent) {
            break;
          }
          readEvents.push(candidate.entry);
          next += 1;
        }

        const runs = toCommandRuns(readEvents);
        grouped.push({
          id: `read-group-${item.id}`,
          tsMs: item.tsMs,
          order: item.order,
          kind: "read-group",
          label: buildExplorationLabel(runs),
          runs
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
        grouped.push({
          id: `file-group-${item.id}`,
          tsMs: item.tsMs,
          order: item.order,
          kind: "file-group",
          files: aggregate.files,
          status: aggregate.status
        });
        cursor = next;
        continue;
      }

      grouped.push(item);
      cursor += 1;
    }

    return grouped;
  }, [messages, activity]);

  return (
    <div className="h-screen overflow-hidden bg-bg text-white">
      <div className="h-full w-full bg-[radial-gradient(circle_at_top_left,#1b1b1b_0%,#111111_40%,#0a0a0a_100%)] pl-2">
        <div className="flex h-full flex-col overflow-hidden rounded-2xl bg-black/40 shadow-neon backdrop-blur-xl">
          <header className="drag-region flex h-12 items-center justify-between border-b border-border/90 px-3">
            <div className="text-sm font-semibold tracking-tight text-slate-100">Code App</div>
            <div className="no-drag flex items-center gap-2">
              {updateMessage && <span className="hidden text-xs text-slate-400 md:inline">{updateMessage}</span>}
              {activeProjectWebLinks.map((link) => (
                <button
                  key={link.id}
                  className="btn-ghost"
                  title={`${link.name || link.url} (${link.url})`}
                  onClick={() =>
                    openProjectWebLink(link).catch((error) => setLogs((prev) => [...prev, `Open web link failed: ${String(error)}`]))
                  }
                >
                  <span className="inline-flex items-center gap-1">
                    <FaExternalLinkAlt className="text-[10px]" />
                    {link.name || "Link"}
                  </span>
                </button>
              ))}
              <button className="btn-ghost" onClick={checkUpdates} title="Check for updates">
                <span className="inline-flex items-center gap-1"><FaSyncAlt className="text-[10px]" />Updates</span>
              </button>
              <button
                className="btn-ghost"
                title="Open native terminal in project folder"
                onClick={() => openProjectTerminal().catch((error) => setLogs((prev) => [...prev, `Open terminal failed: ${String(error)}`]))}
                disabled={!activeProjectId}
              >
                <span className="inline-flex items-center gap-1"><FaTerminal className="text-[10px]" />Terminal</span>
              </button>
              <button
                className="btn-ghost"
                title="Open project folder in file explorer"
                onClick={() => openProjectFiles().catch((error) => setLogs((prev) => [...prev, `Open files failed: ${String(error)}`]))}
                disabled={!activeProjectId}
              >
                <span className="inline-flex items-center gap-1"><FaFolderOpen className="text-[10px]" />Files</span>
              </button>
              <button
                className="btn-ghost"
                title={isPreviewOpen ? "Hide preview panel" : "Show preview panel"}
                onClick={() => {
                  setIsPreviewOpen((prev) => {
                    const next = !prev;
                    if (next) {
                      setIsGitPanelOpen(false);
                    }
                    return next;
                  });
                }}
              >
                <span className="inline-flex items-center gap-1"><FaEye className="text-[10px]" />{isPreviewOpen ? "Hide Preview" : "Preview"}</span>
              </button>
              <button
                className="btn-ghost"
                title={isGitPanelOpen ? "Hide git panel" : "Show git panel"}
                onClick={() => {
                  setIsGitPanelOpen((prev) => {
                    const next = !prev;
                    if (next) {
                      setIsPreviewOpen(false);
                    }
                    return next;
                  });
                }}
              >
                <span className="inline-flex items-center gap-1"><FaCodeBranch className="text-[10px]" />{isGitPanelOpen ? "Hide Git" : "Git"}</span>
              </button>
              <button className="btn-secondary" onClick={() => setShowSettings(true)} title="Open app settings">
                <span className="inline-flex items-center gap-1"><FaCog className="text-[11px]" />Settings</span>
              </button>
            </div>
          </header>

          <div
            className={`grid flex-1 min-h-0 overflow-hidden ${
              isPreviewVisible || isGitPanelOpen ? "grid-cols-[300px_minmax(0,1fr)_420px]" : "grid-cols-[300px_1fr]"
            }`}
          >
            <aside className="relative flex h-full min-h-0 flex-col border-r border-border/90 bg-[linear-gradient(180deg,#151515_0%,#121212_100%)] px-3 py-3">
	              <div className="projects-header">
	                <h2 className="projects-title">Projects</h2>
	                <div className="relative">
	                  <button
	                    className="btn-ghost h-7 w-7 p-0 text-sm"
	                    onClick={() => setIsProjectMenuOpen((prev) => !prev)}
	                    title="Add project"
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

              <div className="flex-1 min-h-0 space-y-3 overflow-y-auto pr-1 pb-3">
                {projects.length === 0 && <p className="px-2 text-sm text-muted">No projects added yet.</p>}

                {projects.map((project) => {
                  const projectThreads = groupedThreads[project.id] || [];
                  const active = activeProjectId === project.id;
                  const menuOpen = threadMenuProjectId === project.id;

                  return (
                    <section key={project.id} className="project-section">
                      <div className="project-head">
                        <button className={active ? "project-row active" : "project-row"} onClick={() => setActiveProjectId(project.id)}>
                          <span className="truncate">{project.name}</span>
                        </button>
                        <button
                          className="thread-add-btn"
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
                          className="thread-add-btn"
                          onClick={() => {
                            setActiveProjectId(project.id);
                            setThreadMenuProjectId((prev) => (prev === project.id ? null : project.id));
                          }}
                          title="New thread"
                        >
                          <FaPlus className="text-[12px]" />
                        </button>
                      </div>

                      {menuOpen && (
                        <div className="thread-create-pop">
                          <input
                            value={threadDraftTitle}
                            onChange={(event) => setThreadDraftTitle(event.target.value)}
                            className="input h-8 text-xs"
                            placeholder="New thread"
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
                        {projectThreads.length === 0 && <div className="thread-empty">No threads</div>}
                        {projectThreads.map((thread) => (
                          <button
                            key={thread.id}
                            className={activeThreadId === thread.id ? "thread-row active" : "thread-row"}
                            onClick={() => {
                              setActiveProjectId(project.id);
                              setActiveThreadId(thread.id);
                            }}
                          >
                            <div className="truncate text-left text-sm">{thread.title}</div>
                            {activeThreadId === thread.id && runState === "running" ? (
                              <div className="thread-activity-indicator" aria-label="Agent running" title="Agent running">
                                <span className="loading-ring" />
                              </div>
                            ) : (
                              <div className="ml-2 text-[11px] text-muted">{formatRelative(thread.updatedAt)}</div>
                            )}
                          </button>
                        ))}
                      </div>
                    </section>
                  );
                })}
              </div>
            </aside>

            <main className="flex h-full min-h-0 min-w-0 flex-col bg-[linear-gradient(180deg,rgba(14,14,14,.95)_0%,rgba(10,10,10,.98)_100%)]">
              {hasUserPromptInThread && installStatus && codexInstallBlocked && (
                <section className="mx-4 mt-3 rounded-xl border border-border bg-panel/70 p-3">
                  <h3 className="mb-2 text-sm font-semibold tracking-wide text-slate-100">Setup Required</h3>
                  <div className="mb-3 grid grid-cols-2 gap-2 text-sm">
                    {installStatus.details
                      .filter((detail) => detail.key !== "gemini")
                      .map((detail) => (
                        <div key={detail.key} className="rounded-lg border border-border bg-black/20 p-2">
                          <div className="font-medium">{detail.key === "codex" ? "codex sdk" : detail.key}</div>
                          <div className={detail.ok ? "text-slate-100" : "text-slate-300"}>
                            {detail.ok ? `Ready${detail.version ? ` (${detail.version})` : ""}` : detail.message}
                          </div>
                        </div>
                      ))}
                  </div>
                  {!installStatus.codexOk && (
                    <button className="btn-primary" onClick={verifyCodexSdk}>
                      Verify Codex SDK
                    </button>
                  )}
                  {(!installStatus.nodeOk || !installStatus.npmOk) && (
                    <p className="mt-3 text-xs text-slate-300">Node.js and npm are required first.</p>
                  )}
                </section>
              )}

              <section className="flex-1 min-h-0 overflow-x-hidden overflow-y-auto px-5 py-4">
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
                          onClick={() => setComposer(prompt)}
                        >
                          {prompt}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <div className="min-w-0 space-y-5 pb-6">
                  {timelineItems.map((item) => {
                    if (item.kind === "message") {
                      return item.message.role === "assistant" ? (
                        <article key={item.id} className="timeline-item min-w-0 overflow-hidden">
                          <AssistantMarkdown content={item.message.content} />
                        </article>
                      ) : (
                        <article key={item.id} className="timeline-item min-w-0 overflow-hidden rounded-lg bg-zinc-900/80 p-3">
                          <pre className="block max-w-full overflow-x-hidden whitespace-pre-wrap break-words [overflow-wrap:anywhere] font-sans text-sm leading-relaxed text-white">
                            {sanitizeForDisplay(item.message.content)}
                          </pre>
                        </article>
                      );
                    }

                    if (item.kind === "command-group") {
                      return (
                        <article key={item.id} className="timeline-item min-w-0 overflow-hidden">
                          <details className="activity-group activity-group-commands">
                            <summary className="activity-summary">{item.label}</summary>
                            <div className="activity-body">
                              {item.runs.map((run) => (
                                <details key={run.id} className="activity-command">
                                  <summary className="activity-command-summary">
                                    <span className="activity-command-meaning">{commandMeaning(run.command)}</span>
                                    <span className={`status-pill ${run.status}`}>{run.status.replace("_", " ")}</span>
                                  </summary>
                                  <div className="activity-command-body">
                                    <code className="activity-command-code">{run.command}</code>
                                    {run.outputTail ? (
                                      <pre className="activity-command-output">{run.outputTail}</pre>
                                    ) : run.outputPreview ? (
                                      <pre className="activity-command-output">{run.outputPreview}</pre>
                                    ) : (
                                      <p className="text-xs text-slate-500">No output preview yet.</p>
                                    )}
                                    <p className="mt-1 text-xs text-slate-500">
                                      {run.updates} update(s)
                                      {typeof run.exitCode === "number" ? ` • exit ${run.exitCode}` : ""}
                                    </p>
                                  </div>
                                </details>
                              ))}
                            </div>
                          </details>
                        </article>
                      );
                    }

                    if (item.kind === "read-group") {
                      return (
                        <article key={item.id} className="timeline-item min-w-0 overflow-hidden">
                          <details className="activity-group activity-group-reads">
                            <summary className="activity-summary">{item.label}</summary>
                            <div className="activity-body">
                              {item.runs.map((run) => (
                                <details key={run.id} className="activity-command">
                                  <summary className="activity-command-summary">
                                    <span className="activity-command-meaning">{commandMeaning(run.command)}</span>
                                  </summary>
                                  <div className="activity-command-body">
                                    <code className="activity-command-code">{run.command}</code>
                                    <p className="activity-exploration">Explored: {describeExploration(run.command)}</p>
                                    {run.outputTail ? (
                                      <pre className="activity-command-output">{run.outputTail}</pre>
                                    ) : run.outputPreview ? (
                                      <pre className="activity-command-output">{run.outputPreview}</pre>
                                    ) : (
                                      <p className="text-xs text-slate-500">No output preview yet.</p>
                                    )}
                                    <p className="mt-1 text-xs text-slate-500">{run.updates} update(s)</p>
                                  </div>
                                </details>
                              ))}
                            </div>
                          </details>
                        </article>
                      );
                    }

                    if (item.kind === "file-group") {
                      return (
                        <article key={item.id} className="timeline-item min-w-0 overflow-hidden">
                          <details className="activity-group activity-group-edits">
                            <summary className="activity-summary">
                              {buildFileGroupLabel(item.files)}
                              <span className={`status-pill ${item.status}`}>{item.status.replace("_", " ")}</span>
                            </summary>
                            <div className="activity-body">
                              {item.files.length > 0 ? (
                                item.files.map((file) => (
                                  <details key={`${file.path}-${file.kind}`} className="file-item">
                                    <summary className="file-row">
                                      <span className={`file-kind ${file.kind}`}>{file.kind}</span>
                                      <span className="file-path">{file.path}</span>
                                      {file.diffStats && (
                                        <span className="file-stats">
                                          +{file.diffStats.added} / -{file.diffStats.removed}
                                        </span>
                                      )}
                                      {file.diffSource && <span className="file-source">{file.diffSource}</span>}
                                    </summary>
                                    <div className="file-detail">
                                      {file.diff ? (
                                        renderDiff(file.diff)
                                      ) : (
                                        <p className="text-xs text-slate-500">{file.diffError ?? "No diff available."}</p>
                                      )}
                                      {file.diffTruncated && <p className="mt-1 text-[11px] text-slate-500">Diff preview truncated.</p>}
                                    </div>
                                  </details>
                                ))
                              ) : (
                                <p className="text-xs text-slate-500">No file paths were provided for this update.</p>
                              )}
                            </div>
                          </details>
                        </article>
                      );
                    }

                    return (
                      <article key={item.id} className="timeline-item min-w-0 overflow-hidden">
                        {item.entry.category !== "reasoning" && item.entry.category !== "assistant_draft" && (
                          <div className="whitespace-pre-wrap break-words text-sm text-slate-400 [overflow-wrap:anywhere]">
                            {item.entry.title}
                          </div>
                        )}
                        {item.entry.detail && (
                          <pre className="mt-1 whitespace-pre-wrap break-words [overflow-wrap:anywhere] text-sm leading-relaxed text-slate-400">
                            {item.entry.detail}
                          </pre>
                        )}
                      </article>
                    );
                  })}

                  {runState === "running" && <div className="text-sm text-slate-400">Thinking...</div>}
                </div>
              </section>

              <section className="bg-transparent px-5 py-3">
                <div
                  className={`rounded-xl border border-border/70 bg-black/25 p-3 transition ${isDraggingFiles ? "ring-1 ring-zinc-500/80" : ""}`}
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
                            disabled={runState === "running"}
                            title={`Remove ${attachment.name}`}
                          >
                            <FaTimes className="mx-auto text-[10px]" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  <textarea
                    ref={composerTextareaRef}
                    className="min-h-[56px] w-full resize-none bg-transparent font-sans text-sm leading-relaxed outline-none"
                    value={composer}
                    onChange={(event) => setComposer(event.target.value)}
                    onKeyDown={onComposerKeyDown}
                    onPaste={onComposerPaste}
                    placeholder={activeThread ? "Send a prompt to the active thread" : "Create a thread to start chatting"}
                    disabled={!activeThreadId}
                  />
                  <div className="mt-2 flex items-center justify-between gap-2">
                    <div className="composer-toolbar">
                      <button
                        className="composer-plus-btn"
                        title="Attach images"
                        disabled={!activeThreadId || runState === "running"}
                        onClick={() => imagePickerRef.current?.click()}
                      >
                        <FaPlus className="mx-auto text-[11px]" />
                      </button>
                      <select
                        className="composer-select"
                        value={composerOptions.model ?? "auto"}
                        style={selectWidthStyle(capitalizeFirst(composerOptions.model ?? "auto"), 10)}
                        onChange={(event) =>
                          setComposerOptions((prev) => ({
                            ...prev,
                            model: event.target.value === "auto" ? undefined : event.target.value
                          }))
                        }
                        disabled={!activeThreadId || runState === "running"}
                      >
                        <option value="auto">Auto</option>
                        {MODEL_SUGGESTIONS.map((model) => (
                          <option key={model} value={model}>
                            {capitalizeFirst(model)}
                          </option>
                        ))}
                      </select>
                      <select
                        className="composer-select"
                        value={composerOptions.modelReasoningEffort ?? "medium"}
                        style={selectWidthStyle(capitalizeFirst(composerOptions.modelReasoningEffort ?? "medium"), 10)}
                        onChange={(event) =>
                          setComposerOptions((prev) => ({
                            ...prev,
                            modelReasoningEffort: event.target.value as CodexModelReasoningEffort
                          }))
                        }
                        disabled={!activeThreadId || runState === "running"}
                      >
                        {REASONING_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                      {composerAttachments.length > 0 && (
                        <span className="text-xs text-muted">{composerAttachments.length} image(s)</span>
                      )}
                    </div>
                    <button
                      className={runState === "running" ? "btn-danger" : "btn-primary"}
                      onClick={() => {
                        if (runState === "running") {
                          stopActiveRun().catch((error) => {
                            setLogs((prev) => [...prev, `Stop failed: ${String(error)}`]);
                          });
                          return;
                        }

                        sendPrompt().catch((error) => {
                          setLogs((prev) => [...prev, `Send failed: ${String(error)}`]);
                        });
                      }}
                      disabled={
                        runState === "running"
                          ? !activeThreadId
                          : !activeThreadId || (!composer.trim() && composerAttachments.length === 0)
                      }
                      title={runState === "running" ? "Stop current run" : "Send prompt"}
                    >
                      <span className="inline-flex items-center gap-1.5">
                        {runState === "running" ? <FaStop className="text-[11px]" /> : <FaPaperPlane className="text-[11px]" />}
                        {runState === "running" ? "Stop" : "Send"}
                      </span>
                    </button>
                  </div>
                </div>
                <div className="mt-2 composer-toolbar-row">
                  <div className="composer-toolbar">
                    <span className="composer-option">
                      <FaTerminal className="composer-option-icon" />
                      <button
                        ref={composerSandboxTriggerRef}
                        className="composer-dropdown-trigger"
                        onClick={() => openComposerDropdown("sandbox", composerSandboxTriggerRef.current)}
                        disabled={!activeThreadId || runState === "running"}
                        title="Command behavior (sandbox mode)"
                      >
                        <span>{sandboxLabel.toLowerCase()}</span>
                        <FaChevronDown className="text-[10px] text-slate-500" />
                      </button>
                    </span>
                    <span className="composer-option">
                      <FaUserShield className="composer-option-icon" />
                      <button
                        ref={composerApprovalTriggerRef}
                        className="composer-dropdown-trigger"
                        onClick={() => openComposerDropdown("approval", composerApprovalTriggerRef.current)}
                        disabled={!activeThreadId || runState === "running"}
                        title="Permission policy"
                      >
                        <span>{approvalLabel.toLowerCase()}</span>
                        <FaChevronDown className="text-[10px] text-slate-500" />
                      </button>
                    </span>
                    <span className="composer-option">
                      <FaGlobeAmericas className="composer-option-icon" />
                      <button
                        ref={composerWebSearchTriggerRef}
                        className="composer-dropdown-trigger"
                        onClick={() => openComposerDropdown("websearch", composerWebSearchTriggerRef.current)}
                        disabled={!activeThreadId || runState === "running"}
                        title="Web search mode"
                      >
                        <span>{webSearchLabel.toLowerCase()}</span>
                        <FaChevronDown className="text-[10px] text-slate-500" />
                      </button>
                    </span>
                    <button
                      className={`composer-toggle-btn ${(composerOptions.networkAccessEnabled ?? true) ? "enabled" : ""}`}
                      title="Allow or block network access"
                      aria-pressed={composerOptions.networkAccessEnabled ?? true}
                      onClick={() =>
                        setComposerOptions((prev) => ({
                          ...prev,
                          networkAccessEnabled: !(prev.networkAccessEnabled ?? true)
                        }))
                      }
                      disabled={!activeThreadId || runState === "running"}
                    >
                      <FaNetworkWired className="composer-option-icon" />
                      network
                    </button>
                    <div className="branch-inline" ref={branchTriggerRef}>
                      <button
                        className="branch-trigger"
                        onClick={() => {
                          if (!activeProjectId || !activeGitState?.insideRepo || gitBusyAction) {
                            return;
                          }
                          setIsBranchDropdownOpen((prev) => !prev);
                          setGitBranchSearch("");
                        }}
                        disabled={!activeProjectId || !activeGitState?.insideRepo || Boolean(gitBusyAction)}
                        title="Switch branches"
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
              </section>

              {SHOW_TERMINAL && (
                <section className="h-48 border-t border-border bg-black/55 px-6 py-3">
                  <div className="mb-2 flex items-center justify-between">
                    <div className="text-xs uppercase tracking-[0.16em] text-muted">Terminal</div>
                    <button className="btn-secondary text-xs" onClick={() => setTerminalLines([])}>
                      Clear
                    </button>
                  </div>
                  <pre className="h-[150px] overflow-y-auto rounded-lg border border-border bg-black/35 p-2 font-mono text-xs text-slate-300">
                    {terminalLines.join("") || "No terminal output yet."}
                  </pre>
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
                        <button className="btn-ghost" onClick={reloadPreviewPane} disabled={!activeProjectPreviewUrl}>
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

                    <section className={isPreviewPoppedOut ? "min-h-0 flex-1 overflow-y-auto px-3 py-2" : "border-b border-border/80 px-3 py-2"}>
                      <div className="mb-2 flex items-center justify-between">
                        <div className="text-xs text-slate-300">Terminals running: {activeProjectTerminals.filter((terminal) => terminal.running).length}/{activeProjectTerminals.length}</div>
                        <div className="flex gap-1">
                          <button className="btn-ghost" onClick={() => startActiveProjectTerminal().catch((error) => setLogs((prev) => [...prev, `Terminal start failed: ${String(error)}`]))}>
                            {activeProjectTerminalState?.running ? "Restart All" : "Start All"}
                          </button>
                          <button className="btn-ghost" onClick={() => stopActiveProjectTerminal().catch((error) => setLogs((prev) => [...prev, `Terminal stop failed: ${String(error)}`]))} disabled={!activeProjectTerminalState?.running}>
                            Stop All
                          </button>
                        </div>
                      </div>
                      <div className="space-y-2">
                        {activeProjectTerminals.length === 0 && (
                          <div className="rounded border border-border/70 bg-black/35 px-2 py-2 text-[11px] text-slate-400">
                            No dev commands configured.
                          </div>
                        )}
                        {activeProjectTerminals.map((terminal) => (
                          <div key={terminal.commandId} className="rounded border border-border/70 bg-black/35 p-2">
                            <div className="mb-1 flex items-center justify-between gap-2">
                              <div className="min-w-0">
                                <div className="truncate text-[12px] text-slate-100">
                                  {terminal.name}
                                  {terminal.useForPreview ? " (Browser)" : ""}
                                </div>
                                <div className="truncate text-[10px] text-slate-400">{terminal.command}</div>
                              </div>
                              <div className="flex items-center gap-1">
                                <button
                                  className="btn-ghost px-2 py-1 text-[11px]"
                                  onClick={() =>
                                    startActiveProjectTerminal(terminal.commandId).catch((error) =>
                                      setLogs((prev) => [...prev, `Terminal start failed: ${String(error)}`])
                                    )
                                  }
                                >
                                  {terminal.running ? "Restart" : "Start"}
                                </button>
                                <button
                                  className="btn-ghost px-2 py-1 text-[11px]"
                                  onClick={() =>
                                    stopActiveProjectTerminal(terminal.commandId).catch((error) =>
                                      setLogs((prev) => [...prev, `Terminal stop failed: ${String(error)}`])
                                    )
                                  }
                                  disabled={!terminal.running}
                                >
                                  Stop
                                </button>
                              </div>
                            </div>
                            <pre className="h-20 overflow-y-auto rounded border border-border bg-black/35 p-2 font-mono text-[10px] text-slate-300">
                              {terminal.outputTail || "No terminal output yet."}
                            </pre>
                          </div>
                        ))}
                      </div>
                    </section>

                    {!isPreviewPoppedOut && (
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
                            loadGitState(activeProjectId)
                              .then((state) => loadGitDiff(activeProjectId, activeSelectedGitPath ?? state.files[0]?.path))
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

                    <section className="space-y-2 border-b border-border/80 px-3 py-2">
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
                          <div className="text-xs text-slate-400">
                            Ahead {activeGitState.ahead} / Behind {activeGitState.behind} - {activeGitState.stagedCount} staged,{" "}
                            {activeGitState.unstagedCount} unstaged, {activeGitState.untrackedCount} untracked
                          </div>
                          <div className="grid grid-cols-4 gap-1">
                            <button className="btn-ghost" onClick={() => runGitAction("fetch", (projectId) => api.git.fetch({ projectId })).catch((error) => setLogs((prev) => [...prev, `Git fetch failed: ${String(error)}`]))} disabled={Boolean(gitBusyAction)}>
                              Fetch
                            </button>
                            <button className="btn-ghost" onClick={() => runGitAction("pull", (projectId) => api.git.pull({ projectId })).catch((error) => setLogs((prev) => [...prev, `Git pull failed: ${String(error)}`]))} disabled={Boolean(gitBusyAction)}>
                              Pull
                            </button>
                            <button className="btn-ghost" onClick={() => runGitAction("push", (projectId) => api.git.push({ projectId })).catch((error) => setLogs((prev) => [...prev, `Git push failed: ${String(error)}`]))} disabled={Boolean(gitBusyAction)}>
                              Push
                            </button>
                            <button className="btn-ghost" onClick={() => stageGitPath().catch((error) => setLogs((prev) => [...prev, `Git stage failed: ${String(error)}`]))} disabled={Boolean(gitBusyAction) || activeGitState.files.length === 0}>
                              Stage All
                            </button>
                            {(activeGitState.ahead > 0 || activeGitState.behind > 0) && (
                              <button className="btn-secondary col-span-4" onClick={() => runGitAction("sync", (projectId) => api.git.sync({ projectId })).catch((error) => setLogs((prev) => [...prev, `Git sync failed: ${String(error)}`]))} disabled={Boolean(gitBusyAction)}>
                                Sync (fetch + pull + push)
                              </button>
                            )}
                          </div>
                          <div className="mt-2 flex items-center gap-1">
                            <input
                              className="input h-8 text-xs"
                              value={gitCommitMessage}
                              onChange={(event) => setGitCommitMessage(event.target.value)}
                              placeholder="Commit message (optional: auto-generate if empty)"
                              disabled={Boolean(gitBusyAction)}
                            />
                            <button
                              className="btn-secondary whitespace-nowrap"
                              onClick={() => commitGitChanges().catch((error) => setLogs((prev) => [...prev, `Git commit failed: ${String(error)}`]))}
                              disabled={Boolean(gitBusyAction) || activeGitState.stagedCount === 0}
                            >
                              Commit
                            </button>
                          </div>
                          <div className="git-activity mt-2">
                            <div className="git-activity-head">
                              <span>Activity</span>
                              {activeGitActivity.length > 0 && (
                                <button
                                  className="btn-ghost px-2 py-0 text-[10px]"
                                  onClick={() =>
                                    activeProjectId &&
                                    setGitActivityByProjectId((prev) => ({
                                      ...prev,
                                      [activeProjectId]: []
                                    }))
                                  }
                                >
                                  Clear
                                </button>
                              )}
                            </div>
                            <div className="git-activity-list">
                              {activeGitActivity.length === 0 ? (
                                <div className="git-activity-item info">No git activity yet.</div>
                              ) : (
                                activeGitActivity.slice(-10).map((entry) => (
                                  <div key={entry.id} className={`git-activity-item ${entry.tone}`}>
                                    {entry.message}
                                  </div>
                                ))
                              )}
                            </div>
                          </div>
                        </>
                      )}
                    </section>

                    <section className="grid min-h-0 flex-1 grid-rows-[200px_minmax(0,1fr)]">
                      <div className="overflow-y-auto border-b border-border/70 px-3 py-2">
                        {activeGitState?.insideRepo ? (
                          <div className="space-y-3">
                            <div>
                              <div className="text-[11px] uppercase tracking-[0.12em] text-slate-500">
                                Staged ({activeStagedFiles.length})
                              </div>
                              {activeStagedFiles.length === 0 ? (
                                <p className="mt-1 text-xs text-slate-500">No staged files.</p>
                              ) : (
                                activeStagedFiles.map((file) => (
                                  <div
                                    key={`staged-${file.path}-${file.indexStatus}-${file.workTreeStatus}`}
                                    className={`mt-1 rounded px-2 py-1 text-xs ${activeSelectedGitPath === file.path ? "bg-zinc-800 text-slate-100" : "text-slate-300"}`}
                                  >
                                    <div className="flex items-start justify-between gap-2">
                                      <button
                                        className="min-w-0 flex-1 text-left hover:text-white"
                                        onClick={() =>
                                          activeProjectId &&
                                          loadGitDiff(activeProjectId, file.path).catch((error) =>
                                            setLogs((prev) => [...prev, `Git diff failed: ${String(error)}`])
                                          )
                                        }
                                      >
                                        <div className="truncate">{file.path}</div>
                                        <div className="text-[10px] text-slate-500">{gitFileStatusText(file)}</div>
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
                            </div>
                            <div>
                              <div className="text-[11px] uppercase tracking-[0.12em] text-slate-500">
                                Unstaged / Untracked ({activeUnstagedFiles.length})
                              </div>
                              {activeUnstagedFiles.length === 0 ? (
                                <p className="mt-1 text-xs text-slate-500">No unstaged files.</p>
                              ) : (
                                activeUnstagedFiles.map((file) => (
                                  <div
                                    key={`unstaged-${file.path}-${file.indexStatus}-${file.workTreeStatus}`}
                                    className={`mt-1 rounded px-2 py-1 text-xs ${activeSelectedGitPath === file.path ? "bg-zinc-800 text-slate-100" : "text-slate-300"}`}
                                  >
                                    <div className="flex items-start justify-between gap-2">
                                      <button
                                        className="min-w-0 flex-1 text-left hover:text-white"
                                        onClick={() =>
                                          activeProjectId &&
                                          loadGitDiff(activeProjectId, file.path).catch((error) =>
                                            setLogs((prev) => [...prev, `Git diff failed: ${String(error)}`])
                                          )
                                        }
                                      >
                                        <div className="truncate">{file.path}</div>
                                        <div className="text-[10px] text-slate-500">{gitFileStatusText(file)}</div>
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
                            </div>
                            {activeGitState.files.length === 0 && (
                              <p className="text-xs text-slate-500">Working tree clean.</p>
                            )}
                          </div>
                        ) : (
                          <p className="text-xs text-slate-500">No git data.</p>
                        )}
                      </div>
                      <div className="min-h-0 px-3 py-2">
                        <div className="mb-1 text-[11px] uppercase tracking-[0.12em] text-slate-500">
                          Diff {activeSelectedGitPath ? `- ${activeSelectedGitPath}` : "(working tree)"}
                        </div>
                        <pre className="file-diff h-full rounded border border-border/70 bg-black/35 p-2">
                          {activeGitDiff || "No diff available."}
                        </pre>
                      </div>
                    </section>
                  </>
                )}
              </aside>
            )}
          </div>
        </div>
      </div>

      {isBranchDropdownOpen &&
        activeProjectId &&
        activeGitState?.insideRepo &&
        branchDropdownPosition &&
        createPortal(
          <div
            ref={branchDropdownMenuRef}
            className="branch-dropdown-pop"
            style={{
              position: "fixed",
              bottom: `${branchDropdownPosition.bottom}px`,
              left: `${branchDropdownPosition.left}px`,
              width: `${branchDropdownPosition.width}px`,
              zIndex: 90
            }}
          >
            <div className="p-2">
              <input
                className="input branch-search-input h-8 text-xs"
                value={gitBranchSearch}
                placeholder="Search branches or type a new one"
                autoFocus
                onChange={(event) => {
                  setGitBranchSearch(event.target.value);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Escape") {
                    event.preventDefault();
                    setIsBranchDropdownOpen(false);
                    return;
                  }
                  if (event.key !== "Enter") {
                    return;
                  }
                  event.preventDefault();
                  switchOrCreateBranch().catch((error) => {
                    setLogs((prev) => [...prev, `Branch change failed: ${String(error)}`]);
                  });
                }}
                disabled={Boolean(gitBusyAction)}
              />
            </div>
            <div className="branch-dropdown-list">
              {filteredBranches.length === 0 ? (
                <div className="branch-dropdown-empty">No matching branches.</div>
              ) : (
                filteredBranches.map((branch) => (
                  <button
                    key={branch.name}
                    className={branch.isCurrent ? "branch-dropdown-row branch-dropdown-row-current" : "branch-dropdown-row"}
                    onClick={() => {
                      switchOrCreateBranch(branch.name).catch((error) => {
                        setLogs((prev) => [...prev, `Checkout failed: ${String(error)}`]);
                      });
                    }}
                    disabled={Boolean(gitBusyAction)}
                  >
                    <span className="truncate">{branch.name}</span>
                    <span className="flex items-center gap-1">
                      {branch.isLocal ? <span className="branch-dropdown-chip">local</span> : null}
                      {branch.isOnOrigin && !branch.isLocal ? <span className="branch-dropdown-chip" title="Exists on origin only">↓</span> : null}
                      {branch.isCurrent ? <span className="branch-dropdown-chip">current</span> : null}
                    </span>
                  </button>
                ))
              )}
            </div>

            <div className="branch-dropdown-actions">
              {exactBranchMatch ? (
                <button
                  className="btn-ghost w-full text-left"
                  onClick={() => {
                    switchOrCreateBranch().catch((error) => {
                      setLogs((prev) => [...prev, `Branch change failed: ${String(error)}`]);
                    });
                  }}
                  disabled={Boolean(gitBusyAction) || exactBranchMatch.isCurrent}
                >
                  {exactBranchMatch.isCurrent ? "Already on this branch" : `Switch to ${exactBranchMatch.name}`}
                </button>
              ) : canCreateBranchFromInput ? (
                <button
                  className="btn-ghost w-full text-left"
                  onClick={() => {
                    switchOrCreateBranch().catch((error) => {
                      setLogs((prev) => [...prev, `Branch change failed: ${String(error)}`]);
                    });
                  }}
                  disabled={Boolean(gitBusyAction)}
                >
                  Create and switch to {gitBranchInput}
                </button>
              ) : (
                <div className="branch-dropdown-empty">Type a branch name to switch or create.</div>
              )}
            </div>
          </div>,
          document.body
        )}

      {composerDropdown &&
        createPortal(
          <div
            ref={composerDropdownMenuRef}
            className="branch-dropdown-pop"
            style={{
              position: "fixed",
              bottom: `${composerDropdown.bottom}px`,
              left: `${composerDropdown.left}px`,
              width: `${composerDropdown.width}px`,
              zIndex: 90
            }}
          >
            <div className="branch-dropdown-list">
              {composerDropdown.kind === "sandbox" &&
                SANDBOX_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    className={
                      (composerOptions.sandboxMode ?? "workspace-write") === option.value
                        ? "branch-dropdown-row branch-dropdown-row-current"
                        : "branch-dropdown-row"
                    }
                    onClick={() => {
                      setComposerOptions((prev) => ({
                        ...prev,
                        sandboxMode: option.value
                      }));
                      setComposerDropdown(null);
                    }}
                  >
                    <span className="truncate">{option.label.toLowerCase()}</span>
                  </button>
                ))}
              {composerDropdown.kind === "approval" &&
                APPROVAL_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    className={
                      (composerOptions.approvalPolicy ?? "on-request") === option.value
                        ? "branch-dropdown-row branch-dropdown-row-current"
                        : "branch-dropdown-row"
                    }
                    onClick={() => {
                      setComposerOptions((prev) => ({
                        ...prev,
                        approvalPolicy: option.value
                      }));
                      setComposerDropdown(null);
                    }}
                  >
                    <span className="truncate">{option.label.toLowerCase()}</span>
                  </button>
                ))}
              {composerDropdown.kind === "websearch" &&
                WEB_SEARCH_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    className={
                      (composerOptions.webSearchMode ?? "cached") === option.value
                        ? "branch-dropdown-row branch-dropdown-row-current"
                        : "branch-dropdown-row"
                    }
                    onClick={() => {
                      setComposerOptions((prev) => ({
                        ...prev,
                        webSearchMode: option.value
                      }));
                      setComposerDropdown(null);
                    }}
                  >
                    <span className="truncate">{option.label.toLowerCase()}</span>
                  </button>
                ))}
            </div>
          </div>,
          document.body
        )}

      {showSettings && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-xl rounded-2xl border border-border bg-surface p-4 shadow-neon">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold">Settings</h3>
              <button className="btn-secondary" onClick={() => setShowSettings(false)}>
                Close
              </button>
            </div>

            <label className="mb-2 block text-sm text-muted">Permission mode</label>
            <select
              className="input mb-4"
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

            <label className="mb-2 block text-sm text-muted">Codex defaults (new threads)</label>
            <div className="mb-4 grid gap-2 md:grid-cols-2">
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
              <label className="inline-flex items-center gap-2 rounded-lg border border-border bg-black/25 px-3 py-2 text-xs text-slate-200">
                <input
                  type="checkbox"
                  checked={composerOptions.networkAccessEnabled ?? true}
                  onChange={(event) =>
                    setComposerOptions((prev) => ({
                      ...prev,
                      networkAccessEnabled: event.target.checked
                    }))
                  }
                />
                Network access enabled
              </label>
            </div>

            <label className="mb-2 block text-sm text-muted">Environment variables (JSON object)</label>
            <textarea
              className="input mb-4 h-28 font-mono text-xs"
              value={settingsEnvText}
              onChange={(event) => setSettingsEnvText(event.target.value)}
            />

            <label className="mb-2 block text-sm text-muted">Project switch terminal behavior (default)</label>
            <select
              className="input mb-4 text-xs"
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

            <label className="mb-2 block text-sm text-muted">Default project directory</label>
            <div className="mb-4 flex gap-2">
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
                onClick={async () => {
                  const picked = await api.projects.pickPath();
                  if (!picked) {
                    return;
                  }
                  setSettings((prev) => ({
                    ...prev,
                    defaultProjectDirectory: picked
                  }));
                }}
              >
                Choose
              </button>
            </div>

            <label className="mb-4 inline-flex items-center gap-2 text-sm text-slate-200">
              <input
                type="checkbox"
                checked={settings.autoRenameThreadTitles ?? true}
                onChange={(event) =>
                  setSettings((prev) => ({
                    ...prev,
                    autoRenameThreadTitles: event.target.checked
                  }))
                }
              />
              Auto-rename new threads (2-3 words)
            </label>

            <div className="flex justify-end gap-2">
              <button className="btn-secondary" onClick={() => setShowSettings(false)}>
                Cancel
              </button>
              <button className="btn-primary" onClick={saveSettings}>
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {showProjectSettings && activeProjectId && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-2xl rounded-2xl border border-border bg-surface p-4 shadow-neon">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold">Project Settings</h3>
              <button className="btn-secondary" onClick={() => setShowProjectSettings(false)}>
                <span className="inline-flex items-center gap-1"><FaTimes className="text-[11px]" />Close</span>
              </button>
            </div>

            <label className="mb-2 block text-sm text-muted">Environment variables (JSON object)</label>
            <textarea
              className="input mb-4 h-28 font-mono text-xs"
              value={projectSettingsEnvText}
              onChange={(event) => setProjectSettingsEnvText(event.target.value)}
            />

            <label className="mb-2 block text-sm text-muted">Dev commands</label>
            <div className="mb-3 space-y-2">
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
                  <label className="project-settings-toggle project-settings-toggle-inline">
                    <input
                      type="checkbox"
                      checked={command.autoStart}
                      onChange={(event) =>
                        setProjectSettingsCommands((prev) =>
                          prev.map((item, idx) => (idx === index ? { ...item, autoStart: event.target.checked } : item))
                        )
                      }
                    />
                    <span>Auto</span>
                  </label>
                  <label className="project-settings-toggle project-settings-toggle-inline">
                    <input
                      type="radio"
                      name="preview-command"
                      checked={command.useForPreview}
                      onChange={() =>
                        setProjectSettingsCommands((prev) =>
                          prev.map((item, idx) => ({ ...item, useForPreview: idx === index }))
                        )
                      }
                    />
                    <span>Browser</span>
                  </label>
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
            </div>

            <button
              className="btn-secondary mb-4"
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

            <p className="mb-4 text-xs text-slate-400">
              Mark each command that should auto-start when entering this project, and choose exactly one Browser command used for preview URL detection.
            </p>

            <label className="mb-2 block text-sm text-muted">Header web links</label>
            <div className="mb-3 space-y-2">
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
            </div>

            <button
              className="btn-secondary mb-4"
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

            <label className="mb-2 block text-sm text-muted">Switch behavior override</label>
            <select
              className="input mb-4 text-xs"
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

            <label className="project-settings-toggle mb-3">
              <input
                type="checkbox"
                checked={projectSettingsAutoStart}
                onChange={(event) => setProjectSettingsAutoStart(event.target.checked)}
              />
              <span>Auto-start dev terminal for this project</span>
            </label>

            <label className="project-settings-toggle mb-4">
              <input
                type="checkbox"
                checked={projectSettingsBrowserEnabled}
                onChange={(event) => setProjectSettingsBrowserEnabled(event.target.checked)}
              />
              <span>Enable in-app browser/preview for this project</span>
            </label>

            <div className="flex justify-end gap-2">
              <button className="btn-secondary" onClick={() => setShowProjectSettings(false)}>
                Cancel
              </button>
              <button
                className="btn-primary"
                onClick={() => {
                  saveProjectSettings().catch((error) => {
                    setLogs((prev) => [...prev, `Project settings save failed: ${String(error)}`]);
                  });
                }}
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {showNewProjectModal && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-md rounded-2xl border border-border bg-surface p-4 shadow-neon">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold">New Project</h3>
              <button
                className="btn-secondary"
                onClick={() => {
                  if (creatingProject) {
                    return;
                  }
                  setShowNewProjectModal(false);
                }}
              >
                Close
              </button>
            </div>

            <p className="mb-2 text-xs text-slate-400">{settings.defaultProjectDirectory}</p>
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
                    submitNewProject().catch((error) => {
                      setLogs((prev) => [...prev, `Create project failed: ${String(error)}`]);
                    });
                  }
                }
              }}
            />

            <div className="flex justify-end gap-2">
              <button
                className="btn-secondary"
                onClick={() => setShowNewProjectModal(false)}
                disabled={creatingProject}
              >
                Cancel
              </button>
              <button
                className="btn-primary"
                onClick={() => {
                  submitNewProject().catch((error) => {
                    setLogs((prev) => [...prev, `Create project failed: ${String(error)}`]);
                  });
                }}
                disabled={creatingProject || !sanitizeProjectDirName(newProjectName)}
              >
                {creatingProject ? "Creating..." : "Create"}
              </button>
            </div>
          </div>
        </div>
      )}

      {showImportProjectModal && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-2xl rounded-2xl border border-border bg-surface p-4 shadow-neon">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold">Import Project</h3>
              <button
                className="btn-secondary"
                onClick={() => {
                  if (importLoading || importBusyPath || cloneBusy) {
                    return;
                  }
                  setShowImportProjectModal(false);
                }}
              >
                Close
              </button>
            </div>

            <p className="mb-2 text-xs text-slate-400">
              Search local git repos in <span className="font-mono">{settings.defaultProjectDirectory}</span> or paste a git URL to clone.
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
                    cloneProjectFromQuery().catch((error) => {
                      setLogs((prev) => [...prev, `Clone project failed: ${String(error)}`]);
                    });
                  }
                }}
              />
              <button
                className="btn-ghost whitespace-nowrap"
                onClick={() => {
                  loadImportCandidates().catch((error) => {
                    setLogs((prev) => [...prev, `Reload import candidates failed: ${String(error)}`]);
                  });
                }}
                disabled={importLoading || cloneBusy || Boolean(importBusyPath)}
              >
                Refresh
              </button>
              <button
                className="btn-primary whitespace-nowrap"
                onClick={() => {
                  cloneProjectFromQuery().catch((error) => {
                    setLogs((prev) => [...prev, `Clone project failed: ${String(error)}`]);
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
                            importProjectFromPath(candidate.path).catch((error) => {
                              setLogs((prev) => [...prev, `Import project failed: ${String(error)}`]);
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
      )}

      {logs.length > 0 && (
        <div className="fixed bottom-4 right-4 z-30 w-[460px] max-h-60 overflow-y-auto rounded-xl border border-border bg-black/80 p-3 font-mono text-xs text-slate-200">
          <div className="mb-2 flex items-center justify-between">
            <span className="uppercase tracking-wider text-muted">Activity</span>
            <button className="btn-secondary text-xs" onClick={() => setLogs([])}>
              Clear
            </button>
          </div>
          <div className="space-y-1">
            {logs.slice(-80).map((line, index) => (
              <div key={`${line}-${index}`}>{line}</div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
