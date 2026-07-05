import { Badge } from "@/components/ui/badge";
import { stringifyJson } from "@/lib/helpers";
import type { RunnerInputNode, RunnerProcedure } from "../../types";
import type { ResponseState } from "./result-pane";

type InputField = {
  node: RunnerInputNode;
  path: string;
};

function fieldPath(path: (string | number)[], rootLabel: string): string {
  if (path.length === 0) return rootLabel;

  return path.reduce<string>((label, part) => {
    if (typeof part === "number") return `${label || rootLabel}[]`;
    return label ? `${label}.${part}` : part;
  }, "");
}

function typeLabel(node: RunnerInputNode): string {
  if (node.kind === "array") return `${typeLabel(node.element)}[]`;
  if (node.kind === "enum") return `enum(${node.values.length})`;
  if (node.kind === "literal") return `literal`;
  return node.kind;
}

function collectFields(node: RunnerInputNode, rootLabel: string): InputField[] {
  if (node.kind === "object") {
    return Object.values(node.children).flatMap((child) => collectFields(child, rootLabel));
  }

  if (node.kind === "array" && node.element.kind === "object") {
    return [
      { node, path: fieldPath(node.path, rootLabel) },
      ...Object.values(node.element.children).flatMap((child) => collectFields(child, rootLabel)),
    ];
  }

  return [{ node, path: fieldPath(node.path, rootLabel) }];
}

function formatDefault(value: unknown) {
  if (value === undefined) return undefined;
  return stringifyJson(value);
}

function fieldCountLabel(count: number) {
  return `${count} ${count === 1 ? "field" : "fields"}`;
}

function FieldBadges({ node }: { node: RunnerInputNode }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <Badge
        variant={node.optional ? "outline" : "secondary"}
        className="h-5 rounded-md px-1.5 font-mono"
      >
        {node.optional ? "optional" : "required"}
      </Badge>
      {node.nullable ? (
        <Badge variant="outline" className="h-5 rounded-md px-1.5 font-mono">
          nullable
        </Badge>
      ) : null}
      {node.defaultValue !== undefined ? (
        <Badge variant="outline" className="h-5 rounded-md px-1.5 font-mono">
          default
        </Badge>
      ) : null}
    </div>
  );
}

function inferObservedNode(value: unknown, path: (string | number)[] = []): RunnerInputNode {
  if (Array.isArray(value)) {
    return {
      kind: "array",
      path,
      label: String(path[path.length - 1] ?? ""),
      element: inferObservedNode(value[0] ?? null, path.concat(0)),
    };
  }

  if (value && typeof value === "object") {
    return {
      kind: "object",
      path,
      label: String(path[path.length - 1] ?? ""),
      children: Object.fromEntries(
        Object.entries(value).map(([key, child]) => [
          key,
          inferObservedNode(child, path.concat(key)),
        ]),
      ),
    };
  }

  if (typeof value === "string") {
    return { kind: "string", path, label: String(path[path.length - 1] ?? "") };
  }

  if (typeof value === "number") {
    return { kind: "number", path, label: String(path[path.length - 1] ?? "") };
  }

  if (typeof value === "boolean") {
    return { kind: "boolean", path, label: String(path[path.length - 1] ?? "") };
  }

  return {
    kind: "unknown",
    path,
    label: String(path[path.length - 1] ?? ""),
    nullable: value === null ? true : undefined,
  };
}

function isEmptyObjectSchema(node: RunnerInputNode) {
  return node.kind === "object" && Object.keys(node.children).length === 0;
}

function SchemaSection({
  title,
  badgeLabel,
  emptyLabel,
  missingLabel,
  rootLabel,
  schema,
  showFieldBadges = true,
}: {
  title: string;
  badgeLabel?: string;
  emptyLabel: string;
  missingLabel?: string;
  rootLabel: string;
  schema?: RunnerInputNode;
  showFieldBadges?: boolean;
}) {
  const fields = schema ? collectFields(schema, rootLabel) : [];
  const empty = schema ? isEmptyObjectSchema(schema) : false;

  return (
    <div className="grid gap-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h4 className="text-sm font-medium">{title}</h4>
          {badgeLabel ? (
            <Badge variant="outline" className="h-5 rounded-md px-1.5">
              {badgeLabel}
            </Badge>
          ) : null}
        </div>
        <span className="font-mono text-xs text-muted-foreground">
          {!schema || empty ? "none" : fieldCountLabel(fields.length)}
        </span>
      </div>

      {!schema || empty ? (
        <div className="rounded-lg border border-dashed p-2">
          <p className="text-xs text-muted-foreground">{schema ? emptyLabel : missingLabel}</p>
        </div>
      ) : (
        <div className="divide-y divide-border rounded-lg border">
          {fields.map(({ node, path }) => {
            const defaultValue = formatDefault(node.defaultValue);

            return (
              <div key={path} className="grid gap-2 p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="grid gap-1">
                    <code className="break-all font-mono text-sm text-foreground">{path}</code>
                    <span className="font-mono text-xs text-muted-foreground">
                      {typeLabel(node)}
                    </span>
                  </div>
                  {showFieldBadges ? <FieldBadges node={node} /> : null}
                </div>

                {node.description ? (
                  <p className="text-xs text-muted-foreground">{node.description}</p>
                ) : null}

                {node.kind === "enum" ? (
                  <div className="flex flex-wrap gap-1">
                    {node.values.map((value) => (
                      <code
                        key={value}
                        className="rounded-md bg-muted px-1.5 py-0.5 font-mono text-xs"
                      >
                        {value}
                      </code>
                    ))}
                  </div>
                ) : null}

                {node.kind === "literal" ? (
                  <code className="w-fit rounded-md bg-muted px-1.5 py-0.5 font-mono text-xs">
                    {stringifyJson(node.value)}
                  </code>
                ) : null}

                {defaultValue !== undefined ? (
                  <div className="grid gap-1">
                    <span className="text-xs text-muted-foreground">Default</span>
                    <code className="w-fit max-w-full overflow-auto rounded-md bg-muted px-1.5 py-0.5 font-mono text-xs">
                      {defaultValue}
                    </code>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function DocsPanel({
  procedure,
  response,
}: {
  procedure: RunnerProcedure;
  response: ResponseState;
}) {
  const observedOutput =
    response.state === "success" ? inferObservedNode(response.data) : undefined;
  const outputSchema = procedure.output ?? observedOutput;
  const outputIsObserved = !procedure.output && Boolean(observedOutput);

  return (
    <section className="grid content-start gap-4">
      <SchemaSection
        title="Input schema"
        rootLabel="input"
        schema={procedure.input}
        emptyLabel="This procedure does not require input"
      />
      <SchemaSection
        title="Output schema"
        rootLabel="output"
        schema={outputSchema}
        badgeLabel={outputIsObserved ? "observed" : undefined}
        showFieldBadges={!outputIsObserved}
        emptyLabel="This procedure returns an empty object"
        missingLabel="No output parser is configured. Run this procedure once to inspect an observed output shape."
      />
    </section>
  );
}
