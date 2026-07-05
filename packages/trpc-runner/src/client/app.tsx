import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createParser, parseAsArrayOf, useQueryStates } from "nuqs";
import { useLocalStorage } from "@/lib/hooks";
import { TreeNodeView } from "./components/tree-node-view";
import { ProcedurePanel } from "./components/procedure-panel";
import { ProcedureTabs } from "./components/procedure-tabs";
import { HeadersDialog } from "./components/headers-dialog";
import { ResultPane, type ResponseState } from "./components/result-pane";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "./components/ui/empty";
import { ScrollArea } from "./components/ui/scroll-area";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "./components/ui/resizable";
import type { GroupImperativeHandle, PanelImperativeHandle } from "react-resizable-panels";
import type { RunnerProcedure, RunnerTheme } from "../types";
import { SidebarHeader } from "@/components/sidebar-header";
import { cn } from "@/lib/utils";

const OUTER_LAYOUT_ID = "trpc-runner.layout";
const DETAIL_LAYOUT_ID = "trpc-runner.detail-layout";
const OUTER_LAYOUT_DEFAULT = {
  "procedure-tree": 20,
  "procedure-detail": 80,
};
const DETAIL_LAYOUT_DEFAULT = {
  "procedure-input": 50,
  "procedure-result": 50,
};
const SIDEBAR_DEFAULT_SIZE = "20%";
const SIDEBAR_COLLAPSED_SIZE = "2.25rem";
const SIDEBAR_EXPANDED_MIN_SIZE = "16%";

const boot = window.__TRPC_RUNNER_DATA__;
const validProcedurePaths = new Set(
  boot.manifest.procedures.map((procedure) => procedure.pathLabel),
);
const procedurePathParser = createParser({
  parse: (path: string) => (validProcedurePaths.has(path) ? path : null),
  serialize: String,
});
const procedureTabsParsers = {
  activeTab: procedurePathParser.withDefault(""),
  openedTabs: parseAsArrayOf(procedurePathParser).withDefault([]),
};
const visibleSet = new Set(boot.manifest.procedures.map((procedure) => procedure.pathLabel));
type ProcedureTabsState = {
  activeTab: string;
  openedTabs: string[];
};

export function App() {
  const treePanelRef = useRef<PanelImperativeHandle | null>(null);
  const outerLayoutRef = useRef<GroupImperativeHandle | null>(null);
  const detailLayoutRef = useRef<GroupImperativeHandle | null>(null);
  const sidebarAnimationTimeoutRef = useRef<number | null>(null);
  const [theme, setTheme] = useLocalStorage<RunnerTheme>(
    "trpc-runner.theme",
    boot.options.defaultTheme ?? "light",
  );
  const [headers, setHeaders] = useLocalStorage<Record<string, string>>("trpc-runner.headers", {});
  const [inputHistory, setInputHistory] = useLocalStorage<Record<string, unknown[]>>(
    "trpc-runner.history",
    {},
  );
  const [procedureTabs, setProcedureTabs] = useQueryStates(procedureTabsParsers, {
    urlKeys: {
      activeTab: "tab",
      openedTabs: "tabs",
    },
  });
  const [headersOpen, setHeadersOpen] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);
  const [treeCollapsed, setTreeCollapsed] = useState(false);
  const [sidebarAnimating, setSidebarAnimating] = useState(false);
  const [responses, setResponses] = useState<Record<string, ResponseState>>({});
  const [clearedProcedureTabs, setClearedProcedureTabs] = useState<ProcedureTabsState | null>(null);

  const openPaths = useMemo(
    () => procedureTabs.openedTabs.filter((path, index, paths) => paths.indexOf(path) === index),
    [procedureTabs.openedTabs],
  );
  const selectedPath = openPaths.includes(procedureTabs.activeTab)
    ? procedureTabs.activeTab
    : (openPaths[0] ?? "");
  const openProcedures = openPaths
    .map((path) => boot.manifest.procedures.find((procedure) => procedure.pathLabel === path))
    .filter((procedure): procedure is RunnerProcedure => Boolean(procedure));

  useEffect(() => {
    if (
      procedureTabs.activeTab !== selectedPath ||
      procedureTabs.openedTabs.length !== openPaths.length
    ) {
      void setProcedureTabs({
        activeTab: selectedPath,
        openedTabs: openPaths,
      });
    }
  }, [
    openPaths,
    procedureTabs.activeTab,
    procedureTabs.openedTabs.length,
    selectedPath,
    setProcedureTabs,
  ]);

  const setSidebarCollapsed = useCallback((collapsed: boolean) => {
    setSidebarAnimating(true);
    setTreeCollapsed(collapsed);

    if (sidebarAnimationTimeoutRef.current) {
      window.clearTimeout(sidebarAnimationTimeoutRef.current);
    }

    window.requestAnimationFrame(() => {
      if (collapsed) {
        treePanelRef.current?.collapse();
      } else {
        treePanelRef.current?.expand();
      }

      sidebarAnimationTimeoutRef.current = window.setTimeout(() => {
        setSidebarAnimating(false);
        sidebarAnimationTimeoutRef.current = null;
      }, 220);
    });
  }, []);

  useEffect(() => {
    const animationFrame = window.requestAnimationFrame(() => {
      if (treePanelRef.current?.isCollapsed()) {
        treePanelRef.current.resize(SIDEBAR_DEFAULT_SIZE);
      }

      setTreeCollapsed(false);
    });

    return () => window.cancelAnimationFrame(animationFrame);
  }, []);

  useEffect(() => {
    return () => {
      if (sidebarAnimationTimeoutRef.current) {
        window.clearTimeout(sidebarAnimationTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (!(event.metaKey || event.ctrlKey) || event.altKey || event.shiftKey) return;

      const key = event.key.toLowerCase();

      if (key === "k") {
        event.preventDefault();
        setCommandOpen(true);
        return;
      }

      if (key === "b" && !event.repeat) {
        event.preventDefault();
        setSidebarCollapsed(!treeCollapsed);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [setSidebarCollapsed, treeCollapsed]);

  function openProcedure(path: string) {
    if (!validProcedurePaths.has(path)) return;
    setClearedProcedureTabs(null);
    void setProcedureTabs({
      activeTab: path,
      openedTabs: openPaths.includes(path) ? openPaths : [...openPaths, path],
    });
  }

  function closeProcedure(path: string) {
    setClearedProcedureTabs(null);
    const closingIndex = openPaths.indexOf(path);
    const nextPaths = openPaths.filter((openPath) => openPath !== path);

    void setProcedureTabs({
      activeTab:
        selectedPath === path
          ? (nextPaths[closingIndex] ?? nextPaths[closingIndex - 1] ?? "")
          : selectedPath,
      openedTabs: nextPaths,
    });
    setResponses((currentResponses) => {
      const nextResponses = { ...currentResponses };
      delete nextResponses[path];
      return nextResponses;
    });
  }

  function reorderProcedures(nextPaths: string[]) {
    if (
      nextPaths.length !== openPaths.length ||
      nextPaths.some((path) => !openPaths.includes(path))
    ) {
      return;
    }

    setClearedProcedureTabs(null);
    void setProcedureTabs({
      activeTab: selectedPath,
      openedTabs: nextPaths,
    });
  }

  function clearProcedureQueryParams() {
    if (openPaths.length === 0 && selectedPath === "") return;

    setClearedProcedureTabs({
      activeTab: selectedPath,
      openedTabs: openPaths,
    });
    void setProcedureTabs({
      activeTab: null,
      openedTabs: null,
    });
  }

  function undoClearProcedureQueryParams() {
    if (!clearedProcedureTabs) return;

    void setProcedureTabs(clearedProcedureTabs);
    setClearedProcedureTabs(null);
  }

  function addInputHistoryItem(path: string, item: unknown) {
    setInputHistory((currentHistory) => ({
      ...currentHistory,
      [path]: [item, ...(currentHistory[path] ?? [])].slice(0, 8),
    }));
  }

  function clearInputHistory(path: string) {
    setInputHistory((currentHistory) => {
      if (!currentHistory[path]?.length) return currentHistory;

      const nextHistory = { ...currentHistory };
      delete nextHistory[path];
      return nextHistory;
    });
  }

  function resetPanelLayout() {
    if (sidebarAnimationTimeoutRef.current) {
      window.clearTimeout(sidebarAnimationTimeoutRef.current);
      sidebarAnimationTimeoutRef.current = null;
    }

    setSidebarAnimating(false);
    setTreeCollapsed(false);
    outerLayoutRef.current?.setLayout(OUTER_LAYOUT_DEFAULT);
    detailLayoutRef.current?.setLayout(DETAIL_LAYOUT_DEFAULT);
    localStorage.removeItem(`react-resizable-panels:${OUTER_LAYOUT_ID}`);
    localStorage.removeItem(`react-resizable-panels:${DETAIL_LAYOUT_ID}`);
  }

  const showProcedureTabs = openProcedures.length > 0 || clearedProcedureTabs !== null;

  return (
    <div className="trpc-runner" data-theme={theme}>
      <ResizablePanelGroup
        autoSaveId={OUTER_LAYOUT_ID}
        groupRef={outerLayoutRef}
        direction="horizontal"
        className="flex-1 min-h-0"
      >
        <ResizablePanel
          id="procedure-tree"
          data-runner-layout-panel={sidebarAnimating ? "animated" : undefined}
          defaultSize={SIDEBAR_DEFAULT_SIZE}
          minSize={SIDEBAR_EXPANDED_MIN_SIZE}
          collapsible
          collapsedSize={SIDEBAR_COLLAPSED_SIZE}
          panelRef={treePanelRef}
          style={sidebarAnimating || treeCollapsed ? { overflow: "hidden" } : undefined}
          onResize={() => {
            setTreeCollapsed(treePanelRef.current?.isCollapsed() ?? false);
          }}
        >
          <section className="flex h-full min-w-0 flex-col">
            <SidebarHeader
              collapsed={treeCollapsed}
              visibleProcedures={boot.manifest.procedures}
              openPaths={openPaths}
              selectedPath={selectedPath}
              theme={theme}
              commandOpen={commandOpen}
              onSelect={openProcedure}
              onCollapsedChange={setSidebarCollapsed}
              onCommandOpenChange={setCommandOpen}
              onThemeChange={setTheme}
              onHeadersOpen={() => setHeadersOpen(true)}
              onLayoutReset={resetPanelLayout}
            />
            {!treeCollapsed && (
              <ScrollArea className="flex-1">
                <TreeNodeView
                  node={boot.manifest.tree}
                  visibleSet={visibleSet}
                  selectedPath={selectedPath}
                  onSelect={openProcedure}
                  root
                />
              </ScrollArea>
            )}
          </section>
        </ResizablePanel>
        <ResizableHandle withHandle />
        <ResizablePanel
          id="procedure-detail"
          data-runner-layout-panel={sidebarAnimating ? "animated" : undefined}
          defaultSize="80%"
          minSize="48%"
        >
          <div className="flex h-full min-w-0 flex-col">
            {showProcedureTabs && (
              <ProcedureTabs
                procedures={openProcedures}
                selectedPath={selectedPath}
                onSelect={(path) => void setProcedureTabs({ activeTab: path })}
                onClose={closeProcedure}
                onReorder={reorderProcedures}
                onClearAll={clearProcedureQueryParams}
                onUndoClear={undoClearProcedureQueryParams}
                canClearAll={openPaths.length > 0}
                canUndoClear={clearedProcedureTabs !== null}
              />
            )}
            {openProcedures.length > 0 ? (
              <>
                <ResizablePanelGroup
                  autoSaveId={DETAIL_LAYOUT_ID}
                  groupRef={detailLayoutRef}
                  direction="horizontal"
                  className="flex-1 min-h-0"
                >
                  <ResizablePanel id="procedure-input" defaultSize="50%" minSize="25%">
                    <div className="relative h-full min-h-0">
                      {openProcedures.map((procedure) => (
                        <div
                          key={procedure.pathLabel}
                          className={cn(
                            "absolute inset-0 min-h-0",
                            selectedPath === procedure.pathLabel ? "block" : "hidden",
                          )}
                        >
                          <ProcedurePanel
                            procedure={procedure}
                            headers={headers}
                            theme={theme}
                            response={
                              responses[procedure.pathLabel] ?? {
                                state: "idle",
                              }
                            }
                            history={inputHistory[procedure.pathLabel] ?? []}
                            onHistoryAdd={(item) => addInputHistoryItem(procedure.pathLabel, item)}
                            onHistoryClear={() => clearInputHistory(procedure.pathLabel)}
                            onResponse={(response) => {
                              setResponses((currentResponses) => ({
                                ...currentResponses,
                                [procedure.pathLabel]: response,
                              }));
                            }}
                          />
                        </div>
                      ))}
                    </div>
                  </ResizablePanel>
                  <ResizableHandle withHandle />
                  <ResizablePanel id="procedure-result" defaultSize="50%" minSize="25%">
                    <ResultPane
                      response={responses[selectedPath] ?? { state: "idle" }}
                      theme={theme}
                    />
                  </ResizablePanel>
                </ResizablePanelGroup>
              </>
            ) : (
              <Empty className="h-full">
                <EmptyHeader>
                  <EmptyTitle>No procedure tabs open</EmptyTitle>
                  <EmptyDescription>Choose a procedure from the left pane</EmptyDescription>
                </EmptyHeader>
              </Empty>
            )}
          </div>
        </ResizablePanel>
      </ResizablePanelGroup>

      {headersOpen && (
        <HeadersDialog
          headers={headers}
          onChange={setHeaders}
          onClose={() => setHeadersOpen(false)}
        />
      )}
    </div>
  );
}
