import { useState } from "react";
import type { RunnerTreeNode } from "../../types";
import { Button } from "@/components/ui/button";
import { ChevronRightIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { ProcedureBadge } from "@/components/procedure-badge";
import { cn } from "@/lib/utils";

function hasVisible(node: RunnerTreeNode, visibleSet: Set<string>): boolean {
  return (
    node.procedures.some((p) => visibleSet.has(p.pathLabel)) ||
    node.children.some((child) => hasVisible(child, visibleSet))
  );
}

export function TreeNodeView({
  node,
  visibleSet,
  selectedPath,
  onSelect,
  root,
}: {
  node: RunnerTreeNode;
  visibleSet: Set<string>;
  selectedPath: string;
  onSelect: (path: string) => void;
  root?: boolean;
}) {
  const [open, setOpen] = useState(true);
  const visibleProcedures = node.procedures.filter((p) => visibleSet.has(p.pathLabel));
  const visibleChildren = node.children.filter((child) => hasVisible(child, visibleSet));
  if (!root && visibleProcedures.length === 0 && visibleChildren.length === 0) return null;

  return (
    <div className="my-1 mx-0.5">
      {!root && (
        <Button
          variant="ghost"
          onClick={() => setOpen(!open)}
          className="w-full justify-start h-6 px-1 gap-1 font-normal"
        >
          <HugeiconsIcon
            icon={ChevronRightIcon}
            size={32}
            className={`transition-transform ${open ? "rotate-90" : ""}`}
          />
          {node.name}
        </Button>
      )}
      {open || root ? (
        <div className={root ? "" : "ml-3 border-l pl-2"}>
          {visibleChildren.map((child) => (
            <TreeNodeView
              key={child.path.join(".")}
              node={child}
              visibleSet={visibleSet}
              selectedPath={selectedPath}
              onSelect={onSelect}
            />
          ))}
          {visibleProcedures.map((procedure) => {
            const selected = selectedPath === procedure.pathLabel;

            return (
              <Button
                key={procedure.pathLabel}
                variant="ghost"
                size="sm"
                onClick={() => onSelect(procedure.pathLabel)}
                className={cn(
                  "w-full justify-start h-6 px-1 gap-1 font-normal",
                  selected
                    ? "bg-secondary text-secondary-foreground hover:bg-[color-mix(in_oklch,hsl(var(--secondary)),hsl(var(--foreground))_7%)]"
                    : "hover:bg-muted/70 dark:hover:bg-muted/60",
                )}
              >
                <ProcedureBadge kind={procedure.kind} compact />
                <span className="truncate">{procedure.name}</span>
              </Button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
