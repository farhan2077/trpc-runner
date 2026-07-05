import { useId } from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { defaultValueForNode, inputPathKey, isRecord, stringifyJson } from "@/lib/helpers";
import type { RunnerInputNode } from "../../types";
import { HugeiconsIcon } from "@hugeicons/react";
import { Asterisk02Icon } from "@hugeicons/core-free-icons";

function FieldShell({
  node,
  label,
  children,
}: {
  node: RunnerInputNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid gap-1.5">
      <div className="flex items-center gap-2">
        <Label className="gap-0.5">
          {label}
          {!node.optional && (
            <HugeiconsIcon
              icon={Asterisk02Icon}
              color="red"
              size={10}
              strokeWidth={3}
              className="mb-0.5"
            />
          )}
        </Label>
      </div>
      {node.description && <p className="text-xs text-muted-foreground">{node.description}</p>}
      {children}
    </div>
  );
}

export function FormNodeEditor({
  node,
  value,
  onChange,
  errors = {},
}: {
  node: RunnerInputNode;
  value: unknown;
  onChange: (value: unknown) => void;
  errors?: Record<string, string>;
}) {
  const fieldId = useId();
  const error = errors[inputPathKey(node)];

  if (node.kind === "object") {
    const objectValue = isRecord(value) ? value : {};
    const entries = Object.entries(node.children);
    if (entries.length === 0) {
      return (
        <div className="grid gap-1.5">
          <Empty className="h-full">
            <EmptyHeader>
              <EmptyTitle>No input required</EmptyTitle>
              <EmptyDescription>This procedure does not require an input object.</EmptyDescription>
            </EmptyHeader>
          </Empty>
          {error ? (
            <p className="text-xs text-destructive" role="alert">
              {error}
            </p>
          ) : null}
        </div>
      );
    }
    return (
      <div className="grid gap-4">
        {entries.map(([key, child]) => (
          <FieldShell key={key} node={child} label={key}>
            <FormNodeEditor
              node={child}
              value={objectValue[key]}
              onChange={(childValue) => onChange({ ...objectValue, [key]: childValue })}
              errors={errors}
            />
          </FieldShell>
        ))}
      </div>
    );
  }

  if (node.kind === "array") {
    const arr = Array.isArray(value) ? value : [];
    return (
      <div className="grid gap-2">
        {arr.map((item, index) => (
          <div key={index} className="grid gap-2 rounded-xl border p-2">
            <FormNodeEditor
              node={node.element}
              value={item}
              errors={errors}
              onChange={(next) => {
                const copy = [...arr];
                copy[index] = next;
                onChange(copy);
              }}
            />
            <Button
              variant="destructive"
              onClick={() => onChange(arr.filter((_, i) => i !== index))}
            >
              Remove
            </Button>
          </div>
        ))}
        <Button
          variant="outline"
          onClick={() => onChange([...arr, defaultValueForNode(node.element)])}
        >
          Add item
        </Button>
        {error ? (
          <p className="text-xs text-destructive" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    );
  }

  if (node.kind === "boolean") {
    return (
      <div className="flex items-center gap-2">
        <Checkbox
          id={fieldId}
          checked={Boolean(value)}
          aria-invalid={error ? true : undefined}
          onCheckedChange={(checked) => onChange(checked)}
        />
        <Label htmlFor={fieldId}>Enabled</Label>
        {error ? (
          <p className="text-xs text-destructive" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    );
  }

  if (node.kind === "number") {
    return (
      <div className="grid gap-1.5">
        <Input
          type="number"
          aria-invalid={error ? true : undefined}
          value={typeof value === "number" ? value : ""}
          onChange={(e) => onChange(e.target.value === "" ? undefined : Number(e.target.value))}
        />
        {error ? (
          <p className="text-xs text-destructive" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    );
  }

  if (node.kind === "enum") {
    return (
      <div className="grid gap-1.5">
        <Select
          value={String(value ?? "")}
          onValueChange={(nextValue) => onChange(nextValue ?? "")}
        >
          <SelectTrigger className="w-full" aria-invalid={error ? true : undefined}>
            <SelectValue placeholder="Select value" />
          </SelectTrigger>
          <SelectContent alignItemWithTrigger={false}>
            <SelectItem value="">Select value</SelectItem>
            {node.values.map((item) => (
              <SelectItem key={item} value={item}>
                {item}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {error ? (
          <p className="text-xs text-destructive" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    );
  }

  if (node.kind === "literal") {
    return <Input value={String(node.value)} disabled />;
  }

  if (node.kind === "unknown") {
    return (
      <div className="grid gap-1.5">
        <Textarea
          aria-invalid={error ? true : undefined}
          value={stringifyJson(value ?? null)}
          onChange={(e) => onChange(JSON.parse(e.target.value || "null"))}
        />
        {error ? (
          <p className="text-xs text-destructive" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="grid gap-1.5">
      <Input
        aria-invalid={error ? true : undefined}
        value={String(value ?? "")}
        onChange={(e) => onChange(e.target.value)}
      />
      {error ? (
        <p className="text-xs text-destructive" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
