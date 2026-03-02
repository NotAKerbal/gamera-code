import { memo, useEffect, useMemo, useRef, useState, type Dispatch, type ReactNode, type SetStateAction } from "react";
import ReactMarkdown from "react-markdown";
import { FaChevronDown, FaCodeBranch, FaGlobeAmericas } from "react-icons/fa";
import type { MessageEvent, PromptAttachment } from "@code-app/shared";
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
            <img
              key={`${attachment.name}-${index}`}
              src={attachment.dataUrl}
              alt={attachment.name}
              className="h-24 w-auto max-w-[220px] rounded-md border border-border/70 object-cover"
            />
          ))}
        </div>
      ) : null}
    </div>
  );
};

export const MemoizedUserMessageContent = memo(UserMessageContent);

interface TimelineItemsListProps {
  timelineItems: TimelineItem[];
  plansById: Record<string, PlanArtifact>;
  getTodoPlanByActivityId: (activityId: string) => PlanArtifact | undefined;
  onViewPlan: (planId: string) => void;
  onBuildPlan: (planId: string) => void;
  onCopyPlan: (planId: string) => void;
  onForkFromUserMessage?: (message: MessageEvent) => void;
  expandedActivityGroups: Record<string, boolean>;
  setExpandedActivityGroups: Dispatch<SetStateAction<Record<string, boolean>>>;
  setExpandedActivityChildren: Dispatch<SetStateAction<Record<string, boolean>>>;
}

const TimelineItemsList = ({
  timelineItems,
  plansById,
  getTodoPlanByActivityId,
  onViewPlan,
  onBuildPlan,
  onCopyPlan,
  onForkFromUserMessage,
  expandedActivityGroups,
  setExpandedActivityGroups,
  setExpandedActivityChildren
}: TimelineItemsListProps) => {
  return (
    <>
      {timelineItems.map((item) => {
        if (item.kind === "message") {
          return item.message.role === "assistant" ? (
            <article key={item.id} className="timeline-item min-w-0 overflow-hidden">
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
          const childIds = item.childIds;
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
                    if (nextOpen) {
                      setExpandedActivityChildren((prev) => {
                        const next = { ...prev };
                        childIds.forEach((id) => {
                          next[id] = true;
                        });
                        return next;
                      });
                    }
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
                  <FaChevronDown className={`accordion-chevron ${groupOpen ? "open" : ""}`} />
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
                              <code className="activity-command-code">{run.command}</code>
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
          const childIds = item.childIds;
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
                    if (nextOpen) {
                      setExpandedActivityChildren((prev) => {
                        const next = { ...prev };
                        childIds.forEach((id) => {
                          next[id] = true;
                        });
                        return next;
                      });
                    }
                  }}
                >
                  {buildFileGroupLabel(item.files)}
                  <span className={`status-pill ${item.status}`}>{item.status.replace("_", " ")}</span>
                  <FaChevronDown className={`accordion-chevron ${groupOpen ? "open" : ""}`} />
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

