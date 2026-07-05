import type { RunnerInputNode } from "../../types";

export function defaultValueForNode(node: RunnerInputNode): unknown {
  if (node.defaultValue !== undefined) return node.defaultValue;
  if (node.kind === "object") {
    const childDefaults = Object.entries(node.children)
      .map(([key, child]) => [key, defaultValueForNode(child)] as const)
      .filter(([, childValue]) => childValue !== undefined);

    return Object.fromEntries(childDefaults);
  }
  if (node.kind === "literal") return node.value;
  return undefined;
}

export function inputPathKey(node: RunnerInputNode) {
  return node.path.map(String).join(".");
}

export function validateRequiredInput(
  node: RunnerInputNode,
  value: unknown,
): Record<string, string> {
  const errors: Record<string, string> = {};
  collectRequiredErrors(node, value, errors);
  return errors;
}

function collectRequiredErrors(
  node: RunnerInputNode,
  value: unknown,
  errors: Record<string, string>,
) {
  if (node.kind === "object") {
    const objectValue = isRecord(value) ? value : {};
    const entries = Object.entries(node.children);

    if (entries.length === 0 && isMissingRequiredValue(node, value)) {
      errors[inputPathKey(node)] = "Required";
      return;
    }

    for (const [key, child] of entries) {
      collectRequiredErrors(child, objectValue[key], errors);
    }
    return;
  }

  if (node.kind === "array") {
    if (isMissingRequiredValue(node, value)) {
      errors[inputPathKey(node)] = "Required";
      return;
    }

    if (Array.isArray(value)) {
      value.forEach((item) => collectRequiredErrors(node.element, item, errors));
    }
    return;
  }

  if (isMissingRequiredValue(node, value)) {
    errors[inputPathKey(node)] = "Required";
  }
}

function isMissingRequiredValue(node: RunnerInputNode, value: unknown) {
  if (node.optional || node.defaultValue !== undefined) return false;
  if (value === undefined) return true;
  if (value === null) return !node.nullable;
  if (node.kind === "string" || node.kind === "enum") return value === "";
  if (node.kind === "number") return typeof value !== "number";
  if (node.kind === "boolean") return typeof value !== "boolean";
  return false;
}

export function flattenFields(
  node: RunnerInputNode,
): { path: string; kind: string; description?: string }[] {
  if (node.kind === "object") {
    return Object.entries(node.children).flatMap(([key, child]) =>
      flattenFields(child).map((item) => ({
        ...item,
        path: item.path ? `${key}.${item.path}` : key,
      })),
    );
  }
  return [
    {
      path: node.path.map(String).join("."),
      kind: node.kind,
      description: node.description,
    },
  ];
}

export function stringifyJson(value: unknown) {
  return JSON.stringify(value, null, 2);
}

export function cleanHeaders(headers: Record<string, string>) {
  return Object.fromEntries(Object.entries(headers).filter(([key]) => key.trim()));
}

export function normalizeError(error: unknown) {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
      cause: error.cause,
    };
  }
  return error;
}

export function ensureEmptyHeaderRow(rows: { key: string; value: string }[]) {
  const hasEmpty = rows.some((row) => row.key === "" && row.value === "");
  return hasEmpty ? rows : rows.concat({ key: "", value: "" });
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}
