import type { AnyTRPCRouter } from "@trpc/server";

export type RunnerTransformer = "superjson";
export type ProcedureKind = "query" | "mutation" | "subscription";
export type RunnerTheme = "light" | "dark";

export type TRPCRunnerOptions<TRouter extends AnyTRPCRouter = AnyTRPCRouter> = {
  router: TRouter;
  endpoint: string;
  title?: string;
  description?: string;
  transformer?: RunnerTransformer;
  cache?: boolean;
  include?: string[];
  exclude?: string[];
  logParseWarnings?: boolean;
  defaultTheme?: RunnerTheme;
};

export type SerializedRunnerOptions = Omit<TRPCRunnerOptions, "router">;

export type RunnerManifest = {
  title: string;
  description?: string;
  procedures: RunnerProcedure[];
  tree: RunnerTreeNode;
  warnings: RunnerParseWarning[];
};

export type RunnerTreeNode = {
  name: string;
  path: string[];
  children: RunnerTreeNode[];
  procedures: RunnerProcedureSummary[];
};

export type RunnerProcedureSummary = {
  path: string[];
  pathLabel: string;
  name: string;
  kind: ProcedureKind;
};

export type RunnerProcedure = RunnerProcedureSummary & {
  description?: string;
  input: RunnerInputNode;
  inputUnsupported?: boolean;
  output?: RunnerInputNode;
  outputUnsupported?: boolean;
};

export type RunnerParseWarning = {
  path: string;
  message: string;
};

export type RunnerInputNode =
  | RunnerObjectNode
  | RunnerArrayNode
  | RunnerStringNode
  | RunnerNumberNode
  | RunnerBooleanNode
  | RunnerEnumNode
  | RunnerLiteralNode
  | RunnerUnknownNode;

export type RunnerBaseInputNode = {
  kind: string;
  path: (string | number)[];
  label?: string;
  description?: string;
  optional?: boolean;
  nullable?: boolean;
  defaultValue?: unknown;
};

export type RunnerObjectNode = RunnerBaseInputNode & {
  kind: "object";
  children: Record<string, RunnerInputNode>;
};

export type RunnerArrayNode = RunnerBaseInputNode & {
  kind: "array";
  element: RunnerInputNode;
};

export type RunnerStringNode = RunnerBaseInputNode & {
  kind: "string";
};

export type RunnerNumberNode = RunnerBaseInputNode & {
  kind: "number";
};

export type RunnerBooleanNode = RunnerBaseInputNode & {
  kind: "boolean";
};

export type RunnerEnumNode = RunnerBaseInputNode & {
  kind: "enum";
  values: string[];
};

export type RunnerLiteralNode = RunnerBaseInputNode & {
  kind: "literal";
  value: string | number | boolean | null;
};

export type RunnerUnknownNode = RunnerBaseInputNode & {
  kind: "unknown";
};

export type RunnerBootData = {
  manifest: RunnerManifest;
  options: SerializedRunnerOptions;
};
