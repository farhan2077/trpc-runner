import { Delete02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@/components/ui/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { stringifyJson } from "@/lib/helpers";

function compactJson(value: unknown) {
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
}

function summarizeInput(value: unknown) {
  if (Array.isArray(value)) return `${value.length} item input`;
  if (value && typeof value === "object") {
    const keys = Object.keys(value);
    return `${keys.length} ${keys.length === 1 ? "field" : "fields"}`;
  }
  if (value === null) return "null input";
  return `${typeof value} input`;
}

export function HistoryPanel({
  items,
  onSelect,
  onClear,
}: {
  items: unknown[];
  onSelect: (item: unknown) => void;
  onClear: () => void;
}) {
  if (!items.length)
    return (
      <Empty className="h-full">
        <EmptyHeader>
          <EmptyTitle>No history yet</EmptyTitle>
          <EmptyDescription>Successful runs will appear here.</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  return (
    <div className="grid gap-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          {items.length} saved {items.length === 1 ? "input" : "inputs"}
        </p>
        <Button
          type="button"
          variant="destructive"
          size="xs"
          onClick={onClear}
          aria-label="Clear input history"
          title="Clear input history"
        >
          <HugeiconsIcon icon={Delete02Icon} size={13} />
          Clear
        </Button>
      </div>
      <div className="grid gap-1.5">
        {items.map((item, index) => {
          const preview = compactJson(item);

          return (
            <button
              key={index}
              type="button"
              onClick={() => onSelect(item)}
              aria-label={`Use history item ${index + 1}`}
              className="group grid w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-lg border border-border bg-background px-2.5 py-2 text-left transition-colors outline-none hover:bg-muted/60 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              <span className="flex size-6 items-center justify-center rounded-md bg-muted font-mono text-[11px] text-muted-foreground">
                {index + 1}
              </span>
              <span className="min-w-0">
                <span className="mb-1 flex items-center gap-2">
                  <span className="text-xs font-medium text-foreground">
                    {index === 0 ? "Latest" : `Run ${index + 1}`}
                  </span>
                  <span className="text-xs text-muted-foreground">{summarizeInput(item)}</span>
                </span>
                <code
                  className="block truncate font-mono text-xs text-foreground/80"
                  title={stringifyJson(item)}
                >
                  {preview}
                </code>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
