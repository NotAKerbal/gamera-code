import { memo, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import { FaChevronDown, FaCodeBranch, FaGlobeAmericas } from "react-icons/fa";
import type { MessageEvent, PromptAttachment, SubthreadProposal } from "@code-app/shared";
import {
  splitAssistantContentSegments,
  MARKDOWN_REMARK_PLUGINS,
  TRACE_CHILD_MAX_HEIGHT_PX,
  buildFileGroupLabel,
  commandMeaning,
  describeExploration,
  diffLineClass,
  normalizeMessageAttachments,
  normalizeWebLinkUrl,
  safeHref,
  sanitizeForDisplay,
  summarizePlanMarkdown,
  todosToMarkdown,
  type PlanArtifact,
  type TimelineItem,
} from "./appCore";


const MarkdownContent = ({ content }: { content: string }) => {
  return (
    <div className="assistant-md text-[15px] leading-7 text-white">
      <ReactMarkdown
        remarkPlugins={MARKDOWN_REMARK_PLUGINS}
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
              return <code className="rounded bg-zinc-800 px-1.5 py-0.5 text-[0.9em] text-slate-100">{children}</code>;
            }

            return (
              <code className="block overflow-x-auto rounded-md border border-zinc-700 bg-black/55 p-4 font-mono text-[13px] leading-6 text-slate-100">
                {value.replace(/\n$/, "")}
              </code>
            );
          },
          pre: ({ children }) => <pre className="my-4">{children}</pre>
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
};

const SHELL_OPERATOR_TOKENS = new Set([
  "|",
  "||",
  "&&",
  ";",
  ">",
  ">>",
  "<",
  "<<",
  "2>",
  "2>>",
  "&>",
  "1>",
  "1>>"
]);

const COMMAND_TOKEN_PATTERN = /(\s+|"(?:\\.|[^"])*"|'(?:\\.|[^'])*'|`(?:\\.|[^`])*`|\$\{[^}]+\}|\$[A-Za-z_]\w*|%[A-Za-z_]\w*%|2>>|2>|1>>|1>|>>|<<|\|\||&&|[|;<>]|--?[A-Za-z0-9][\w-]*|[^\s]+)/g;

const classifyCommandToken = (token: string, isFirstCommandToken: boolean): string => {
  if (/^\s+$/.test(token)) {
    return "plain";
  }
  if (SHELL_OPERATOR_TOKENS.has(token)) {
    return "operator";
  }
  if (/^"(?:\\.|[^"])*"$|^'(?:\\.|[^'])*'$|^`(?:\\.|[^`])*`$/.test(token)) {
    return "string";
  }
  if (/^\$\{[^}]+\}$|^\$[A-Za-z_]\w*$|^%[A-Za-z_]\w*%$/.test(token)) {
    return "variable";
  }
  if (/^--?[A-Za-z0-9][\w-]*$/.test(token)) {
    return "flag";
  }
  if (/^[.~]|[\\/]/.test(token)) {
    return "path";
  }
  if (isFirstCommandToken) {
    return "command";
  }
  return "plain";
};

const renderHighlightedCommand = (command: string): ReactNode[] => {
  const tokens = command.match(COMMAND_TOKEN_PATTERN) ?? [command];
  let sawCommandToken = false;
  return tokens.map((token, index) => {
    if (/^\s+$/.test(token)) {
      return <span key={`space-${index}`}>{token}</span>;
    }
    const tokenType = classifyCommandToken(token, !sawCommandToken);
    if (tokenType === "command") {
      sawCommandToken = true;
    } else if (tokenType !== "operator") {
      sawCommandToken = sawCommandToken || /[^\s]/.test(token);
    }
    const className = tokenType === "plain" ? undefined : `cmd-token cmd-token-${tokenType}`;
    return (
      <span key={`token-${index}`} className={className}>
        {token}
      </span>
    );
  });
};

const PlanSummaryCard = ({
  label,
  summary,
  onViewPlan,
  onBuildNow,
  onCopy
}: {
  label: string;
  summary: string;
  onViewPlan: () => void;
  onBuildNow: () => void;
  onCopy: () => void;
}) => (
  <section className="rounded-lg border border-border/70 bg-zinc-900/60 p-4">
    <div className="mb-3 text-[11px] uppercase tracking-[0.12em] text-slate-400">{label}</div>
    <p className="text-[15px] leading-7 text-slate-200">{summary}</p>
    <div className="mt-4 flex flex-wrap gap-2">
      <button className="btn-ghost h-8 px-2 py-0 text-xs" onClick={onViewPlan}>
        View plan
      </button>
      <button className="btn-primary h-8 px-2 py-0 text-xs" onClick={onBuildNow}>
        Build now
      </button>
      <button className="btn-ghost h-8 px-2 py-0 text-xs" onClick={onCopy}>
        Copy
      </button>
    </div>
  </section>
);

const SubthreadProposalCard = ({ proposal }: { proposal: SubthreadProposal }) => (
  <section className="rounded-lg border border-border/70 bg-zinc-900/60 p-4">
    <div className="mb-2 text-[11px] uppercase tracking-[0.12em] text-slate-400">Sub-thread Proposal</div>
    <p className="text-[14px] text-slate-100">{proposal.reason}</p>
    <p className="mt-1 text-xs text-slate-400">Goal: {proposal.parentGoal}</p>
    <div className="mt-3 grid grid-cols-1 gap-2">
      {proposal.tasks.map((task) => (
        <article key={task.key} className="rounded-md border border-border/70 bg-black/25 p-3">
          <div className="flex items-center justify-between gap-2">
            <h4 className="text-sm text-slate-100">{task.title}</h4>
            <span className="rounded border border-border/70 bg-zinc-900 px-1.5 py-0.5 text-[10px] uppercase tracking-[0.08em] text-slate-400">
              {task.key}
            </span>
          </div>
          <p className="mt-2 whitespace-pre-wrap text-xs leading-5 text-slate-300">{task.prompt}</p>
          {task.expectedOutput ? (
            <p className="mt-2 text-xs text-slate-400">
              <span className="font-semibold text-slate-300">Expected:</span> {task.expectedOutput}
            </p>
          ) : null}
        </article>
      ))}
    </div>
  </section>
);

const AssistantMarkdown = ({
  messageId,
  content,
  plansById,
  onViewPlan,
  onBuildPlan,
  onCopyPlan
}: {
  messageId: string;
  content: string;
  plansById: Record<string, PlanArtifact>;
  onViewPlan: (planId: string) => void;
  onBuildPlan: (planId: string) => void;
  onCopyPlan: (planId: string) => void;
}) => {
  const cleaned = sanitizeForDisplay(content);
  if (!cleaned) {
    return null;
  }
  const segments = splitAssistantContentSegments(cleaned, messageId);

  return (
    <div className="space-y-3">
      {segments.map((segment, index) => {
        if (segment.kind === "subthread_proposal" && segment.proposal) {
          return <SubthreadProposalCard key={`subthread-${messageId}-${index}`} proposal={segment.proposal} />;
        }
        if (segment.kind === "markdown") {
          if (!segment.content.trim()) {
            return null;
          }
          return <MarkdownContent key={`md-${messageId}-${index}`} content={segment.content} />;
        }

        const fallbackSummary = summarizePlanMarkdown(segment.content);
        const plan = segment.planId ? plansById[segment.planId] : undefined;
        const summary = plan?.summary ?? fallbackSummary;
        const planId = plan?.id ?? segment.planId;
        if (!planId) {
          return <MarkdownContent key={`md-fallback-${messageId}-${index}`} content={segment.content} />;
        }

        return (
          <PlanSummaryCard
            key={`plan-${planId}`}
            label="Proposed Plan"
            summary={summary}
            onViewPlan={() => onViewPlan(planId)}
            onBuildNow={() => onBuildPlan(planId)}
            onCopy={() => onCopyPlan(planId)}
          />
        );
      })}
    </div>
  );
};

export const MemoizedAssistantMarkdown = memo(AssistantMarkdown);

const UserMessageContent = ({ content, attachments }: { content: string; attachments?: PromptAttachment[] }) => {
  const cleaned = useMemo(() => sanitizeForDisplay(content), [content]);
  const normalizedAttachments = useMemo(() => normalizeMessageAttachments(attachments), [attachments]);
  return (
    <div className="space-y-2">
      {cleaned ? (
        <pre className="block max-w-full overflow-x-hidden whitespace-pre-wrap break-words [overflow-wrap:anywhere] font-sans text-sm leading-relaxed text-white">
          {cleaned}
        </pre>
      ) : null}
      {normalizedAttachments.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {normalizedAttachments.map((attachment, index) => (
            attachment.mimeType.startsWith("image/") ? (
              <img
                key={`${attachment.name}-${index}`}
                src={attachment.dataUrl}
                alt={attachment.name}
                className="h-24 w-auto max-w-[220px] rounded-md border border-border/70 object-cover"
              />
            ) : (
              <div
                key={`${attachment.name}-${index}`}
                className="inline-flex max-w-[240px] items-center gap-2 rounded-md border border-border/70 bg-zinc-900/80 px-2 py-1 text-xs text-slate-200"
                title={attachment.name}
              >
                <span className="rounded border border-border/70 bg-zinc-800 px-1 text-[10px] uppercase tracking-wide text-slate-300">
                  file
                </span>
                <span className="truncate">{attachment.name}</span>
              </div>
            )
          ))}
        </div>
      ) : null}
    </div>
  );
};

export const MemoizedUserMessageContent = memo(UserMessageContent);

const formatDuration = (ms: number) => {
  if (ms > 0 && ms < 1000) {
    return `${ms}ms`;
  }
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  if (minutes <= 0) {
    return `${totalSeconds}s`;
  }
  if (seconds <= 0) {
    return `${minutes}m`;
  }
  return `${minutes}m ${seconds}s`;
};

const TimelineItemDuration = ({ ms, className }: { ms: number; className?: string }) => {
  const label = formatDuration(ms);
  if (!label) {
    return null;
  }
  return <div className={`text-right text-[11px] text-slate-400 ${className ?? ""}`}>{label}</div>;
};

interface TimelineItemsListProps {
  timelineItems: TimelineItem[];
  plansById: Record<string, PlanArtifact>;
  getTodoPlanByActivityId: (activityId: string) => PlanArtifact | undefined;
  onViewPlan: (planId: string) => void;
  onBuildPlan: (planId: string) => void;
  onCopyPlan: (planId: string) => void;
  onForkFromUserMessage?: (message: MessageEvent) => void;
  showDurations?: boolean;
}

const TimelineItemsList = ({
  timelineItems,
  plansById,
  getTodoPlanByActivityId,
  onViewPlan,
  onBuildPlan,
  onCopyPlan,
  onForkFromUserMessage,
  showDurations = false
}: TimelineItemsListProps) => {
  const [expandedActivityGroups, setExpandedActivityGroups] = useState<Record<string, boolean>>({});

  return (
    <>
      {timelineItems.map((item, index) => {
        const previousTs = index > 0 ? timelineItems[index - 1]?.tsMs : item.tsMs;
        const durationMs = Math.max(0, item.tsMs - previousTs);

        if (item.kind === "message") {
          return item.message.role === "assistant" ? (
            <article key={item.id} className="timeline-item min-w-0 overflow-hidden">
              {showDurations && (
                <div className="mb-1 flex items-center justify-end">
                  <TimelineItemDuration ms={durationMs} />
                </div>
              )}
              <MemoizedAssistantMarkdown
                messageId={item.message.id}
                content={item.message.content}
                plansById={plansById}
                onViewPlan={onViewPlan}
                onBuildPlan={onBuildPlan}
                onCopyPlan={onCopyPlan}
              />
            </article>
          ) : (
            <article key={item.id} className="timeline-item group relative min-w-0 overflow-hidden rounded-lg bg-zinc-900/80 p-3">
              {showDurations && (
                <div className="mb-1 flex items-center justify-end">
                  <TimelineItemDuration ms={durationMs} />
                </div>
              )}
              {onForkFromUserMessage && (
                <button
                  type="button"
                  className="btn-ghost absolute right-2 top-2 h-7 w-7 p-0 opacity-0 transition-opacity group-hover:opacity-100 focus:opacity-100"
                  onClick={() => onForkFromUserMessage(item.message)}
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

        if (item.kind === "command-group" || item.kind === "read-group") {
          const groupOpen = expandedActivityGroups[item.id] ?? false;
          const isCommandGroup = item.kind === "command-group";
          return (
            <article key={item.id} className="timeline-item min-w-0 overflow-hidden">
              <section
                className={`activity-group ${
                  isCommandGroup ? "activity-group-commands" : "activity-group-reads"
                } ${groupOpen ? "is-open" : ""}`}
              >
                <button
                  type="button"
                  className="activity-summary"
                  aria-expanded={groupOpen}
                  onClick={() => {
                    const nextOpen = !groupOpen;
                    setExpandedActivityGroups((prev) => ({ ...prev, [item.id]: nextOpen }));
                  }}
                >
                  <span>{item.label}</span>
                  {isCommandGroup ? (
                    <>
                      {item.stateSummary.completed > 0 && (
                        <span className="summary-chip summary-chip-success">{item.stateSummary.completed} done</span>
                      )}
                      {item.stateSummary.failed > 0 && (
                        <span className="summary-chip summary-chip-error">{item.stateSummary.failed} failed</span>
                      )}
                      {item.stateSummary.inProgress > 0 && (
                        <span className="summary-chip summary-chip-running">{item.stateSummary.inProgress} running</span>
                      )}
                      {item.stateSummary.completed === 0 &&
                        item.stateSummary.failed === 0 &&
                        item.stateSummary.inProgress === 0 && <span className="summary-chip">{item.runs.length}</span>}
                    </>
                  ) : (
                    <span className="summary-chip">{item.runs.length}</span>
                  )}
                  <span className="ml-auto flex items-center gap-2">
                    {showDurations && <TimelineItemDuration ms={durationMs} />}
                    <FaChevronDown className={`accordion-chevron ${groupOpen ? "open" : ""}`} />
                  </span>
                </button>
                {groupOpen && (
                  <div className="activity-collapse open">
                    <div className="activity-body">
                      {item.runs.map((run) => (
                        <div key={run.id} className="activity-command">
                          <div className="activity-command-summary">
                            <span className="activity-command-meaning">{commandMeaning(run.command)}</span>
                            {isCommandGroup && <span className={`status-pill ${run.status}`}>{run.status.replace("_", " ")}</span>}
                          </div>
                          <TraceOverflow id={`${item.id}:${run.id}`}>
                            <div className="activity-command-body">
                              <code className="activity-command-code">{renderHighlightedCommand(run.command)}</code>
                              {!isCommandGroup && <p className="activity-exploration">Explored: {describeExploration(run.command)}</p>}
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
                          </TraceOverflow>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </section>
            </article>
          );
        }

        if (item.kind === "file-group") {
          const groupOpen = expandedActivityGroups[item.id] ?? false;
          const fileDiffs = item.files.reduce(
            (acc, file) => ({
              added: acc.added + (file.diffStats?.added ?? 0),
              removed: acc.removed + (file.diffStats?.removed ?? 0)
            }),
            { added: 0, removed: 0 }
          );
          return (
            <article key={item.id} className="timeline-item min-w-0 overflow-hidden">
              <section className={`activity-group activity-group-edits ${groupOpen ? "is-open" : ""}`}>
                <button
                  type="button"
                  className="activity-summary"
                  aria-expanded={groupOpen}
                  onClick={() => {
                    const nextOpen = !groupOpen;
                    setExpandedActivityGroups((prev) => ({ ...prev, [item.id]: nextOpen }));
                  }}
                >
                  {buildFileGroupLabel(item.files)}
                  <span className="activity-summary-right">
                    <span className="git-header-diff-badge header-pill px-1.5 py-0.5 text-[10px]">
                      <span className="text-emerald-300">+{fileDiffs.added}</span>
                      <span className="px-1 text-slate-500">/</span>
                      <span className="text-rose-300">-{fileDiffs.removed}</span>
                    </span>
                    {showDurations && <TimelineItemDuration ms={durationMs} />}
                    <FaChevronDown className={`accordion-chevron ${groupOpen ? "open" : ""}`} />
                  </span>
                </button>
                {groupOpen && (
                  <div className="activity-collapse open">
                    <div className="activity-body">
                      {item.files.length > 0 ? (
                        item.files.map((file, index) => (
                          <div key={`${file.path}-${file.kind}-${index}`} className="file-item">
                            <div className="file-row">
                              <span className={`file-kind ${file.kind}`}>{file.kind}</span>
                              <span className="file-path">{file.path}</span>
                              {file.diffStats && (
                                <span className="file-stats">
                                  +{file.diffStats.added} / -{file.diffStats.removed}
                                </span>
                              )}
                              {file.diffSource && <span className="file-source">{file.diffSource}</span>}
                            </div>
                            <TraceOverflow id={`${item.id}:${file.path}:${file.kind}:${index}`}>
                              <div className="file-detail">
                                {file.diff ? (
                                  renderDiff(file.diff)
                                ) : (
                                  <p className="text-xs text-slate-500">{file.diffError ?? "No diff available."}</p>
                                )}
                                {file.diffTruncated && <p className="mt-1 text-[11px] text-slate-500">Diff preview truncated.</p>}
                              </div>
                            </TraceOverflow>
                          </div>
                        ))
                      ) : (
                        <p className="text-xs text-slate-500">No file paths were provided for this update.</p>
                      )}
                    </div>
                  </div>
                )}
              </section>
            </article>
          );
        }

        if (item.entry.category === "web_search") {
          const parsedQuery = item.entry.title.replace(/^Web search:\s*/i, "").trim();
          const query = item.entry.query ?? (parsedQuery || "web search");
          const normalizedUrl = normalizeWebLinkUrl(query);
          return (
            <article key={item.id} className="timeline-item min-w-0 overflow-hidden rounded-lg border border-border/70 bg-zinc-900/60 p-3">
              {showDurations && (
                <div className="mb-1 flex items-center justify-end">
                  <TimelineItemDuration ms={durationMs} />
                </div>
              )}
              <div className="inline-flex items-center gap-2 text-xs uppercase tracking-[0.12em] text-slate-400">
                <FaGlobeAmericas className="text-[11px]" />
                Web Search
              </div>
              <div className="mt-2 whitespace-pre-wrap break-words text-sm text-slate-200 [overflow-wrap:anywhere]">{query}</div>
              {normalizedUrl && (
                <a
                  href={safeHref(normalizedUrl)}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-2 inline-block text-xs text-slate-300 underline underline-offset-2"
                >
                  {normalizedUrl}
                </a>
              )}
            </article>
          );
        }

        if (item.entry.category === "plan" && (item.entry.todos?.length ?? 0) > 0) {
          const plan = getTodoPlanByActivityId(item.entry.id);
          const summary = plan?.summary ?? summarizePlanMarkdown(todosToMarkdown(item.entry.todos ?? []));
          const planId = plan?.id ?? `todo:${item.entry.id}`;
          return (
            <article key={item.id} className="timeline-item min-w-0 overflow-hidden">
              {showDurations && (
                <div className="mb-1 flex items-center justify-end">
                  <TimelineItemDuration ms={durationMs} />
                </div>
              )}
              <PlanSummaryCard
                label="Plan"
                summary={summary}
                onViewPlan={() => onViewPlan(planId)}
                onBuildNow={() => onBuildPlan(planId)}
                onCopy={() => onCopyPlan(planId)}
              />
            </article>
          );
        }

        return (
          <article key={item.id} className="timeline-item min-w-0 overflow-hidden">
            {showDurations && (
              <div className="mb-1 flex items-center justify-end">
                <TimelineItemDuration ms={durationMs} />
              </div>
            )}
            {item.entry.category !== "assistant_draft" && (
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
    </>
  );
};

export const MemoizedTimelineItemsList = memo(TimelineItemsList);

export const renderDiff = (diff: string, className = "file-diff") => {
  const lines = diff.split("\n");
  return (
    <pre className={className}>
      {lines.map((line, idx) => (
        <div key={`${idx}-${line.slice(0, 32)}`} className={diffLineClass(line)}>
          {line || " "}
        </div>
      ))}
    </pre>
  );
};

interface TraceOverflowProps {
  id: string;
  children: ReactNode;
}

export const TraceOverflow = ({ id, children }: TraceOverflowProps) => {
  const [expanded, setExpanded] = useState(false);
  const [overflowed, setOverflowed] = useState(false);
  const contentRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setExpanded(false);
  }, [id]);

  useEffect(() => {
    const content = contentRef.current;
    if (!content || expanded) {
      setOverflowed(false);
      return;
    }

    const detectOverflow = () => {
      setOverflowed(content.scrollHeight - content.clientHeight > 2);
    };

    detectOverflow();
    const onResize = () => detectOverflow();
    window.addEventListener("resize", onResize);

    return () => {
      window.removeEventListener("resize", onResize);
    };
  }, [children, expanded, id]);

  return (
    <div className={`trace-child ${expanded ? "expanded" : ""}`}>
      <div
        ref={contentRef}
        className="trace-child-content"
        style={expanded ? undefined : { maxHeight: `${TRACE_CHILD_MAX_HEIGHT_PX}px` }}
      >
        {children}
      </div>
      {overflowed && !expanded && (
        <button type="button" className="trace-child-expand" onClick={() => setExpanded(true)} aria-label="Expand trace output">
          ...
        </button>
      )}
    </div>
  );
};

