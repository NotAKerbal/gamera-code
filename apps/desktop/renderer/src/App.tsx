import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ClipboardEventHandler,
  type DragEventHandler,
  type KeyboardEventHandler
} from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type {
  AppSettings,
  CodexApprovalMode,
  CodexModelReasoningEffort,
  CodexSandboxMode,
  CodexThreadOptions,
  CodexWebSearchMode,
  InstallStatus,
  MessageEvent,
  PermissionMode,
  PromptAttachment,
  Project,
  SessionEvent,
  Thread
} from "@code-app/shared";

const api = window.desktopAPI;

const DEFAULT_SETTINGS: AppSettings = {
  permissionMode: "prompt_on_risk",
  binaryOverrides: {},
  envVars: {},
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
    /^powershell(?:\.exe)?\s+-command\s+([\s\S]+)$/i
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
    /^tree(?:\s|$)/,
    /^pwd(?:\s|$)/,
    /^rg(?:\s|$)/,
    /^grep(?:\s|$)/,
    /^find(?:\s|$)/,
    /^fd(?:\s|$)/,
    /^cat(?:\s|$)/,
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

  if (/^ls(?:\s|$)|^tree(?:\s|$)|^pwd(?:\s|$)/.test(normalized)) {
    return "exploring the project folder structure and current working directory";
  }
  if (/^rg\s+--files(?:\s|$)|^fd(?:\s|$)|^find(?:\s|$)/.test(normalized)) {
    return "exploring which files exist in the repository";
  }
  if (/^rg(?:\s|$)|^grep(?:\s|$)/.test(normalized)) {
    return "exploring source text patterns and where code appears";
  }
  if (/^cat(?:\s|$)|^head(?:\s|$)|^tail(?:\s|$)/.test(normalized)) {
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

const clipPath = (value: string, max = 44) => {
  if (value.length <= max) {
    return value;
  }
  return `...${value.slice(-max + 3)}`;
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

  if (/^ls(?:\s|$)|^tree(?:\s|$)|^pwd(?:\s|$)/.test(normalized)) {
    return "Inspected directory structure";
  }
  if (/^rg\s+--files(?:\s|$)|^fd(?:\s|$)|^find(?:\s|$).*-type\s+f/.test(normalized)) {
    return "Listed files in the project";
  }
  if (/^rg(?:\s|$)|^grep(?:\s|$)/.test(normalized)) {
    return "Searched code for matching text";
  }
  if (/^(cat|head|tail|stat)(?:\s|$)/.test(normalized)) {
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

    if (/^pwd(?:\s|$)/.test(normalized)) {
      directoryKeys.add(`pwd:${run.id}`);
      const pwdLine = lines[0];
      if (pwdLine) {
        directoryNames.add(pwdLine);
      }
    }

    if (/^ls(?:\s|$)/.test(normalized)) {
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

    if (/^(cat|head|tail|stat)(?:\s|$)/.test(normalized)) {
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
  const [installStatus, setInstallStatus] = useState<InstallStatus | null>(null);
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [showSettings, setShowSettings] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);
  const [updateMessage, setUpdateMessage] = useState<string>("");
  const [settingsEnvText, setSettingsEnvText] = useState("{}");
  const [activity, setActivity] = useState<ActivityEntry[]>([]);
  const [runState, setRunState] = useState<"idle" | "running" | "completed" | "failed">("idle");
  const [composerOptions, setComposerOptions] = useState<CodexThreadOptions>(DEFAULT_SETTINGS.codexDefaults);
  const [composerAttachments, setComposerAttachments] = useState<ComposerAttachment[]>([]);
  const [isDraggingFiles, setIsDraggingFiles] = useState(false);
  const activeThreadIdRef = useRef<string | null>(null);
  const lastStartedOptionsKeyRef = useRef<string>("");
  const attachmentsRef = useRef<ComposerAttachment[]>([]);
  const imagePickerRef = useRef<HTMLInputElement | null>(null);

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
    if (!activeProjectId) {
      return;
    }

    loadThreads().catch((error) => {
      setLogs((prev) => [...prev, `Load threads failed: ${String(error)}`]);
    });
  }, [activeProjectId]);

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

  const addProject = async () => {
    const path = await api.projects.pickPath();
    if (!path) return;

    const name = getProjectNameFromPath(path);
    const project = await api.projects.create({ name, path });
    await loadProjects();
    setActiveProjectId(project.id);
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
              <button className="btn-ghost" onClick={addProject}>
                + Project
              </button>
              <button className="btn-ghost" onClick={checkUpdates}>
                Updates
              </button>
              <button className="btn-secondary" onClick={() => setShowSettings(true)}>
                Settings
              </button>
            </div>
          </header>

          <div className="grid flex-1 min-h-0 grid-cols-[300px_1fr] overflow-hidden">
            <aside className="relative flex h-full min-h-0 flex-col border-r border-border/90 bg-[linear-gradient(180deg,#151515_0%,#121212_100%)] px-3 py-3">
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
                            setThreadMenuProjectId((prev) => (prev === project.id ? null : project.id));
                          }}
                          title="New thread"
                        >
                          +
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
                            <div className="ml-2 text-[11px] text-muted">{formatRelative(thread.updatedAt)}</div>
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
                              File edits ({item.files.length})
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
                                        <pre className="file-diff">{file.diff}</pre>
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

              <section className="border-t border-border bg-black/40 px-5 py-3">
                <div
                  className={`rounded-xl bg-panel/90 p-3 transition ${isDraggingFiles ? "ring-1 ring-zinc-500/80" : ""}`}
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
                          >
                            x
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  <textarea
                    className="h-20 w-full resize-none bg-transparent font-sans text-sm outline-none"
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
                        +
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
                    >
                      {runState === "running" ? "Stop" : "Send"}
                    </button>
                  </div>
                </div>
                <div className="mt-2 composer-toolbar-row">
                  <div className="composer-toolbar">
                    <select
                      className="composer-select"
                      value={composerOptions.sandboxMode ?? "workspace-write"}
                      style={selectWidthStyle(composerOptions.sandboxMode ?? "workspace-write", 14)}
                      onChange={(event) =>
                        setComposerOptions((prev) => ({
                          ...prev,
                          sandboxMode: event.target.value as CodexSandboxMode
                        }))
                      }
                      disabled={!activeThreadId || runState === "running"}
                    >
                      {SANDBOX_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label.toLowerCase()}
                        </option>
                      ))}
                    </select>
                    <select
                      className="composer-select"
                      value={composerOptions.approvalPolicy ?? "on-request"}
                      style={selectWidthStyle(composerOptions.approvalPolicy ?? "on-request", 10)}
                      onChange={(event) =>
                        setComposerOptions((prev) => ({
                          ...prev,
                          approvalPolicy: event.target.value as CodexApprovalMode
                        }))
                      }
                      disabled={!activeThreadId || runState === "running"}
                    >
                      {APPROVAL_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label.toLowerCase()}
                        </option>
                      ))}
                    </select>
                    <select
                      className="composer-select"
                      value={composerOptions.webSearchMode ?? "cached"}
                      style={selectWidthStyle(composerOptions.webSearchMode ?? "cached", 8)}
                      onChange={(event) =>
                        setComposerOptions((prev) => ({
                          ...prev,
                          webSearchMode: event.target.value as CodexWebSearchMode
                        }))
                      }
                      disabled={!activeThreadId || runState === "running"}
                    >
                      {WEB_SEARCH_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label.toLowerCase()}
                        </option>
                      ))}
                    </select>
                    <label className="composer-toggle">
                      <input
                        type="checkbox"
                        checked={composerOptions.networkAccessEnabled ?? true}
                        onChange={(event) =>
                          setComposerOptions((prev) => ({
                            ...prev,
                            networkAccessEnabled: event.target.checked
                          }))
                        }
                        disabled={!activeThreadId || runState === "running"}
                      />
                      network
                    </label>
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
          </div>
        </div>
      </div>

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
