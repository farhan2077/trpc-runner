import {
  useEffect,
  useRef,
  useState,
  type MouseEvent,
  type PointerEvent,
} from "react";
import { Cancel01Icon, Undo03Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { RunnerProcedure } from "../../types";
import { cn } from "@/lib/utils";
import { ProcedureBadge } from "./procedure-badge";
import { Button } from "./ui/button";

type DragState = {
  path: string;
  fromIndex: number;
  pointerId: number;
  startX: number;
  dropIndex: number;
  dropX: number;
  dragging: boolean;
};

function reorderPaths(paths: string[], fromIndex: number, dropIndex: number) {
  const nextPaths = [...paths];
  const [movedPath] = nextPaths.splice(fromIndex, 1);

  if (!movedPath) return paths;

  nextPaths.splice(
    dropIndex > fromIndex ? dropIndex - 1 : dropIndex,
    0,
    movedPath,
  );
  return nextPaths;
}

export function ProcedureTabs({
  procedures,
  selectedPath,
  onSelect,
  onClose,
  onReorder,
  onClearAll,
  onUndoClear,
  canClearAll,
  canUndoClear,
}: {
  procedures: RunnerProcedure[];
  selectedPath: string;
  onSelect: (path: string) => void;
  onClose: (path: string) => void;
  onReorder: (paths: string[]) => void;
  onClearAll: () => void;
  onUndoClear: () => void;
  canClearAll: boolean;
  canUndoClear: boolean;
}) {
  const tabListRef = useRef<HTMLDivElement | null>(null);
  const tabRefs = useRef(new Map<string, HTMLDivElement>());
  const suppressNextClickRef = useRef(false);
  const [dragState, setDragState] = useState<DragState | null>(null);
  const paths = procedures.map((procedure) => procedure.pathLabel);
  const dragging = dragState?.dragging ?? false;

  useEffect(() => {
    if (!dragging) return;

    const previousCursor = document.body.style.cursor;
    const previousUserSelect = document.body.style.userSelect;

    document.body.style.cursor = "grabbing";
    document.body.style.userSelect = "none";

    function cancelDrag(event: KeyboardEvent) {
      if (event.key !== "Escape") return;

      event.preventDefault();
      suppressNextClickRef.current = true;
      setDragState(null);
    }

    window.addEventListener("keydown", cancelDrag, true);

    return () => {
      document.body.style.cursor = previousCursor;
      document.body.style.userSelect = previousUserSelect;
      window.removeEventListener("keydown", cancelDrag, true);
    };
  }, [dragging]);

  function getDropPosition(clientX: number) {
    const tabListRect = tabListRef.current?.getBoundingClientRect();
    let dropIndex = procedures.length;
    let boundaryX = tabListRect ? tabListRect.width : 0;

    for (let index = 0; index < procedures.length; index += 1) {
      const tab = tabRefs.current.get(procedures[index].pathLabel);
      if (!tab) continue;

      const rect = tab.getBoundingClientRect();
      if (clientX < rect.left + rect.width / 2) {
        dropIndex = index;
        boundaryX = tabListRect ? rect.left - tabListRect.left : 0;
        break;
      }

      boundaryX = tabListRect ? rect.right - tabListRect.left : rect.width;
    }

    return {
      dropIndex,
      dropX: Math.max(0, Math.round(boundaryX) - (dropIndex > 0 ? 1 : 0)),
    };
  }

  function startDrag(
    event: PointerEvent<HTMLDivElement>,
    procedure: RunnerProcedure,
    index: number,
  ) {
    if (event.button !== 0) return;
    if ((event.target as HTMLElement).closest("[data-tab-action]")) return;

    const { dropX } = getDropPosition(event.clientX);

    event.currentTarget.setPointerCapture(event.pointerId);
    setDragState({
      path: procedure.pathLabel,
      fromIndex: index,
      pointerId: event.pointerId,
      startX: event.clientX,
      dropIndex: index,
      dropX,
      dragging: false,
    });
  }

  function updateDrag(event: PointerEvent<HTMLDivElement>) {
    if (!dragState || dragState.pointerId !== event.pointerId) return;

    const shouldDrag =
      dragState.dragging || Math.abs(event.clientX - dragState.startX) > 4;

    if (!shouldDrag) return;

    event.preventDefault();
    const dropPosition = getDropPosition(event.clientX);

    setDragState({
      ...dragState,
      dragging: true,
      ...dropPosition,
    });
  }

  function finishDrag(event: PointerEvent<HTMLDivElement>) {
    if (!dragState || dragState.pointerId !== event.pointerId) return;

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    if (dragState.dragging) {
      const nextPaths = reorderPaths(
        paths,
        dragState.fromIndex,
        dragState.dropIndex,
      );

      suppressNextClickRef.current = true;
      if (nextPaths.join("\0") !== paths.join("\0")) {
        onReorder(nextPaths);
      }
    }

    setDragState(null);
  }

  function cancelPointerDrag(event: PointerEvent<HTMLDivElement>) {
    if (!dragState || dragState.pointerId !== event.pointerId) return;

    suppressNextClickRef.current = dragState.dragging;
    setDragState(null);
  }

  function selectTab(event: MouseEvent<HTMLDivElement>, path: string) {
    if ((event.target as HTMLElement).closest("[data-tab-action]")) return;

    if (suppressNextClickRef.current) {
      suppressNextClickRef.current = false;
      event.preventDefault();
      return;
    }

    onSelect(path);
  }

  return (
    <div
      ref={tabListRef}
      role="tablist"
      aria-label="Open procedures"
      className={cn(
        "relative flex h-10 shrink-0 overflow-x-auto border-b bg-muted/40",
        dragging && "cursor-grabbing select-none **:cursor-grabbing",
      )}
    >
      {dragging && dragState && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 z-20 w-[1.5px] bg-foreground"
          style={{ left: dragState.dropX }}
        />
      )}
      {procedures.map((procedure, index) => {
        const active = selectedPath === procedure.pathLabel;
        const dragged = dragState?.path === procedure.pathLabel;

        return (
          <div
            key={procedure.pathLabel}
            ref={(tab) => {
              if (tab) {
                tabRefs.current.set(procedure.pathLabel, tab);
              } else {
                tabRefs.current.delete(procedure.pathLabel);
              }
            }}
            role="tab"
            aria-selected={active}
            onPointerDown={(event) => startDrag(event, procedure, index)}
            onPointerMove={updateDrag}
            onPointerUp={finishDrag}
            onPointerCancel={cancelPointerDrag}
            onClick={(event) => selectTab(event, procedure.pathLabel)}
            className={cn(
              "group relative flex h-full min-w-fit cursor-pointer touch-none items-center gap-1 border-r border-border px-2 text-xs",
              active
                ? "bg-background text-foreground"
                : "text-muted-foreground opacity-90 hover:bg-muted hover:text-foreground hover:opacity-100",
              !dragging && "**:cursor-pointer",
              dragged && dragging && "cursor-grabbing opacity-60",
            )}
          >
            <button
              type="button"
              className={cn(
                "flex min-w-0 flex-1 items-center gap-1.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring rounded",
                dragging ? "cursor-grabbing" : "cursor-pointer",
              )}
              title={procedure.pathLabel}
            >
              <ProcedureBadge kind={procedure.kind} compact />
              <span
                className={cn(
                  "truncate",
                  dragging ? "cursor-grabbing" : "cursor-pointer",
                )}
              >
                {procedure.pathLabel}
              </span>
            </button>
            <Button
              data-tab-action="close"
              variant="ghost"
              size="icon-xs"
              onClick={(event) => {
                event.stopPropagation();
                onClose(procedure.pathLabel);
              }}
              aria-label={`Close ${procedure.pathLabel}`}
              title="Close"
              className={cn(
                "h-5 w-5 opacity-0 group-hover:opacity-100",
                active ? "" : "hover:bg-white",
              )}
            >
              <HugeiconsIcon icon={Cancel01Icon} size={12} />
            </Button>
          </div>
        );
      })}
      <div className="ml-auto flex h-full shrink-0 items-center gap-1 px-1">
        {canUndoClear ? (
          <Button
            variant="ghost"
            size="xs"
            onClick={onUndoClear}
            aria-label="Undo Close all tabs"
            title="Undo Close all tabs"
          >
            <HugeiconsIcon icon={Undo03Icon} size={13} />
            Undo
          </Button>
        ) : (
          <Button
            variant="ghost"
            size="xs"
            onClick={onClearAll}
            disabled={!canClearAll}
            aria-label="Close all tabs"
            title="Close all tabs"
          >
            <HugeiconsIcon icon={Cancel01Icon} size={13} />
            Close All
          </Button>
        )}
      </div>
    </div>
  );
}
