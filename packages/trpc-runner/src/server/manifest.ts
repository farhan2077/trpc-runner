import type { AnyTRPCRouter } from "@trpc/server";
import type {
  ProcedureKind,
  RunnerInputNode,
  RunnerManifest,
  RunnerObjectNode,
  RunnerParseWarning,
  RunnerProcedure,
  RunnerProcedureSummary,
  RunnerTreeNode,
  TRPCRunnerOptions,
} from "../types";

type InternalProcedure = {
  _def?: {
    type?: ProcedureKind;
    inputs?: unknown[];
    output?: unknown;
    meta?: {
      description?: string;
    };
  };
};

type InternalRouter = {
  _def?: {
    procedures?: Record<string, InternalProcedure>;
  };
};

type ZodLike = {
  _def?: Record<string, any>;
  _zod?: { def?: Record<string, any> };
  description?: string;
};

const emptyObjectInput: RunnerObjectNode = {
  kind: "object",
  path: [],
  children: {},
};

export function createTRPCRunnerManifest<TRouter extends AnyTRPCRouter = AnyTRPCRouter>(
  options: TRPCRunnerOptions<TRouter>,
): RunnerManifest {
  const warnings: RunnerParseWarning[] = [];
  const procedures = getProcedures(options.router).flatMap(([pathLabel, proc]) => {
    if (!matchesFilters(pathLabel, options.include, options.exclude)) return [];

    const kind = proc._def?.type;
    if (!kind) {
      warnings.push({ path: pathLabel, message: "Unable to detect procedure type." });
      return [];
    }

    const path = pathLabel.split(".");
    const inputResult = parseProcedureInput(proc._def?.inputs ?? [], warnings, pathLabel);
    const outputResult = parseProcedureOutput(proc._def?.output, warnings, pathLabel);
    if (options.transformer !== "superjson" && containsKind(inputResult.input, "bigint")) {
      warnings.push({
        path: pathLabel,
        message:
          'BigInt inputs are sent as strings without `transformer: "superjson"`; use z.coerce.bigint() or enable superjson.',
      });
    }
    const procedure: RunnerProcedure = {
      name: path[path.length - 1] ?? pathLabel,
      path,
      pathLabel,
      kind,
      description: proc._def?.meta?.description,
      input: inputResult.input,
      inputUnsupported: inputResult.unsupported,
      output: outputResult.output,
      outputUnsupported: outputResult.unsupported,
    };

    return [procedure];
  });

  const tree = buildTree(procedures);
  if (options.logParseWarnings) {
    for (const warning of warnings) {
      console.warn(`[trpc-runner] ${warning.path}: ${warning.message}`);
    }
  }

  return {
    title: options.title ?? "tRPC Runner",
    description: options.description,
    procedures,
    tree,
    warnings,
  };
}

function getProcedures(router: AnyTRPCRouter): [string, InternalProcedure][] {
  const internal = router as unknown as InternalRouter;
  const procedures = internal._def?.procedures;
  if (procedures && typeof procedures === "object") {
    return Object.entries(procedures);
  }

  return Object.entries(router as unknown as Record<string, unknown>)
    .filter(([, value]) => isProcedure(value))
    .map(([key, value]) => [key, value as InternalProcedure]);
}

function isProcedure(value: unknown): value is InternalProcedure {
  return (
    typeof value === "function" &&
    value !== null &&
    "_def" in value &&
    typeof (value as InternalProcedure)._def?.type === "string"
  );
}

function matchesFilters(path: string, include?: string[], exclude?: string[]) {
  if (include?.length && !include.some((pattern) => pathMatches(path, pattern))) {
    return false;
  }
  if (exclude?.length && exclude.some((pattern) => pathMatches(path, pattern))) {
    return false;
  }
  return true;
}

function pathMatches(path: string, pattern: string) {
  if (pattern.endsWith("*")) return path.startsWith(pattern.slice(0, -1));
  return path === pattern;
}

function parseProcedureInput(
  inputs: unknown[],
  warnings: RunnerParseWarning[],
  procedurePath: string,
): { input: RunnerInputNode; unsupported?: boolean } {
  if (inputs.length === 0) return { input: emptyObjectInput };

  const parsedInputs = inputs.map((input) => parseZodInput(input, []));
  const merged = parsedInputs.length === 1 ? parsedInputs[0] : mergeObjectInputs(parsedInputs);
  if (!merged) {
    warnings.push({
      path: procedurePath,
      message:
        "Multiple input parsers can only be merged when each one is an object schema; raw JSON is still available.",
    });
    return { input: unknownNode([]), unsupported: true };
  }

  if (!merged.supported) {
    warnings.push({
      path: procedurePath,
      message: "Input schema is unsupported by generated forms; raw JSON is still available.",
    });
  }
  return { input: merged.node, unsupported: !merged.supported };
}

/**
 * tRPC validates the same raw input against every chained `.input()` parser and
 * merges the object results, so object schemas can be merged into one form.
 */
function mergeObjectInputs(parsedInputs: ParsedNode[]): ParsedNode | undefined {
  const children: Record<string, RunnerInputNode> = {};
  let supported = true;
  let description: string | undefined;

  for (const parsed of parsedInputs) {
    if (parsed.node.kind !== "object" || parsed.node.nullable) return undefined;
    Object.assign(children, parsed.node.children);
    supported = supported && parsed.supported;
    description ??= parsed.node.description;
  }

  return {
    node: { kind: "object", path: [], label: "", description, children },
    supported,
  };
}

function parseProcedureOutput(
  output: unknown,
  warnings: RunnerParseWarning[],
  procedurePath: string,
): { output?: RunnerInputNode; unsupported?: boolean } {
  if (!output) return {};

  const parsed = parseZodInput(output, []);
  if (!parsed.supported) {
    warnings.push({
      path: procedurePath,
      message: "Output schema is unsupported by generated docs.",
    });
  }
  return { output: parsed.node, unsupported: !parsed.supported };
}

type ParsedNode = { node: RunnerInputNode; supported: boolean };

function parseZodInput(value: unknown, path: (string | number)[]): ParsedNode {
  if (!isZodLike(value)) return { node: unknownNode(path), supported: false };
  return parseZodNode(value, path);
}

function parseZodNode(schema: ZodLike, path: (string | number)[]): ParsedNode {
  const unwrapped = unwrapZod(schema);
  if (!unwrapped) return { node: unknownNode(path), supported: false };

  const def = getZodDef(unwrapped.schema);
  const kind = getZodKind(def);
  const base = {
    path,
    label: String(path[path.length - 1] ?? ""),
    description: unwrapped.description,
    optional: unwrapped.optional || undefined,
    nullable: unwrapped.nullable || undefined,
    defaultValue: unwrapped.defaultValue,
  };

  switch (kind) {
    case "object": {
      const shape = getZodObjectShape(def);
      const children: Record<string, RunnerInputNode> = {};
      let supported = true;
      for (const [key, child] of Object.entries(shape)) {
        const parsed = parseZodInput(child, path.concat(key));
        children[key] = parsed.node;
        supported = supported && parsed.supported;
      }
      return { node: { ...base, kind: "object", children }, supported };
    }
    case "array": {
      // Zod v3 stores the element schema on `def.type`; Zod v4 uses `def.element`.
      const element = def.element ?? (typeof def.type === "object" ? def.type : undefined);
      const parsed = parseZodInput(element, path.concat(0));
      return {
        node: { ...base, kind: "array", element: parsed.node },
        supported: parsed.supported,
      };
    }
    case "string":
      return { node: { ...base, kind: "string" }, supported: true };
    case "number":
      return { node: { ...base, kind: "number" }, supported: true };
    case "bigint":
      return { node: { ...base, kind: "bigint" }, supported: true };
    case "boolean":
      return { node: { ...base, kind: "boolean" }, supported: true };
    case "enum":
    case "nativeenum": {
      const values = enumValues(def);
      if (!values) return { node: { ...base, kind: "unknown" }, supported: false };
      return { node: { ...base, kind: "enum", values }, supported: true };
    }
    case "literal": {
      // Zod v3 stores a single `value`; Zod v4 stores a `values` array.
      const values: unknown[] = Array.isArray(def.values) ? def.values : [def.value];
      if (values.length === 1 && isLiteralValue(values[0])) {
        return { node: { ...base, kind: "literal", value: values[0] }, supported: true };
      }
      if (values.length > 1 && values.every((value) => typeof value === "string")) {
        return { node: { ...base, kind: "enum", values: values as string[] }, supported: true };
      }
      return { node: { ...base, kind: "unknown" }, supported: false };
    }
    case "any":
    case "unknown":
      // `z.any()` and `z.unknown()` accept `undefined`, so they are never required.
      return { node: { ...base, optional: true, kind: "unknown" }, supported: true };
    default:
      return { node: { ...base, kind: "unknown" }, supported: false };
  }
}

function enumValues(def: Record<string, any>): string[] | undefined {
  // Zod v3 `z.enum` stores a string array; v3 `z.nativeEnum` and every Zod v4 enum
  // store an object whose values are the enum members.
  const source = def.values ?? def.entries;
  if (Array.isArray(source)) {
    return source.every((value) => typeof value === "string") ? source : undefined;
  }
  if (!source || typeof source !== "object") return undefined;

  // Numeric TypeScript enums contain reverse mappings (`{ A: 0, 0: "A" }`), and their
  // numeric members cannot be represented by a string select.
  const values = Object.values(source);
  if (values.some((value) => typeof value === "number")) return undefined;
  return values.filter((value): value is string => typeof value === "string");
}

function isLiteralValue(value: unknown): value is string | number | boolean | null {
  return (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  );
}

const MAX_WRAPPER_DEPTH = 32;

function unwrapZod(schema: ZodLike):
  | {
      schema: ZodLike;
      description?: string;
      optional: boolean;
      nullable: boolean;
      defaultValue?: unknown;
    }
  | undefined {
  let current: unknown = schema;
  let description: string | undefined;
  // Wrappers are visited from the outside in, and the outermost optionality wrapper
  // wins: `.optional().nonoptional()` is required, `.nonoptional().optional()` is not.
  let optional: boolean | undefined;
  let nullable = false;
  let defaultValue: unknown;

  for (let i = 0; i < MAX_WRAPPER_DEPTH; i++) {
    if (!isZodLike(current)) return undefined;
    description ??= current.description;

    const def = getZodDef(current);
    switch (getZodKind(def)) {
      case "optional":
        optional ??= true;
        current = def.innerType;
        continue;
      case "nonoptional":
        optional ??= false;
        current = def.innerType;
        continue;
      case "nullable":
        nullable = true;
        current = def.innerType;
        continue;
      case "default":
      case "prefault":
        optional ??= true;
        defaultValue ??= readDefaultValue(def.defaultValue);
        current = def.innerType;
        continue;
      case "catch":
      case "readonly":
        current = def.innerType;
        continue;
      case "effects":
        current = def.schema;
        continue;
      case "branded":
        current = def.type;
        continue;
      case "pipe":
      case "pipeline":
        // The input side of a pipe (including Zod v4 transforms) is what callers send.
        current = def.in;
        continue;
    }

    return { schema: current, description, optional: optional ?? false, nullable, defaultValue };
  }

  return undefined;
}

function readDefaultValue(value: unknown) {
  try {
    const resolved = typeof value === "function" ? value() : value;
    // Boot data is JSON, so BigInt defaults are carried as decimal strings, which is
    // also how the generated form edits BigInt fields.
    return typeof resolved === "bigint" ? resolved.toString() : resolved;
  } catch {
    return undefined;
  }
}

function getZodDef(schema: ZodLike): Record<string, any> {
  return schema._zod?.def ?? schema._def ?? {};
}

/**
 * Normalizes Zod v3 (`typeName: "ZodBigInt"`) and Zod v4 (`type: "bigint"`) schema
 * kinds to the same lowercase name.
 */
function getZodKind(def: Record<string, any>): string | undefined {
  if (typeof def.typeName === "string") return def.typeName.replace(/^Zod/, "").toLowerCase();
  if (typeof def.type === "string") return def.type.toLowerCase();
  return undefined;
}

function getZodObjectShape(def: Record<string, any>): Record<string, unknown> {
  const shape = typeof def.shape === "function" ? def.shape() : def.shape;
  return shape ?? {};
}

function isZodLike(value: unknown): value is ZodLike {
  return typeof value === "object" && value !== null && ("_def" in value || "_zod" in value);
}

function containsKind(node: RunnerInputNode, kind: RunnerInputNode["kind"]): boolean {
  if (node.kind === kind) return true;
  if (node.kind === "object") {
    return Object.values(node.children).some((child) => containsKind(child, kind));
  }
  if (node.kind === "array") return containsKind(node.element, kind);
  return false;
}

function unknownNode(path: (string | number)[]): RunnerInputNode {
  return {
    kind: "unknown",
    path,
    label: String(path[path.length - 1] ?? ""),
  };
}

function buildTree(procedures: RunnerProcedure[]): RunnerTreeNode {
  const root: RunnerTreeNode = {
    name: "",
    path: [],
    children: [],
    procedures: [],
  };

  for (const procedure of procedures) {
    let cursor = root;
    const parentSegments = procedure.path.slice(0, -1);
    for (const segment of parentSegments) {
      let child = cursor.children.find((node) => node.name === segment);
      if (!child) {
        child = {
          name: segment,
          path: cursor.path.concat(segment),
          children: [],
          procedures: [],
        };
        cursor.children.push(child);
      }
      cursor = child;
    }
    cursor.procedures.push(toSummary(procedure));
  }

  return root;
}

function toSummary(procedure: RunnerProcedure): RunnerProcedureSummary {
  return {
    name: procedure.name,
    path: procedure.path,
    pathLabel: procedure.pathLabel,
    kind: procedure.kind,
  };
}
