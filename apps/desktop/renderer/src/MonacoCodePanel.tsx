import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent as ReactDragEvent,
  type ReactElement
} from "react";
import * as monaco from "monaco-editor";
import { FaChevronRight, FaCode, FaWindowMaximize, FaWindowMinimize, FaWindowRestore, FaTimes } from "react-icons/fa";
import type { ProjectDirectoryEntry } from "@code-app/shared";
import EditorWorker from "monaco-editor/esm/vs/editor/editor.worker?worker";
import JsonWorker from "monaco-editor/esm/vs/language/json/json.worker?worker";
import CssWorker from "monaco-editor/esm/vs/language/css/css.worker?worker";
import HtmlWorker from "monaco-editor/esm/vs/language/html/html.worker?worker";
import TsWorker from "monaco-editor/esm/vs/language/typescript/ts.worker?worker";

type MonacoCodePanelProps = {
  activeProjectId: string | null;
  activeProjectPath?: string;
  projectName?: string;
  appIconSrc: string;
  isMacOS: boolean;
  isWindows: boolean;
  isWindowMaximized: boolean;
  onMinimizeWindow: () => void | Promise<void>;
  onToggleMaximizeWindow: () => void | Promise<void>;
  onCloseWindow: () => void | Promise<void>;
  appendLog: (line: string) => void;
};

type SplitDirection = "row" | "column";
type DropPosition = "center" | "left" | "right" | "top" | "bottom";

type EditorGroup = {
  id: string;
  tabs: string[];
  activeTab: string | null;
};

type LayoutNode =
  | { kind: "group"; groupId: string }
  | {
      kind: "split";
      id: string;
      direction: SplitDirection;
      first: LayoutNode;
      second: LayoutNode;
      ratio: number;
    };

type WorkbenchState = {
  groups: Record<string, EditorGroup>;
  layout: LayoutNode;
  activeGroupId: string;
  nextGroupId: number;
  nextSplitId: number;
};

type DragState = {
  tabPath: string;
  sourceGroupId: string;
} | null;

const monacoGlobal = globalThis as typeof globalThis & {
  MonacoEnvironment?: { getWorker: (_moduleId: string, label: string) => Worker };
};

if (!monacoGlobal.MonacoEnvironment) {
  monacoGlobal.MonacoEnvironment = {
    getWorker(_moduleId: string, label: string) {
      if (label === "json") return new JsonWorker();
      if (label === "css" || label === "scss" || label === "less") return new CssWorker();
      if (label === "html" || label === "handlebars" || label === "razor") return new HtmlWorker();
      if (label === "typescript" || label === "javascript") return new TsWorker();
      return new EditorWorker();
    }
  };
}

const basename = (path: string) => path.split("/").pop() ?? path;

const languageFromPath = (path: string) => {
  const lower = path.toLowerCase();
  if (lower.endsWith(".ts") || lower.endsWith(".tsx")) return "typescript";
  if (lower.endsWith(".js") || lower.endsWith(".jsx") || lower.endsWith(".mjs") || lower.endsWith(".cjs")) return "javascript";
  if (lower.endsWith(".json")) return "json";
  if (lower.endsWith(".css") || lower.endsWith(".scss") || lower.endsWith(".less")) return "css";
  if (lower.endsWith(".html") || lower.endsWith(".htm")) return "html";
  if (lower.endsWith(".md")) return "markdown";
  if (lower.endsWith(".yml") || lower.endsWith(".yaml")) return "yaml";
  if (lower.endsWith(".xml")) return "xml";
  if (lower.endsWith(".sh")) return "shell";
  return "plaintext";
};

const createInitialWorkbenchState = (): WorkbenchState => {
  const initialGroupId = "group-1";
  return {
    groups: {
      [initialGroupId]: { id: initialGroupId, tabs: [], activeTab: null }
    },
    layout: { kind: "group", groupId: initialGroupId },
    activeGroupId: initialGroupId,
    nextGroupId: 2,
    nextSplitId: 1
  };
};

const insertSplitForTarget = (
  node: LayoutNode,
  targetGroupId: string,
  newGroupId: string,
  splitId: string,
  position: Exclude<DropPosition, "center">
): LayoutNode => {
  if (node.kind === "group") {
    if (node.groupId !== targetGroupId) {
      return node;
    }
    const direction: SplitDirection = position === "left" || position === "right" ? "row" : "column";
    const targetLeaf: LayoutNode = { kind: "group", groupId: targetGroupId };
    const newLeaf: LayoutNode = { kind: "group", groupId: newGroupId };
    const shouldInsertBefore = position === "left" || position === "top";
    return {
      kind: "split",
      id: splitId,
      direction,
      first: shouldInsertBefore ? newLeaf : targetLeaf,
      second: shouldInsertBefore ? targetLeaf : newLeaf,
      ratio: 0.5
    };
  }
  return {
    ...node,
    first: insertSplitForTarget(node.first, targetGroupId, newGroupId, splitId, position),
    second: insertSplitForTarget(node.second, targetGroupId, newGroupId, splitId, position)
  };
};

const removeGroupFromLayout = (node: LayoutNode, groupId: string): LayoutNode | null => {
  if (node.kind === "group") {
    return node.groupId === groupId ? null : node;
  }
  const nextFirst = removeGroupFromLayout(node.first, groupId);
  const nextSecond = removeGroupFromLayout(node.second, groupId);
  if (!nextFirst && !nextSecond) return null;
  if (!nextFirst) return nextSecond;
  if (!nextSecond) return nextFirst;
  return { ...node, first: nextFirst, second: nextSecond };
};

const getFirstGroupId = (node: LayoutNode): string => {
  if (node.kind === "group") {
    return node.groupId;
  }
  return getFirstGroupId(node.first);
};

export const MonacoCodePanel = ({
  activeProjectId,
  activeProjectPath,
  projectName,
  appIconSrc,
  isMacOS,
  isWindows,
  isWindowMaximized,
  onMinimizeWindow,
  onToggleMaximizeWindow,
  onCloseWindow,
  appendLog
}: MonacoCodePanelProps) => {
  const useWindowsStyleHeader = isWindows || !isMacOS;
  const [searchQuery, setSearchQuery] = useState("");
  const [workbench, setWorkbench] = useState<WorkbenchState>(() => createInitialWorkbenchState());
  const [dragState, setDragState] = useState<DragState>(null);
  const [dropPreview, setDropPreview] = useState<{ groupId: string; position: DropPosition } | null>(null);
  const [dirtyByKey, setDirtyByKey] = useState<Record<string, boolean>>({});
  const [loadingByPath, setLoadingByPath] = useState<Record<string, boolean>>({});
  const [savingByPath, setSavingByPath] = useState<Record<string, boolean>>({});

  const modelByKeyRef = useRef(new Map<string, monaco.editor.ITextModel>());
  const savedContentByKeyRef = useRef(new Map<string, string>());
  const loadPromiseByKeyRef = useRef(new Map<string, Promise<monaco.editor.ITextModel>>());
  const hostByGroupRef = useRef(new Map<string, HTMLDivElement>());
  const editorByGroupRef = useRef(new Map<string, monaco.editor.IStandaloneCodeEditor>());
  const workbenchRef = useRef(workbench);
  workbenchRef.current = workbench;

  const [entriesByDirectory, setEntriesByDirectory] = useState<Record<string, ProjectDirectoryEntry[]>>({});
  const [loadingDirectories, setLoadingDirectories] = useState<Record<string, boolean>>({});
  const [loadedDirectories, setLoadedDirectories] = useState<Record<string, boolean>>({});
  const [expandedFolders, setExpandedFolders] = useState<Record<string, boolean>>({});

  const openFileSet = useMemo(() => {
    const openPaths = Object.values(workbench.groups).flatMap((group) => group.tabs);
    return new Set(openPaths);
  }, [workbench.groups]);

  const loadDirectory = useCallback(
    async (relativePath = "") => {
      if (!activeProjectId) {
        return;
      }
      const key = relativePath;
      setLoadingDirectories((prev) => ({ ...prev, [key]: true }));
      try {
        const entries = await window.desktopAPI.projects.listDirectory({ projectId: activeProjectId, relativePath });
        setEntriesByDirectory((prev) => ({ ...prev, [key]: entries }));
        setLoadedDirectories((prev) => ({ ...prev, [key]: true }));
      } catch (error) {
        appendLog(`List directory failed for ${relativePath || "/"}: ${String(error)}`);
      } finally {
        setLoadingDirectories((prev) => {
          const next = { ...prev };
          delete next[key];
          return next;
        });
      }
    },
    [activeProjectId, appendLog]
  );

  const modelKey = useCallback((path: string) => `${activeProjectId ?? "none"}:${path}`, [activeProjectId]);

  const updateDirtyState = useCallback(
    (path: string, content: string) => {
      const key = modelKey(path);
      const saved = savedContentByKeyRef.current.get(key) ?? "";
      setDirtyByKey((prev) => {
        const nextDirty = content !== saved;
        if (Boolean(prev[key]) === nextDirty) {
          return prev;
        }
        return { ...prev, [key]: nextDirty };
      });
    },
    [modelKey]
  );

  const ensureModelLoaded = useCallback(
    async (path: string) => {
      if (!activeProjectId) {
        throw new Error("No active project selected.");
      }
      const key = modelKey(path);
      const existing = modelByKeyRef.current.get(key);
      if (existing) {
        return existing;
      }
      const pending = loadPromiseByKeyRef.current.get(key);
      if (pending) {
        return pending;
      }

      setLoadingByPath((prev) => ({ ...prev, [path]: true }));
      const promise = window.desktopAPI.projects
        .readFile({ projectId: activeProjectId, relativePath: path })
        .then((file) => {
          const uri = monaco.Uri.parse(`codeapp://project/${activeProjectId}/${encodeURIComponent(file.path)}`);
          const model = monaco.editor.createModel(file.content, languageFromPath(file.path), uri);
          savedContentByKeyRef.current.set(key, file.content);
          model.onDidChangeContent(() => {
            updateDirtyState(path, model.getValue());
          });
          modelByKeyRef.current.set(key, model);
          setDirtyByKey((prev) => ({ ...prev, [key]: false }));
          return model;
        })
        .finally(() => {
          loadPromiseByKeyRef.current.delete(key);
          setLoadingByPath((prev) => {
            if (!prev[path]) return prev;
            const next = { ...prev };
            delete next[path];
            return next;
          });
        });

      loadPromiseByKeyRef.current.set(key, promise);
      return promise;
    },
    [activeProjectId, modelKey, updateDirtyState]
  );

  const saveFile = useCallback(
    async (path: string) => {
      if (!activeProjectId) return;
      const key = modelKey(path);
      const model = modelByKeyRef.current.get(key);
      if (!model) return;
      setSavingByPath((prev) => ({ ...prev, [path]: true }));
      try {
        const content = model.getValue();
        await window.desktopAPI.projects.writeFile({ projectId: activeProjectId, relativePath: path, content });
        savedContentByKeyRef.current.set(key, content);
        setDirtyByKey((prev) => ({ ...prev, [key]: false }));
      } catch (error) {
        appendLog(`Save failed for ${path}: ${String(error)}`);
      } finally {
        setSavingByPath((prev) => {
          const next = { ...prev };
          delete next[path];
          return next;
        });
      }
    },
    [activeProjectId, appendLog, modelKey]
  );

  const openPathInGroup = useCallback(
    (path: string, requestedGroupId?: string) => {
      setWorkbench((prev) => {
        const targetGroupId = requestedGroupId ?? prev.activeGroupId;
        const targetGroup = prev.groups[targetGroupId];
        if (!targetGroup) {
          return prev;
        }
        const nextTabs = targetGroup.tabs.includes(path) ? targetGroup.tabs : [...targetGroup.tabs, path];
        return {
          ...prev,
          activeGroupId: targetGroupId,
          groups: {
            ...prev.groups,
            [targetGroupId]: { ...targetGroup, tabs: nextTabs, activeTab: path }
          }
        };
      });
      void ensureModelLoaded(path).catch((error) => appendLog(`Open file failed for ${path}: ${String(error)}`));
    },
    [appendLog, ensureModelLoaded]
  );

  const closeTab = useCallback((groupId: string, path: string) => {
    setWorkbench((prev) => {
      const group = prev.groups[groupId];
      if (!group) {
        return prev;
      }
      const nextTabs = group.tabs.filter((tabPath) => tabPath !== path);
      if (nextTabs.length === 0) {
        if (Object.keys(prev.groups).length <= 1) {
          return {
            ...prev,
            groups: { ...prev.groups, [groupId]: { ...group, tabs: [], activeTab: null } }
          };
        }
        const nextGroups = { ...prev.groups };
        delete nextGroups[groupId];
        const nextLayout = removeGroupFromLayout(prev.layout, groupId);
        if (!nextLayout) {
          return prev;
        }
        const nextActiveGroupId = prev.activeGroupId === groupId ? getFirstGroupId(nextLayout) : prev.activeGroupId;
        return { ...prev, groups: nextGroups, layout: nextLayout, activeGroupId: nextActiveGroupId };
      }
      const activeTab = group.activeTab === path ? nextTabs[nextTabs.length - 1] ?? null : group.activeTab;
      return {
        ...prev,
        groups: { ...prev.groups, [groupId]: { ...group, tabs: nextTabs, activeTab } }
      };
    });
  }, []);

  const handleTabDrop = useCallback(
    (targetGroupId: string, position: DropPosition) => {
      if (!dragState) {
        return;
      }
      setWorkbench((prev) => {
        const sourceGroup = prev.groups[dragState.sourceGroupId];
        const targetGroup = prev.groups[targetGroupId];
        if (!sourceGroup || !targetGroup) {
          return prev;
        }

        const tabPath = dragState.tabPath;
        const sameGroup = dragState.sourceGroupId === targetGroupId;

        if (position === "center") {
          if (sameGroup) {
            return {
              ...prev,
              activeGroupId: targetGroupId,
              groups: {
                ...prev.groups,
                [targetGroupId]: { ...targetGroup, activeTab: tabPath }
              }
            };
          }

          const nextSourceTabs = sourceGroup.tabs.filter((path) => path !== tabPath);
          const nextTargetTabs = targetGroup.tabs.includes(tabPath) ? targetGroup.tabs : [...targetGroup.tabs, tabPath];
          const nextGroups: Record<string, EditorGroup> = {
            ...prev.groups,
            [dragState.sourceGroupId]: {
              ...sourceGroup,
              tabs: nextSourceTabs,
              activeTab:
                sourceGroup.activeTab === tabPath
                  ? nextSourceTabs[0] ?? null
                  : sourceGroup.activeTab && nextSourceTabs.includes(sourceGroup.activeTab)
                    ? sourceGroup.activeTab
                    : nextSourceTabs[0] ?? null
            },
            [targetGroupId]: {
              ...targetGroup,
              tabs: nextTargetTabs,
              activeTab: tabPath
            }
          };

          let nextLayout = prev.layout;
          if (nextSourceTabs.length === 0) {
            delete nextGroups[dragState.sourceGroupId];
            const maybeLayout = removeGroupFromLayout(prev.layout, dragState.sourceGroupId);
            if (!maybeLayout) {
              return prev;
            }
            nextLayout = maybeLayout;
          }
          return {
            ...prev,
            groups: nextGroups,
            layout: nextLayout,
            activeGroupId: targetGroupId
          };
        }

        if (sameGroup && sourceGroup.tabs.length <= 1) {
          return prev;
        }

        const newGroupId = `group-${prev.nextGroupId}`;
        const splitId = `split-${prev.nextSplitId}`;
        const nextGroups: Record<string, EditorGroup> = {
          ...prev.groups,
          [newGroupId]: {
            id: newGroupId,
            tabs: [tabPath],
            activeTab: tabPath
          }
        };

        if (sameGroup) {
          const reducedTabs = sourceGroup.tabs.filter((path) => path !== tabPath);
          nextGroups[sourceGroup.id] = {
            ...sourceGroup,
            tabs: reducedTabs,
            activeTab: sourceGroup.activeTab === tabPath ? reducedTabs[0] ?? null : sourceGroup.activeTab
          };
        } else {
          const nextSourceTabs = sourceGroup.tabs.filter((path) => path !== tabPath);
          if (nextSourceTabs.length === 0) {
            delete nextGroups[sourceGroup.id];
          } else {
            nextGroups[sourceGroup.id] = {
              ...sourceGroup,
              tabs: nextSourceTabs,
              activeTab: sourceGroup.activeTab === tabPath ? nextSourceTabs[0] ?? null : sourceGroup.activeTab
            };
          }
        }

        let nextLayout = insertSplitForTarget(prev.layout, targetGroupId, newGroupId, splitId, position);
        if (!sameGroup && sourceGroup.tabs.length === 1) {
          const maybeLayout = removeGroupFromLayout(nextLayout, sourceGroup.id);
          if (!maybeLayout) {
            return prev;
          }
          nextLayout = maybeLayout;
        }

        return {
          ...prev,
          groups: nextGroups,
          layout: nextLayout,
          activeGroupId: newGroupId,
          nextGroupId: prev.nextGroupId + 1,
          nextSplitId: prev.nextSplitId + 1
        };
      });

      setDropPreview(null);
      setDragState(null);
    },
    [dragState]
  );

  const onEditorDrop = useCallback(
    (event: ReactDragEvent<HTMLElement>, targetGroupId: string, position: DropPosition) => {
      event.preventDefault();
      event.stopPropagation();
      handleTabDrop(targetGroupId, position);
    },
    [handleTabDrop]
  );

  useEffect(() => {
    setSearchQuery("");
    setDragState(null);
    setDropPreview(null);
    setWorkbench(createInitialWorkbenchState());
    setEntriesByDirectory({});
    setExpandedFolders({});
    setLoadedDirectories({});
    setLoadingDirectories({});
    if (activeProjectId) {
      void loadDirectory("");
    }
  }, [activeProjectId, loadDirectory]);

  useEffect(() => {
    const groupIds = Object.keys(workbench.groups);
    groupIds.forEach((groupId) => {
      const host = hostByGroupRef.current.get(groupId);
      if (!host || editorByGroupRef.current.has(groupId)) {
        return;
      }
      const editor = monaco.editor.create(host, {
        automaticLayout: true,
        minimap: { enabled: false },
        fontSize: 13,
        scrollBeyondLastLine: false,
        wordWrap: "on",
        tabSize: 2
      });
      editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
        const current = workbenchRef.current.groups[groupId]?.activeTab;
        if (current) {
          void saveFile(current);
        }
      });
      editorByGroupRef.current.set(groupId, editor);
    });

    Array.from(editorByGroupRef.current.entries()).forEach(([groupId, editor]) => {
      if (!groupIds.includes(groupId)) {
        editor.dispose();
        editorByGroupRef.current.delete(groupId);
      }
    });
  }, [saveFile, workbench.groups]);

  useEffect(() => {
    Object.values(workbench.groups).forEach((group) => {
      const editor = editorByGroupRef.current.get(group.id);
      if (!editor) {
        return;
      }
      if (!group.activeTab || !activeProjectId) {
        editor.setModel(null);
        return;
      }
      void ensureModelLoaded(group.activeTab)
        .then((model) => {
          editor.setModel(model);
          if (group.id === workbench.activeGroupId) {
            editor.focus();
          }
        })
        .catch((error) => appendLog(`Open file failed for ${group.activeTab}: ${String(error)}`));
    });
  }, [activeProjectId, appendLog, ensureModelLoaded, workbench.activeGroupId, workbench.groups]);

  useEffect(() => {
    return () => {
      editorByGroupRef.current.forEach((editor) => editor.dispose());
      editorByGroupRef.current.clear();
      modelByKeyRef.current.forEach((model) => model.dispose());
      modelByKeyRef.current.clear();
      loadPromiseByKeyRef.current.clear();
      savedContentByKeyRef.current.clear();
    };
  }, []);

  const renderGroup = (groupId: string) => {
    const group = workbench.groups[groupId];
    if (!group) {
      return null;
    }

    const activePath = group.activeTab;
    const activeModelKey = activePath ? modelKey(activePath) : null;
    const activeDirty = activeModelKey ? Boolean(dirtyByKey[activeModelKey]) : false;
    const activeLoading = activePath ? Boolean(loadingByPath[activePath]) : false;
    const activeSaving = activePath ? Boolean(savingByPath[activePath]) : false;
    const showDropOverlay = Boolean(dragState);

    return (
      <section
        key={group.id}
        className={`workbench-group ${workbench.activeGroupId === group.id ? "is-active" : ""}`}
        onClick={() => setWorkbench((prev) => ({ ...prev, activeGroupId: group.id }))}
        onDragOver={(event) => {
          if (!dragState) return;
          event.preventDefault();
          setDropPreview({ groupId: group.id, position: "center" });
        }}
        onDrop={(event) => onEditorDrop(event, group.id, "center")}
      >
        <div className="workbench-tabbar">
          {group.tabs.length === 0 ? (
            <div className="workbench-empty-tabs">No open files</div>
          ) : (
            group.tabs.map((tabPath) => {
              const isActive = tabPath === group.activeTab;
              const key = modelKey(tabPath);
              const isDirty = Boolean(dirtyByKey[key]);
              const isLoading = Boolean(loadingByPath[tabPath]);
              const isSaving = Boolean(savingByPath[tabPath]);
              return (
                <div
                  key={`${group.id}-${tabPath}`}
                  draggable
                  className={`workbench-tab ${isActive ? "is-active" : ""}`}
                  onClick={(event) => {
                    event.stopPropagation();
                    setWorkbench((prev) => ({
                      ...prev,
                      activeGroupId: group.id,
                      groups: {
                        ...prev.groups,
                        [group.id]: { ...group, activeTab: tabPath }
                      }
                    }));
                    void ensureModelLoaded(tabPath).catch((error) => appendLog(`Open file failed for ${tabPath}: ${String(error)}`));
                  }}
                  onDragStart={(event) => {
                    event.dataTransfer.effectAllowed = "move";
                    event.dataTransfer.setData("text/plain", tabPath);
                    setDragState({ tabPath, sourceGroupId: group.id });
                  }}
                  onDragEnd={() => {
                    setDropPreview(null);
                    setDragState(null);
                  }}
                >
                  <span className="workbench-tab-label">{basename(tabPath)}</span>
                  {(isLoading || isSaving) && <span className="text-[10px] text-slate-500">{isSaving ? "saving" : "..."}</span>}
                  {!isLoading && !isSaving && isDirty && <span className="text-[10px] text-amber-300">*</span>}
                  <button
                    type="button"
                    className="workbench-tab-close"
                    onClick={(event) => {
                      event.stopPropagation();
                      closeTab(group.id, tabPath);
                    }}
                    aria-label={`Close ${tabPath}`}
                  >
                    x
                  </button>
                </div>
              );
            })
          )}
          {activePath && (
            <button
              type="button"
              className="ml-auto btn-ghost h-6 px-2 py-0 text-[10px]"
              onClick={(event) => {
                event.stopPropagation();
                void saveFile(activePath);
              }}
            >
              Save
            </button>
          )}
        </div>

        <div className="workbench-editor">
          {activePath ? (
            <>
              <div className="workbench-editor-path">
                {activePath}
                {(activeLoading || activeSaving || activeDirty) && (
                  <span className="ml-2 text-[10px] text-slate-500">
                    {activeSaving ? "saving..." : activeLoading ? "loading..." : activeDirty ? "modified" : ""}
                  </span>
                )}
              </div>
              <div
                ref={(node) => {
                  if (node) hostByGroupRef.current.set(group.id, node);
                  else hostByGroupRef.current.delete(group.id);
                }}
                className="min-h-0 flex-1"
              />
            </>
          ) : (
            <div className="workbench-editor-empty">Open a file from the sidebar.</div>
          )}

          {showDropOverlay && (
            <div className="workbench-drop-overlay">
              {(["left", "right", "top", "bottom", "center"] as DropPosition[]).map((position) => (
                <button
                  key={`${group.id}-${position}`}
                  type="button"
                  className={`workbench-drop-zone ${position} ${
                    dropPreview?.groupId === group.id && dropPreview.position === position ? "is-preview" : ""
                  }`}
                  onDragOver={(event) => {
                    event.preventDefault();
                    setDropPreview({ groupId: group.id, position });
                  }}
                  onDrop={(event) => onEditorDrop(event, group.id, position)}
                  aria-label={`Drop tab ${position}`}
                />
              ))}
            </div>
          )}
        </div>
      </section>
    );
  };

  const renderLayout = (node: LayoutNode): ReactElement => {
    if (node.kind === "group") {
      return renderGroup(node.groupId) ?? <section className="workbench-group" />;
    }
    return (
      <div className={`workbench-split ${node.direction}`} key={node.id}>
        <div style={{ flex: node.ratio }}>{renderLayout(node.first)}</div>
        <div style={{ flex: 1 - node.ratio }}>{renderLayout(node.second)}</div>
      </div>
    );
  };

  const hasProject = Boolean(activeProjectId);
  const query = searchQuery.trim().toLowerCase();

  const renderDirectory = useCallback(
    (directoryPath: string, depth: number): ReactElement[] => {
      const entries = entriesByDirectory[directoryPath] ?? [];
      return entries.flatMap((entry) => {
        const matchesQuery =
          !query || entry.name.toLowerCase().includes(query) || entry.path.toLowerCase().includes(query);
        if (entry.kind === "folder") {
          const expanded = Boolean(expandedFolders[entry.path]);
          const shouldExpand = query.length > 0 || expanded;
          const isLoading = Boolean(loadingDirectories[entry.path]);
          const isLoaded = Boolean(loadedDirectories[entry.path]);
          const childRows = shouldExpand ? renderDirectory(entry.path, depth + 1) : [];
          if (!matchesQuery && childRows.length === 0) {
            return [];
          }
          return [
            <div key={`folder-${entry.path}`}>
              <button
                type="button"
                className="workbench-tree-row workbench-tree-folder"
                style={{ paddingLeft: `${depth * 10 + 6}px` }}
                onClick={() => {
                  if (expanded) {
                    setExpandedFolders((prev) => ({ ...prev, [entry.path]: false }));
                    return;
                  }
                  setExpandedFolders((prev) => ({ ...prev, [entry.path]: true }));
                  if (!isLoaded) {
                    void loadDirectory(entry.path);
                  }
                }}
                title={entry.path}
              >
                <FaChevronRight className={`accordion-chevron ${expanded ? "open" : ""} workbench-tree-chevron`} />
                <span className="truncate">{entry.name}</span>
                {isLoading && <span className="ml-auto text-[10px] text-slate-500">...</span>}
              </button>
              <div className={`workbench-tree-children ${shouldExpand ? "open" : ""}`}>
                <div>{childRows}</div>
              </div>
            </div>
          ];
        }
        if (!matchesQuery) {
          return [];
        }
        const isOpen = openFileSet.has(entry.path);
        return [
          <button
            key={`file-${entry.path}`}
            type="button"
            className={`workbench-tree-row workbench-tree-file ${isOpen ? "is-open" : ""}`}
            style={{ paddingLeft: `${depth * 10 + 18}px` }}
            onClick={() => openPathInGroup(entry.path)}
            title={entry.path}
          >
            <span className="workbench-tree-file-icon" aria-hidden="true" />
            <span className="truncate">{entry.name}</span>
          </button>
        ];
      });
    },
    [entriesByDirectory, expandedFolders, loadedDirectories, loadDirectory, loadingDirectories, openFileSet, openPathInGroup, query]
  );

  const fileTreeRows = useMemo(() => renderDirectory("", 0), [renderDirectory]);

  return (
    <section className="flex min-h-0 flex-1 flex-col border-b border-border/80">
      <header
        className={`drag-region window-header flex h-12 shrink-0 items-center justify-between border-b border-border/90 px-3 ${
          isMacOS ? "window-header-macos" : useWindowsStyleHeader ? "window-header-windows" : ""
        }`}
      >
        <div className="flex items-center gap-2 text-sm font-semibold tracking-tight text-slate-100">
          <img src={appIconSrc} alt="GameraCode icon" className="h-8 w-8 rounded-xl object-cover" />
          <span>{projectName?.trim() ? `GameraCode - Code - ${projectName}` : "GameraCode - Code"}</span>
          <span className="header-pill px-2 py-0.5 text-[10px] font-medium">
            <FaCode className="inline-block align-[-1px]" /> Editor
          </span>
        </div>
        <div className="no-drag flex items-center gap-2">
          <span className="truncate text-[11px] text-slate-400">{activeProjectPath ?? "Select a project"}</span>
          {useWindowsStyleHeader ? (
            <div className="window-controls ml-1">
              <button type="button" className="window-control-btn" aria-label="Minimize" onClick={onMinimizeWindow}>
                <FaWindowMinimize />
              </button>
              <button type="button" className="window-control-btn" aria-label="Maximize" onClick={onToggleMaximizeWindow}>
                {isWindowMaximized ? <FaWindowRestore /> : <FaWindowMaximize />}
              </button>
              <button type="button" className="window-control-btn close" aria-label="Close" onClick={onCloseWindow}>
                <FaTimes />
              </button>
            </div>
          ) : null}
        </div>
      </header>
      {!hasProject ? (
        <div className="flex min-h-0 flex-1 items-center justify-center px-4 text-center text-sm text-muted">
          Select a project to browse files.
        </div>
      ) : (
        <div className="editor-workbench m-2 min-h-0 flex-1">
          <aside className="workbench-files">
            <input
              className="input h-8 text-xs"
              placeholder="Filter loaded files"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
            />
            <div className="workbench-file-list">
              {loadingDirectories[""] && fileTreeRows.length === 0 ? (
                <div className="workbench-tree-empty">Loading...</div>
              ) : fileTreeRows.length === 0 ? (
                <div className="workbench-tree-empty">No matching files.</div>
              ) : (
                fileTreeRows
              )}
            </div>
          </aside>
          <main className="workbench-groups">{renderLayout(workbench.layout)}</main>
        </div>
      )}
    </section>
  );
};
