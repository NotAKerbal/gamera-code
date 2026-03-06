import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent as ReactDragEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type ReactElement
} from "react";
import * as monaco from "monaco-editor";
import {
  FaChevronRight,
  FaCode,
  FaFileMedical,
  FaFolderPlus,
  FaWindowMaximize,
  FaWindowMinimize,
  FaWindowRestore,
  FaTimes
} from "react-icons/fa";
import type { AppTheme, ProjectDirectoryEntry } from "@code-app/shared";
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
  appTheme?: AppTheme;
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

type PendingCreateState = {
  parentPath: string;
  kind: "file" | "folder";
  name: string;
} | null;

type RenameState = {
  path: string;
  name: string;
} | null;

type ContextMenuState = {
  x: number;
  y: number;
  path: string;
  kind: "file" | "folder";
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
const dirname = (path: string) => {
  const normalized = path.replace(/\/+$/g, "");
  const index = normalized.lastIndexOf("/");
  return index >= 0 ? normalized.slice(0, index) : "";
};

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
  appTheme,
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
  const contextMenuRef = useRef<HTMLDivElement | null>(null);
  workbenchRef.current = workbench;

  const [entriesByDirectory, setEntriesByDirectory] = useState<Record<string, ProjectDirectoryEntry[]>>({});
  const [loadingDirectories, setLoadingDirectories] = useState<Record<string, boolean>>({});
  const [loadedDirectories, setLoadedDirectories] = useState<Record<string, boolean>>({});
  const [expandedFolders, setExpandedFolders] = useState<Record<string, boolean>>({});
  const [pendingCreate, setPendingCreate] = useState<PendingCreateState>(null);
  const [renameState, setRenameState] = useState<RenameState>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenuState>(null);

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

  const monacoThemeName = useMemo(() => `codeapp-${appTheme ?? "midnight"}`, [appTheme]);

  const cssRgbToHex = useCallback((value: string): string | null => {
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }
    if (trimmed.startsWith("#")) {
      return trimmed;
    }
    const match = trimmed.match(/(\d{1,3})[,\s]+(\d{1,3})[,\s]+(\d{1,3})/);
    if (!match) {
      return null;
    }
    const toHex = (segment: string) => {
      const n = Math.max(0, Math.min(255, Number.parseInt(segment, 10) || 0));
      return n.toString(16).padStart(2, "0");
    };
    return `#${toHex(match[1] ?? "0")}${toHex(match[2] ?? "0")}${toHex(match[3] ?? "0")}`;
  }, []);

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
    setPendingCreate(null);
    setRenameState(null);
    setContextMenu(null);
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
    if (!contextMenu) {
      return;
    }
    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (target && contextMenuRef.current?.contains(target)) {
        return;
      }
      setContextMenu(null);
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setContextMenu(null);
      }
    };
    window.addEventListener("mousedown", handlePointerDown);
    window.addEventListener("keydown", handleEscape);
    return () => {
      window.removeEventListener("mousedown", handlePointerDown);
      window.removeEventListener("keydown", handleEscape);
    };
  }, [contextMenu]);

  useEffect(() => {
    const isLight = (appTheme ?? "midnight") === "dawn" || (appTheme ?? "midnight") === "linen";
    const frame = window.requestAnimationFrame(() => {
      const styles = getComputedStyle(document.documentElement);
      const themeColor = (name: string, fallbackHex: string) => {
        const value = styles.getPropertyValue(name);
        return cssRgbToHex(value) ?? fallbackHex;
      };
      try {
        monaco.editor.defineTheme(monacoThemeName, {
          base: isLight ? "vs" : "vs-dark",
          inherit: true,
          rules: [],
          colors: {
            "editor.background": themeColor("--theme-surface", isLight ? "#f7f8fa" : "#111317"),
            "editor.foreground": themeColor("--theme-accent", isLight ? "#1f2937" : "#e2e8f0"),
            "editorLineNumber.foreground": themeColor("--theme-muted", isLight ? "#6b7280" : "#7c8aa3"),
            "editorLineNumber.activeForeground": themeColor("--theme-accent", isLight ? "#111827" : "#f8fafc"),
            "editorCursor.foreground": themeColor("--theme-accent", isLight ? "#0f172a" : "#f1f5f9"),
            "editor.selectionBackground": themeColor("--theme-panel", isLight ? "#dbe2ea" : "#223042"),
            "editor.inactiveSelectionBackground": themeColor("--theme-panel", isLight ? "#e8edf3" : "#1a2533"),
            "editorGutter.background": themeColor("--theme-surface", isLight ? "#f7f8fa" : "#111317"),
            "editorIndentGuide.background1": themeColor("--theme-border", isLight ? "#c9d2df" : "#2c3442"),
            "editorIndentGuide.activeBackground1": themeColor("--theme-muted", isLight ? "#9aa8bb" : "#5f7088")
          }
        });
        monaco.editor.setTheme(monacoThemeName);
      } catch {
        monaco.editor.setTheme(isLight ? "vs" : "vs-dark");
      }
    });
    return () => window.cancelAnimationFrame(frame);
  }, [appTheme, cssRgbToHex, monacoThemeName]);

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
  }, [monacoThemeName, saveFile, workbench.groups]);

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

  const beginCreate = useCallback((kind: "file" | "folder", parentPath: string) => {
    setContextMenu(null);
    setRenameState(null);
    setPendingCreate({ kind, parentPath, name: "" });
    if (parentPath) {
      setExpandedFolders((prev) => ({ ...prev, [parentPath]: true }));
    }
  }, []);

  const submitPendingCreate = useCallback(async () => {
    if (!activeProjectId || !pendingCreate) {
      return;
    }
    const name = pendingCreate.name.trim();
    if (!name) {
      return;
    }
    if (name.includes("/") || name.includes("\\")) {
      appendLog("Name cannot include slash characters.");
      return;
    }
    const relativePath = pendingCreate.parentPath ? `${pendingCreate.parentPath}/${name}` : name;
    try {
      if (pendingCreate.kind === "folder") {
        await window.desktopAPI.projects.createFolder({ projectId: activeProjectId, relativePath });
      } else {
        await window.desktopAPI.projects.writeFile({ projectId: activeProjectId, relativePath, content: "" });
      }
      await loadDirectory(pendingCreate.parentPath);
      if (pendingCreate.kind === "file") {
        openPathInGroup(relativePath);
      } else {
        setExpandedFolders((prev) => ({ ...prev, [relativePath]: true }));
      }
      setPendingCreate(null);
    } catch (error) {
      appendLog(`Create ${pendingCreate.kind} failed for ${relativePath}: ${String(error)}`);
    }
  }, [activeProjectId, appendLog, loadDirectory, openPathInGroup, pendingCreate]);

  const submitRename = useCallback(async () => {
    if (!activeProjectId || !renameState) {
      return;
    }
    const nextName = renameState.name.trim();
    if (!nextName) {
      return;
    }
    if (nextName.includes("/") || nextName.includes("\\")) {
      appendLog("Name cannot include slash characters.");
      return;
    }
    const parent = dirname(renameState.path);
    const nextPath = parent ? `${parent}/${nextName}` : nextName;
    if (nextPath === renameState.path) {
      setRenameState(null);
      return;
    }
    try {
      await window.desktopAPI.projects.renamePath({
        projectId: activeProjectId,
        fromRelativePath: renameState.path,
        toRelativePath: nextPath
      });
      await loadDirectory(parent);
      setWorkbench((prev) => ({
        ...prev,
        groups: Object.fromEntries(
          Object.entries(prev.groups).map(([groupId, group]) => {
            const nextTabs = group.tabs.map((tab) => (tab === renameState.path ? nextPath : tab));
            const nextActiveTab = group.activeTab === renameState.path ? nextPath : group.activeTab;
            return [groupId, { ...group, tabs: nextTabs, activeTab: nextActiveTab }];
          })
        )
      }));
      setRenameState(null);
    } catch (error) {
      appendLog(`Rename failed for ${renameState.path}: ${String(error)}`);
    }
  }, [activeProjectId, appendLog, loadDirectory, renameState]);

  const handleDeleteFile = useCallback(
    async (path: string) => {
      if (!activeProjectId) {
        return;
      }
      const confirmed = window.confirm(`Delete ${path}?`);
      if (!confirmed) {
        return;
      }
      const parent = dirname(path);
      try {
        await window.desktopAPI.projects.deletePath({ projectId: activeProjectId, relativePath: path });
        await loadDirectory(parent);
        setWorkbench((prev) => ({
          ...prev,
          groups: Object.fromEntries(
            Object.entries(prev.groups).map(([groupId, group]) => {
              const nextTabs = group.tabs.filter((tab) => tab !== path);
              const nextActiveTab =
                group.activeTab === path
                  ? nextTabs[nextTabs.length - 1] ?? null
                  : group.activeTab;
              return [groupId, { ...group, tabs: nextTabs, activeTab: nextActiveTab }];
            })
          )
        }));
      } catch (error) {
        appendLog(`Delete failed for ${path}: ${String(error)}`);
      }
    },
    [activeProjectId, appendLog, loadDirectory]
  );

  const handleInlineInputKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLInputElement>, action: "create" | "rename") => {
      if (event.key === "Enter") {
        event.preventDefault();
        if (action === "create") {
          void submitPendingCreate();
        } else {
          void submitRename();
        }
      } else if (event.key === "Escape") {
        event.preventDefault();
        if (action === "create") {
          setPendingCreate(null);
        } else {
          setRenameState(null);
        }
      }
    },
    [submitPendingCreate, submitRename]
  );

  const renderDirectory = useCallback(
    (directoryPath: string, depth: number): ReactElement[] => {
      const entries = entriesByDirectory[directoryPath] ?? [];
      const rows = entries.flatMap((entry) => {
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
                <span className="truncate">{entry.name}</span>
                <span className="workbench-tree-folder-right">
                  <span className="workbench-tree-folder-actions">
                    <button
                      type="button"
                      className="workbench-tree-action-btn"
                      title="New file"
                      aria-label={`New file in ${entry.name}`}
                      onClick={(event) => {
                        event.stopPropagation();
                        beginCreate("file", entry.path);
                      }}
                    >
                      <FaFileMedical />
                    </button>
                    <button
                      type="button"
                      className="workbench-tree-action-btn"
                      title="New folder"
                      aria-label={`New folder in ${entry.name}`}
                      onClick={(event) => {
                        event.stopPropagation();
                        beginCreate("folder", entry.path);
                      }}
                    >
                      <FaFolderPlus />
                    </button>
                  </span>
                  {isLoading && <span className="text-[10px] text-slate-500">...</span>}
                  <FaChevronRight className={`accordion-chevron ${expanded ? "open" : ""} workbench-tree-chevron`} />
                </span>
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
        if (renameState?.path === entry.path) {
          return [
            <div key={`rename-${entry.path}`} className="workbench-tree-row workbench-tree-file" style={{ paddingLeft: `${depth * 10 + 18}px` }}>
              <span className="workbench-tree-file-icon" aria-hidden="true" />
              <input
                className="input h-7 flex-1 text-xs"
                value={renameState.name}
                autoFocus
                onClick={(event) => event.stopPropagation()}
                onChange={(event) => setRenameState((prev) => (prev ? { ...prev, name: event.target.value } : prev))}
                onBlur={() => {
                  void submitRename();
                }}
                onKeyDown={(event) => handleInlineInputKeyDown(event, "rename")}
              />
            </div>
          ];
        }
        const isOpen = openFileSet.has(entry.path);
        return [
          <button
            key={`file-${entry.path}`}
            type="button"
            className={`workbench-tree-row workbench-tree-file ${isOpen ? "is-open" : ""}`}
            style={{ paddingLeft: `${depth * 10 + 18}px` }}
            onClick={() => openPathInGroup(entry.path)}
            onContextMenu={(event: ReactMouseEvent<HTMLButtonElement>) => {
              event.preventDefault();
              setContextMenu({ x: event.clientX, y: event.clientY, path: entry.path, kind: "file" });
            }}
            title={entry.path}
          >
            <span className="workbench-tree-file-icon" aria-hidden="true" />
            <span className="truncate">{entry.name}</span>
          </button>
        ];
      });
      if (pendingCreate?.parentPath === directoryPath) {
        rows.push(
          <div key={`create-${directoryPath}`} className="workbench-tree-row workbench-tree-file" style={{ paddingLeft: `${depth * 10 + 18}px` }}>
            <span className="workbench-tree-file-icon" aria-hidden="true" />
            <input
              className="input h-7 flex-1 text-xs"
              value={pendingCreate.name}
              autoFocus
              onChange={(event) => setPendingCreate((prev) => (prev ? { ...prev, name: event.target.value } : prev))}
              onBlur={() => {
                setPendingCreate(null);
              }}
              onKeyDown={(event) => handleInlineInputKeyDown(event, "create")}
              placeholder={pendingCreate.kind === "folder" ? "Folder name" : "File name"}
            />
          </div>
        );
      }
      return rows;
    },
    [
      beginCreate,
      entriesByDirectory,
      expandedFolders,
      handleInlineInputKeyDown,
      loadedDirectories,
      loadDirectory,
      loadingDirectories,
      openFileSet,
      openPathInGroup,
      pendingCreate,
      query,
      renameState,
      submitRename
    ]
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
        <div className="editor-workbench min-h-0 flex-1">
          <aside className="workbench-files">
            <div className="workbench-files-toolbar">
              <input
                className="input h-8 flex-1 text-xs"
                placeholder="Filter loaded files"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
              />
              <button
                type="button"
                className="workbench-tree-action-btn"
                title="New file at root"
                aria-label="New file at root"
                onClick={() => beginCreate("file", "")}
              >
                <FaFileMedical />
              </button>
              <button
                type="button"
                className="workbench-tree-action-btn"
                title="New folder at root"
                aria-label="New folder at root"
                onClick={() => beginCreate("folder", "")}
              >
                <FaFolderPlus />
              </button>
            </div>
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
      {contextMenu && (
        <div
          ref={contextMenuRef}
          className="thread-context-menu is-open"
          style={{ left: contextMenu.x, top: contextMenu.y, display: "block", position: "fixed", zIndex: 90 }}
          onClick={(event) => event.stopPropagation()}
        >
          {contextMenu.kind === "file" && (
            <>
              <button
                className="thread-context-menu-item"
                onClick={() => {
                  setRenameState({ path: contextMenu.path, name: basename(contextMenu.path) });
                  setContextMenu(null);
                }}
              >
                Rename File
              </button>
              <button
                className="thread-context-menu-item text-rose-200 hover:text-rose-100"
                onClick={() => {
                  const targetPath = contextMenu.path;
                  setContextMenu(null);
                  void handleDeleteFile(targetPath);
                }}
              >
                Delete File
              </button>
            </>
          )}
        </div>
      )}
    </section>
  );
};
