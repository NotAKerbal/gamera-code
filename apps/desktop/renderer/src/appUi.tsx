import { memo, useEffect, useMemo, useRef, useState, type Dispatch, type ReactNode, type SetStateAction } from "react";
import ReactMarkdown from "react-markdown";
import { FaChevronDown, FaGlobeAmericas } from "react-icons/fa";
import type { PromptAttachment } from "@code-app/shared";
import {
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
  type TimelineItem,
} from "./appCore";


const AssistantMarkdown = ({ content }: { content: string }) => {
  const cleaned = sanitizeForDisplay(content);
  if (!cleaned) {
    return null;
  }

  return (
    <div className="assistant-md text-white">
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
  expandedActivityGroups: Record<string, boolean>;
  setExpandedActivityGroups: Dispatch<SetStateAction<Record<string, boolean>>>;
  setExpandedActivityChildren: Dispatch<SetStateAction<Record<string, boolean>>>;
}

const TimelineItemsList = ({
  timelineItems,
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
              <MemoizedAssistantMarkdown content={item.message.content} />
            </article>
          ) : (
            <article key={item.id} className="timeline-item min-w-0 overflow-hidden rounded-lg bg-zinc-900/80 p-3">
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
          return (
            <article key={item.id} className="timeline-item min-w-0 overflow-hidden rounded-lg border border-border/70 bg-zinc-900/60 p-3">
              <div className="mb-2 text-xs uppercase tracking-[0.12em] text-slate-400">Plan</div>
              <div className="space-y-1">
                {item.entry.todos?.map((todo, index) => (
                  <div key={`${item.id}-todo-${index}`} className="flex items-start gap-2 text-sm text-slate-200">
                    <span className="mt-0.5 text-xs">{todo.completed ? "[x]" : "[ ]"}</span>
                    <span className={todo.completed ? "line-through text-slate-500" : ""}>{todo.text}</span>
                  </div>
                ))}
              </div>
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

