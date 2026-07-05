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
  if (inputs.length > 1) {
    warnings.push({
      path: procedurePath,
      message: "Multiple input parsers are supported through raw JSON only in v1.",
    });
    return { input: unknownNode([]), unsupported: true };
  }

  const parsed = parseZodInput(inputs[0], []);
  if (!parsed.supported) {
    warnings.push({
      path: procedurePath,
      message: "Input schema is unsupported by generated forms; raw JSON is still available.",
    });
  }
  return { input: parsed.node, unsupported: !parsed.supported };
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

function parseZodInput(
  value: unknown,
  path: (string | number)[],
): { node: RunnerInputNode; supported: boolean } {
  if (!isZodLike(value)) return { node: unknownNode(path), supported: false };
  return parseZodNode(value, path);
}

function parseZodNode(
  schema: ZodLike,
  path: (string | number)[],
): { node: RunnerInputNode; supported: boolean } {
  const unwrapped = unwrapZod(schema);
  const def = unwrapped.schema._def ?? {};
  const typeName = getZodTypeName(def);
  const base = {
    path,
    label: String(path[path.length - 1] ?? ""),
    description: schema.description ?? unwrapped.schema.description,
    optional: unwrapped.optional || undefined,
    nullable: unwrapped.nullable || undefined,
    defaultValue: unwrapped.defaultValue,
  };

  switch (typeName) {
    case "ZodObject": {
      const shape = getZodObjectShape(def);
      const children: Record<string, RunnerInputNode> = {};
      let supported = true;
      for (const [key, child] of Object.entries(shape)) {
        const parsed = parseZodNode(child as ZodLike, path.concat(key));
        children[key] = parsed.node;
        supported = supported && parsed.supported;
      }
      return { node: { ...base, kind: "object", children }, supported };
    }
    case "ZodArray": {
      const parsed = parseZodNode((def.type ?? def.element) as ZodLike, path.concat(0));
      return {
        node: { ...base, kind: "array", element: parsed.node },
        supported: parsed.supported,
      };
    }
    case "ZodString":
      return { node: { ...base, kind: "string" }, supported: true };
    case "ZodNumber":
    case "ZodBigInt":
      return { node: { ...base, kind: "number" }, supported: true };
    case "ZodBoolean":
      return { node: { ...base, kind: "boolean" }, supported: true };
    case "ZodEnum":
      return {
        node: { ...base, kind: "enum", values: def.values ?? def.entries ?? [] },
        supported: true,
      };
    case "ZodNativeEnum":
      return {
        node: {
          ...base,
          kind: "enum",
          values: Object.values(def.values ?? {}).filter(
            (item): item is string => typeof item === "string",
          ),
        },
        supported: true,
      };
    case "ZodLiteral":
      return { node: { ...base, kind: "literal", value: def.value ?? null }, supported: true };
    case "ZodAny":
    case "ZodUnknown":
      return { node: unknownNode(path), supported: true };
    default:
      return { node: unknownNode(path), supported: false };
  }
}

function unwrapZod(schema: ZodLike): {
  schema: ZodLike;
  optional: boolean;
  nullable: boolean;
  defaultValue?: unknown;
} {
  let current = schema;
  let optional = false;
  let nullable = false;
  let defaultValue: unknown;

  for (let i = 0; i < 12; i++) {
    const def = current._def ?? {};
    const typeName = getZodTypeName(def);
    if (typeName === "ZodOptional") {
      optional = true;
      current = def.innerType;
      continue;
    }
    if (typeName === "ZodNullable") {
      nullable = true;
      current = def.innerType;
      continue;
    }
    if (typeName === "ZodDefault") {
      optional = true;
      defaultValue = typeof def.defaultValue === "function" ? def.defaultValue() : def.defaultValue;
      current = def.innerType;
      continue;
    }
    if (typeName === "ZodEffects" || typeName === "ZodBranded" || typeName === "ZodReadonly") {
      current = def.schema ?? def.type;
      continue;
    }
    break;
  }

  return { schema: current, optional, nullable, defaultValue };
}

function getZodTypeName(def: Record<string, any>) {
  return def.typeName ?? (typeof def.type === "string" ? `Zod${capitalize(def.type)}` : undefined);
}

function getZodObjectShape(def: Record<string, any>) {
  const shape = typeof def.shape === "function" ? def.shape() : def.shape;
  return shape ?? {};
}

function isZodLike(value: unknown): value is ZodLike {
  return typeof value === "object" && value !== null && "_def" in value;
}

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
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
