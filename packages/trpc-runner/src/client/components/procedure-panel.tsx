import { useState } from "react";
import { createTRPCUntypedClient, httpBatchLink } from "@trpc/client";
import { HugeiconsIcon } from "@hugeicons/react";
import { InformationCircleIcon, PlayIcon } from "@hugeicons/core-free-icons";
import superjson from "superjson";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { FormNodeEditor } from "./form-node-editor";
import { JsonEditor } from "./json-editor";
import { ProcedureBadge } from "./procedure-badge";
import { DocsPanel } from "./docs-panel";
import { HistoryPanel } from "./history-panel";
import type { ResponseState } from "./result-pane";
import {
  defaultValueForNode,
  stringifyJson,
  cleanHeaders,
  normalizeError,
  validateRequiredInput,
} from "@/lib/helpers";
import type { RunnerProcedure, RunnerTheme } from "../../types";

const procedureModeTabClassName =
  "h-10 flex-none bg-transparent data-active:border-transparent data-active:bg-transparent font-regular data-active:shadow-none! dark:data-active:border-transparent dark:data-active:bg-transparent text-muted-foreground/80";
const procedureModeTabs = ["body", "raw", "history", "docs"] as const;
const invalidInput = Symbol("invalid-input");
type ProcedureModeTab = (typeof procedureModeTabs)[number];

function isProcedureModeTab(value: string): value is ProcedureModeTab {
  return procedureModeTabs.some((tab) => tab === value);
}

export function ProcedurePanel({
  procedure,
  headers,
  theme,
  response,
  history,
  onHistoryAdd,
  onHistoryClear,
  onResponse,
}: {
  procedure: RunnerProcedure;
  headers: Record<string, string>;
  theme: RunnerTheme;
  response: ResponseState;
  history: unknown[];
  onHistoryAdd: (item: unknown) => void;
  onHistoryClear: () => void;
  onResponse: (response: ResponseState) => void;
}) {
  const [tab, setTab] = useState<ProcedureModeTab>(
    procedure.inputUnsupported ? "raw" : "body",
  );
  const [input, setInput] = useState(() => defaultValueForNode(procedure.input));
  const [rawInput, setRawInput] = useState(() =>
    stringifyJson(defaultValueForNode(procedure.input)),
  );
  const [inputErrors, setInputErrors] = useState<Record<string, string>>({});
  const [rawInputError, setRawInputError] = useState<string | null>(null);
  const description = procedure.description?.trim();

  function updateInput(next: unknown) {
    setInput(next);
    setRawInput(stringifyJson(next));
    setInputErrors((currentErrors) =>
      Object.keys(currentErrors).length > 0
        ? validateRequiredInput(procedure.input, next)
        : currentErrors,
    );
  }

  function updateTab(nextTab: string) {
    if (isProcedureModeTab(nextTab)) setTab(nextTab);
  }

  async function runProcedure() {
    if (procedure.kind === "subscription") return;

    setRawInputError(null);

    const parsedInput = tab === "raw" ? parseRawInput(rawInput) : validateBodyInput();
    if (parsedInput === invalidInput) return;

    onResponse({ state: "loading", startedAt: performance.now() });
    const started = performance.now();
    try {
      const client = createTRPCUntypedClient<any>({
        links: [
          httpBatchLink({
            url: window.__TRPC_RUNNER_DATA__.options.endpoint,
            headers: () => cleanHeaders(headers),
            transformer:
              window.__TRPC_RUNNER_DATA__.options.transformer === "superjson"
                ? superjson
                : undefined,
          } as any),
        ],
      });
      const data =
        procedure.kind === "query"
          ? await client.query(procedure.pathLabel, parsedInput)
          : await client.mutation(procedure.pathLabel, parsedInput);
      const durationMs = Math.round(performance.now() - started);
      onHistoryAdd(parsedInput);
      onResponse({
        state: "success",
        data,
        durationMs,
        sizeBytes: new Blob([stringifyJson(data)]).size,
      });
    } catch (error) {
      const durationMs = Math.round(performance.now() - started);
      onResponse({
        state: "error",
        data: normalizeError(error),
        durationMs,
        sizeBytes: 0,
      });
    }
  }

  function validateBodyInput() {
    const nextErrors = validateRequiredInput(procedure.input, input);
    setInputErrors(nextErrors);
    return Object.keys(nextErrors).length > 0 ? invalidInput : input;
  }

  function parseRawInput(nextRawInput: string) {
    try {
      return JSON.parse(nextRawInput || "null");
    } catch (error) {
      setRawInputError(error instanceof Error ? error.message : "Invalid JSON input.");
      return invalidInput;
    }
  }

  return (
    <section className="flex h-full flex-col">
      <div className="flex items-center justify-between gap-3 border-b pl-2 pr-1 h-10">
        <div>
          <div className="flex items-center gap-1">
            <ProcedureBadge kind={procedure.kind} />
            <p className="font-medium">{procedure.pathLabel}</p>
            {description ? (
              <TooltipProvider delay={150}>
                <Tooltip>
                  <TooltipTrigger
                    aria-label="Procedure description"
                    className="inline-flex size-6 shrink-0 items-center justify-center rounded-[min(var(--radius-md),10px)] text-muted-foreground transition-all outline-none hover:bg-muted hover:text-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                  >
                    <HugeiconsIcon icon={InformationCircleIcon} className="size-3.5" />
                  </TooltipTrigger>
                  <TooltipContent>{description}</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            ) : null}
          </div>
        </div>
        <Button size="sm" disabled={procedure.kind === "subscription"} onClick={runProcedure}>
          <HugeiconsIcon icon={PlayIcon} size={16} />
          {procedure.kind === "subscription" ? "Unsupported" : `Run ${procedure.kind}`}
        </Button>
      </div>

      <Tabs value={tab} onValueChange={updateTab} className="min-h-0 flex-1 gap-0">
        <div className="h-10 border-b border-border flex items-center">
          <TabsList className="h-10 rounded-none bg-background p-0 gap-0">
            <TabsTrigger value="body" className={procedureModeTabClassName}>
              Body
            </TabsTrigger>
            <TabsTrigger value="raw" className={procedureModeTabClassName}>
              Raw JSON
            </TabsTrigger>
            <TabsTrigger value="history" className={procedureModeTabClassName}>
              Input History
            </TabsTrigger>
            <TabsTrigger value="docs" className={procedureModeTabClassName}>
              Docs
            </TabsTrigger>
          </TabsList>
        </div>

        <div className="min-h-0 flex-1 overflow-hidden">
          <TabsContent value="body" className="h-full overflow-auto p-2">
            {procedure.inputUnsupported ? (
              <Empty className="h-full">
                <EmptyHeader>
                  <EmptyTitle>Generated form unavailable</EmptyTitle>
                  <EmptyDescription>Use Raw JSON for this procedure input.</EmptyDescription>
                </EmptyHeader>
              </Empty>
            ) : (
              <FormNodeEditor
                node={procedure.input}
                value={input}
                onChange={updateInput}
                errors={inputErrors}
              />
            )}
          </TabsContent>

          <TabsContent value="raw" className="flex h-full min-h-0 flex-col -mx-1">
            <JsonEditor
              value={rawInput}
              onChange={(nextRawInput) => {
                setRawInput(nextRawInput);
                setRawInputError(null);
              }}
              theme={theme}
              className="min-h-0 flex-1"
            />
            {rawInputError ? (
              <p className="border-t px-3 py-2 text-xs text-destructive" role="alert">
                {rawInputError}
              </p>
            ) : null}
          </TabsContent>

          <TabsContent value="docs" className="h-full overflow-auto p-2">
            <DocsPanel procedure={procedure} response={response} />
          </TabsContent>

          <TabsContent value="history" className="h-full overflow-auto p-2">
            <HistoryPanel
              items={history}
              onSelect={(item) => {
                updateInput(item);
                setTab("raw");
              }}
              onClear={onHistoryClear}
            />
          </TabsContent>
        </div>
      </Tabs>
    </section>
  );
}
