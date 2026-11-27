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
    return;
  }

  if (
    node.kind === "bigint" &&
    typeof value === "string" &&
    value !== "" &&
    !isBigIntString(value)
  ) {
    errors[inputPathKey(node)] = "Must be a whole number";
  }
}

const bigIntPattern = /^-?\d+$/;

export function isBigIntString(value: string) {
  return bigIntPattern.test(value.trim());
}

/**
 * Converts form/raw input into the value sent to tRPC. BigInt fields are edited as
 * decimal strings (so history stays JSON-serializable) and become real `BigInt`s
 * only when superjson can carry them over the wire.
 */
export function prepareRequestInput(
  node: RunnerInputNode,
  value: unknown,
  options: { superjson: boolean },
): unknown {
  if (node.kind === "bigint") {
    if (!options.superjson) return value;
    if (typeof value === "string" && isBigIntString(value)) return BigInt(value.trim());
    if (typeof value === "number" && Number.isSafeInteger(value)) return BigInt(value);
    return value;
  }

  if (node.kind === "object" && isRecord(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, childValue]) => {
        const child = node.children[key];
        return [key, child ? prepareRequestInput(child, childValue, options) : childValue];
      }),
    );
  }

  if (node.kind === "array" && Array.isArray(value)) {
    return value.map((item) => prepareRequestInput(node.element, item, options));
  }

  return value;
}

function isMissingRequiredValue(node: RunnerInputNode, value: unknown) {
  if (node.optional || node.defaultValue !== undefined) return false;
  if (value === undefined) return true;
  if (value === null) return !node.nullable;
  if (node.kind === "string" || node.kind === "enum") return value === "";
  if (node.kind === "number") return typeof value !== "number" || Number.isNaN(value);
  if (node.kind === "bigint") return typeof value !== "string" || value.trim() === "";
  if (node.kind === "boolean") return typeof value !== "boolean";
  return false;
}

/**
 * Pretty JSON for display. Handles values superjson can deserialize but JSON cannot
 * represent: BigInt becomes `"123n"`, Map becomes an object (or entry list for
 * non-string keys), and Set becomes an array.
 */
export function stringifyJson(value: unknown) {
  return JSON.stringify(value, displayReplacer, 2);
}

function displayReplacer(_key: string, value: unknown) {
  if (typeof value === "bigint") return `${value.toString()}n`;
  if (value instanceof Map) {
    const entries = [...value.entries()];
    return entries.every(([key]) => typeof key === "string")
      ? Object.fromEntries(entries)
      : entries;
  }
  if (value instanceof Set) return [...value];
  return value;
}

export function cleanHeaders(headers: Record<string, string>) {
  return Object.fromEntries(Object.entries(headers).filter(([key]) => key.trim()));
}

/**
 * Makes a thrown value displayable. For `TRPCClientError`s this keeps the server's
 * error `data` (code, httpStatus, path, and any formatter output such as Zod issues),
 * falling back to the full error `shape` when a custom formatter omits `data`.
 */
export function normalizeError(error: unknown) {
  if (error instanceof Error) {
    const details: Record<string, unknown> = {
      name: error.name,
      message: error.message,
    };
    const trpcError = error as Error & { data?: unknown; shape?: unknown };
    if (trpcError.data !== undefined) details.data = trpcError.data;
    else if (trpcError.shape !== undefined) details.shape = trpcError.shape;
    if (error.cause !== undefined) details.cause = normalizeError(error.cause);
    details.stack = error.stack;
    return details;
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
