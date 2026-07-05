import { useEffect, useRef, useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { Copy01Icon, Tick02Icon } from "@hugeicons/core-free-icons";
import { Button } from "@/components/ui/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { stringifyJson, formatBytes } from "@/lib/helpers";
import { JsonEditor } from "./json-editor";
import type { RunnerTheme } from "../../types";

export type ResponseState =
  | { state: "idle" }
  | { state: "loading"; startedAt: number }
  | {
      state: "success" | "error";
      data: unknown;
      durationMs: number;
      sizeBytes: number;
    };

export function ResultPane({ response, theme }: { response: ResponseState; theme: RunnerTheme }) {
  const [copied, setCopied] = useState(false);
  const copiedTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (copiedTimeoutRef.current !== null) {
        window.clearTimeout(copiedTimeoutRef.current);
      }
    };
  }, []);

  function handleCopy(display: string) {
    void navigator.clipboard.writeText(display);
    setCopied(true);

    if (copiedTimeoutRef.current !== null) {
      window.clearTimeout(copiedTimeoutRef.current);
    }

    copiedTimeoutRef.current = window.setTimeout(() => {
      setCopied(false);
      copiedTimeoutRef.current = null;
    }, 2000);
  }

  if (response.state === "idle") {
    return (
      <section className="flex h-full flex-col">
        <Empty className="h-full">
          <EmptyHeader>
            <EmptyTitle>No result yet</EmptyTitle>
            <EmptyDescription>Run a query or mutation to see the response.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      </section>
    );
  }

  const display =
    response.state === "loading" ? '{\n  "state": "loading"\n}' : stringifyJson(response.data);

  return (
    <section className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b pl-2 pr-1 h-10">
        <div>
          <p className="text-xs text-muted-foreground font-mono">
            {response.state === "success"
              ? `${response.durationMs}ms · ${formatBytes(response.sizeBytes)}`
              : response.state === "error"
                ? `Error · ${response.durationMs}ms`
                : response.state === "loading"
                  ? "Running procedure"
                  : "Run a query or mutation to see the response."}
          </p>
        </div>
        {(response.state === "success" || response.state === "error") && (
          <Button
            variant="ghost"
            size="icon"
            aria-label="Copy response"
            onClick={() => handleCopy(display)}
          >
            <HugeiconsIcon icon={copied ? Tick02Icon : Copy01Icon} className="size-3.5" />
          </Button>
        )}
      </div>
      <div className="flex-1 min-h-0 overflow-hidden">
        <JsonEditor value={display} readOnly theme={theme} className="min-h-0" />
      </div>
    </section>
  );
}
