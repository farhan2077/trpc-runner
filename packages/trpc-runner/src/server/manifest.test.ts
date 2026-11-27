import { initTRPC } from "@trpc/server";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import * as z4 from "zod/v4";
import * as zm from "zod/v4-mini";
import { createTRPCRunnerManifest } from "./manifest";
import type { RunnerObjectNode } from "../types";

const t = initTRPC.create();

describe("createTRPCRunnerManifest", () => {
  it("discovers query and mutation procedures with zod input metadata", () => {
    const router = t.router({
      users: t.router({
        list: t.procedure
          .meta({ description: "List users" })
          .input(
            z.object({
              role: z.enum(["admin", "member"]).optional().describe("Role filter"),
              limit: z.number().default(10),
            }),
          )
          .output(
            z.array(
              z.object({
                id: z.string(),
                role: z.enum(["admin", "member"]),
              }),
            ),
          )
          .query(() => []),
        create: t.procedure.input(z.object({ name: z.string() })).mutation(() => ({ ok: true })),
      }),
    });

    const manifest = createTRPCRunnerManifest({
      router,
      endpoint: "/trpc",
      title: "Test Runner",
    });

    expect(manifest.title).toBe("Test Runner");
    expect(manifest.procedures.map((procedure) => procedure.pathLabel)).toEqual([
      "users.list",
      "users.create",
    ]);
    expect(manifest.procedures[0]?.kind).toBe("query");
    expect(manifest.procedures[1]?.kind).toBe("mutation");
    expect(manifest.procedures[0]?.description).toBe("List users");
    expect(manifest.procedures[0]?.input).toMatchObject({
      kind: "object",
      children: {
        role: {
          kind: "enum",
          optional: true,
          description: "Role filter",
          values: ["admin", "member"],
        },
        limit: {
          kind: "number",
          optional: true,
          defaultValue: 10,
        },
      },
    });
    expect(manifest.procedures[0]?.output).toMatchObject({
      kind: "array",
      element: {
        kind: "object",
        children: {
          id: { kind: "string" },
          role: { kind: "enum", values: ["admin", "member"] },
        },
      },
    });
    expect(manifest.procedures[1]?.output).toBeUndefined();
  });

  it("applies include and exclude filters", () => {
    const router = t.router({
      public: t.procedure.query(() => null),
      internal: t.procedure.query(() => null),
    });

    const manifest = createTRPCRunnerManifest({
      router,
      endpoint: "/trpc",
      include: ["*"],
      exclude: ["internal"],
    });

    expect(manifest.procedures.map((procedure) => procedure.pathLabel)).toEqual(["public"]);
  });

  it("sets default title when not provided", () => {
    const router = t.router({ ping: t.procedure.query(() => "pong") });
    const manifest = createTRPCRunnerManifest({ router, endpoint: "/trpc" });
    expect(manifest.title).toBe("tRPC Runner");
  });

  it("propagates description", () => {
    const router = t.router({ ping: t.procedure.query(() => "pong") });
    const manifest = createTRPCRunnerManifest({
      router,
      endpoint: "/trpc",
      description: "My runner",
    });
    expect(manifest.description).toBe("My runner");
  });

  it("returns empty procedures and warnings for router with no procedures", () => {
    const router = t.router({});
    const manifest = createTRPCRunnerManifest({ router, endpoint: "/trpc" });
    expect(manifest.procedures).toEqual([]);
    expect(manifest.tree).toMatchObject({
      name: "",
      path: [],
      children: [],
      procedures: [],
    });
    expect(manifest.warnings).toEqual([]);
  });

  it("builds correct tree for nested procedures", () => {
    const router = t.router({
      users: t.router({
        list: t.procedure.query(() => []),
        create: t.procedure.mutation(() => ({})),
      }),
      posts: t.router({
        recent: t.procedure.query(() => []),
      }),
    });
    const manifest = createTRPCRunnerManifest({ router, endpoint: "/trpc" });
    expect(manifest.tree).toMatchObject({
      name: "",
      path: [],
      children: [
        {
          name: "users",
          children: [],
          procedures: [
            { name: "list", pathLabel: "users.list", kind: "query" },
            { name: "create", pathLabel: "users.create", kind: "mutation" },
          ],
        },
        {
          name: "posts",
          children: [],
          procedures: [{ name: "recent", pathLabel: "posts.recent", kind: "query" }],
        },
      ],
      procedures: [],
    });
  });

  it("collects warnings for procedure with undetectable type", () => {
    const router = {
      _def: {
        procedures: {
          weird: { _def: { type: undefined } },
        },
      },
    };
    const manifest = createTRPCRunnerManifest({
      router: router as never,
      endpoint: "/trpc",
      logParseWarnings: true,
    });
    expect(manifest.warnings).toHaveLength(1);
    expect(manifest.warnings[0]?.path).toBe("weird");
    expect(manifest.warnings[0]?.message).toBe("Unable to detect procedure type.");
  });

  it("parses boolean input", () => {
    const router = t.router({
      test: t.procedure.input(z.object({ flag: z.boolean() })).query(() => null),
    });
    const manifest = createTRPCRunnerManifest({ router, endpoint: "/trpc" });
    expect(manifest.procedures[0]?.input).toMatchObject({
      kind: "object",
      children: { flag: { kind: "boolean" } },
    });
  });

  it("parses bigint input as bigint kind", () => {
    const router = t.router({
      test: t.procedure.input(z.object({ count: z.bigint() })).query(() => null),
    });
    const manifest = createTRPCRunnerManifest({
      router,
      endpoint: "/trpc",
      transformer: "superjson",
    });
    expect(manifest.procedures[0]?.input).toMatchObject({
      kind: "object",
      children: { count: { kind: "bigint" } },
    });
    expect(manifest.warnings).toEqual([]);
  });

  it("serializes bigint defaults as strings", () => {
    const router = t.router({
      test: t.procedure.input(z.object({ count: z.bigint().default(10n) })).query(() => null),
    });
    const manifest = createTRPCRunnerManifest({
      router,
      endpoint: "/trpc",
      transformer: "superjson",
    });
    expect(manifest.procedures[0]?.input).toMatchObject({
      children: { count: { kind: "bigint", defaultValue: "10" } },
    });
    expect(() => JSON.stringify(manifest)).not.toThrow();
  });

  it("warns when bigint input is used without superjson", () => {
    const router = t.router({
      test: t.procedure.input(z.object({ count: z.bigint() })).query(() => null),
    });
    const manifest = createTRPCRunnerManifest({ router, endpoint: "/trpc" });
    expect(manifest.warnings).toEqual([
      expect.objectContaining({ path: "test", message: expect.stringContaining("BigInt") }),
    ]);
  });

  it("parses native enum input", () => {
    enum Color {
      Red = "red",
      Green = "green",
      Blue = "blue",
    }
    const router = t.router({
      test: t.procedure.input(z.object({ color: z.nativeEnum(Color) })).query(() => null),
    });
    const manifest = createTRPCRunnerManifest({ router, endpoint: "/trpc" });
    expect(manifest.procedures[0]?.input).toMatchObject({
      kind: "object",
      children: { color: { kind: "enum", values: ["red", "green", "blue"] } },
    });
  });

  it("parses literal input", () => {
    const router = t.router({
      test: t.procedure.input(z.object({ status: z.literal("active") })).query(() => null),
    });
    const manifest = createTRPCRunnerManifest({ router, endpoint: "/trpc" });
    expect(manifest.procedures[0]?.input).toMatchObject({
      kind: "object",
      children: { status: { kind: "literal", value: "active" } },
    });
  });

  it("parses any input as supported unknown", () => {
    const router = t.router({
      test: t.procedure.input(z.object({ data: z.any() })).query(() => null),
    });
    const manifest = createTRPCRunnerManifest({ router, endpoint: "/trpc" });
    const data = manifest.procedures[0]?.input;
    expect(data).toBeDefined();
    expect((data as { children: Record<string, unknown> }).children).toMatchObject({
      data: { kind: "unknown" },
    });
  });

  it("parses unknown input as supported unknown", () => {
    const router = t.router({
      test: t.procedure.input(z.object({ data: z.unknown() })).query(() => null),
    });
    const manifest = createTRPCRunnerManifest({ router, endpoint: "/trpc" });
    const data = manifest.procedures[0]?.input;
    expect(data).toBeDefined();
    expect((data as { children: Record<string, unknown> }).children).toMatchObject({
      data: { kind: "unknown" },
    });
  });

  it("handles nullable wrapper", () => {
    const router = t.router({
      test: t.procedure.input(z.object({ name: z.string().nullable() })).query(() => null),
    });
    const manifest = createTRPCRunnerManifest({ router, endpoint: "/trpc" });
    expect(manifest.procedures[0]?.input).toMatchObject({
      kind: "object",
      children: { name: { kind: "string", nullable: true } },
    });
  });

  it("handles optional wrapper", () => {
    const router = t.router({
      test: t.procedure.input(z.object({ name: z.string().optional() })).query(() => null),
    });
    const manifest = createTRPCRunnerManifest({ router, endpoint: "/trpc" });
    expect(manifest.procedures[0]?.input).toMatchObject({
      kind: "object",
      children: { name: { kind: "string", optional: true } },
    });
  });

  it("handles default with function value", () => {
    const router = t.router({
      test: t.procedure
        .input(z.object({ ts: z.number().default(() => Date.now()) }))
        .query(() => null),
    });
    const manifest = createTRPCRunnerManifest({ router, endpoint: "/trpc" });
    expect(manifest.procedures[0]?.input).toMatchObject({
      kind: "object",
      children: { ts: { kind: "number", optional: true } },
    });
    const procedure = manifest.procedures[0];
    expect(procedure).toBeDefined();
    const tsNode = (procedure!.input as { children: Record<string, unknown> }).children["ts"] as {
      defaultValue: unknown;
    };
    expect(typeof tsNode.defaultValue).toBe("number");
  });

  it("handles z.effects (transform/refine)", () => {
    const router = t.router({
      test: t.procedure
        .input(z.object({ num: z.string().transform((s) => s.length) }))
        .query(() => null),
    });
    const manifest = createTRPCRunnerManifest({ router, endpoint: "/trpc" });
    expect(manifest.procedures[0]?.input).toMatchObject({
      kind: "object",
      children: { num: { kind: "string" } },
    });
  });

  it("handles branded types", () => {
    const BrandedId = z.string().brand<"UserId">();
    const router = t.router({
      test: t.procedure.input(z.object({ id: BrandedId })).query(() => null),
    });
    const manifest = createTRPCRunnerManifest({ router, endpoint: "/trpc" });
    expect(manifest.procedures[0]?.input).toMatchObject({
      kind: "object",
      children: { id: { kind: "string" } },
    });
  });

  it("handles z.array input", () => {
    const router = t.router({
      test: t.procedure.input(z.array(z.string())).query(() => null),
    });
    const manifest = createTRPCRunnerManifest({ router, endpoint: "/trpc" });
    expect(manifest.procedures[0]?.input).toMatchObject({
      kind: "array",
      element: { kind: "string" },
    });
  });

  it("marks unsupported schemas and records warning", () => {
    const router = t.router({
      test: t.procedure.input(z.object({ date: z.date() })).query(() => null),
    });
    const manifest = createTRPCRunnerManifest({ router, endpoint: "/trpc" });
    expect(manifest.procedures[0]?.inputUnsupported).toBe(true);
    expect(manifest.warnings.some((w) => w.message.includes("unsupported"))).toBe(true);
  });

  it("records unsupported output warning", () => {
    const router = t.router({
      test: t.procedure
        .input(z.object({}))
        .output(z.date())
        .query(() => new Date()),
    });
    const manifest = createTRPCRunnerManifest({ router, endpoint: "/trpc" });
    expect(manifest.procedures[0]?.outputUnsupported).toBe(true);
    expect(manifest.warnings.some((w) => w.message.includes("Output schema"))).toBe(true);
  });

  it("returns empty input object for no-input procedures", () => {
    const router = t.router({ ping: t.procedure.query(() => "pong") });
    const manifest = createTRPCRunnerManifest({ router, endpoint: "/trpc" });
    expect(manifest.procedures[0]?.input).toMatchObject({
      kind: "object",
      children: {},
    });
    expect(manifest.procedures[0]?.inputUnsupported).toBeUndefined();
  });

  it("merges chained object input parsers", () => {
    const router = t.router({
      test: t.procedure
        .input(z.object({ a: z.string() }))
        .input(z.object({ b: z.number().optional() }))
        .query(() => null),
    });
    const manifest = createTRPCRunnerManifest({ router, endpoint: "/trpc" });
    expect(manifest.procedures[0]?.inputUnsupported).toBe(false);
    expect(manifest.procedures[0]?.input).toMatchObject({
      kind: "object",
      children: {
        a: { kind: "string", path: ["a"] },
        b: { kind: "number", path: ["b"], optional: true },
      },
    });
    expect(manifest.warnings).toEqual([]);
  });

  it("marks non-object multiple input parsers as unsupported with warning", () => {
    const router = t.router({
      test: t.procedure
        .input(z.object({ a: z.string() }))
        // @ts-expect-error tRPC's types reject this, but untyped routers can still reach it.
        .input(z.string())
        .query(() => null),
    });
    const manifest = createTRPCRunnerManifest({ router, endpoint: "/trpc" });
    expect(manifest.procedures[0]?.inputUnsupported).toBe(true);
    expect(manifest.procedures[0]?.input).toMatchObject({ kind: "unknown" });
    expect(manifest.warnings.some((w) => w.message.includes("Multiple input parsers"))).toBe(true);
  });

  it("handles include-only filter", () => {
    const router = t.router({
      a: t.procedure.query(() => null),
      b: t.procedure.query(() => null),
      c: t.procedure.query(() => null),
    });
    const manifest = createTRPCRunnerManifest({
      router,
      endpoint: "/trpc",
      include: ["a", "b"],
    });
    expect(manifest.procedures.map((p) => p.pathLabel)).toEqual(["a", "b"]);
  });

  it("handles exclude-only filter", () => {
    const router = t.router({
      a: t.procedure.query(() => null),
      b: t.procedure.query(() => null),
    });
    const manifest = createTRPCRunnerManifest({
      router,
      endpoint: "/trpc",
      exclude: ["b"],
    });
    expect(manifest.procedures.map((p) => p.pathLabel)).toEqual(["a"]);
  });

  it("handles wildcard exclude pattern", () => {
    const router = t.router({
      users: t.router({
        list: t.procedure.query(() => []),
        create: t.procedure.mutation(() => ({})),
      }),
      admin: t.procedure.query(() => null),
    });
    const manifest = createTRPCRunnerManifest({
      router,
      endpoint: "/trpc",
      exclude: ["users.*"],
    });
    expect(manifest.procedures.map((p) => p.pathLabel)).toEqual(["admin"]);
  });

  it("handles no matched procedures with include filter", () => {
    const router = t.router({ a: t.procedure.query(() => null) });
    const manifest = createTRPCRunnerManifest({
      router,
      endpoint: "/trpc",
      include: ["nonexistent"],
    });
    expect(manifest.procedures).toEqual([]);
  });

  it("propagates description on input fields", () => {
    const router = t.router({
      test: t.procedure
        .input(z.object({ name: z.string().describe("The user name") }))
        .query(() => null),
    });
    const manifest = createTRPCRunnerManifest({ router, endpoint: "/trpc" });
    expect(manifest.procedures[0]?.input).toMatchObject({
      kind: "object",
      children: { name: { kind: "string", description: "The user name" } },
    });
  });

  it("assigns label on input nodes", () => {
    const router = t.router({
      test: t.procedure.input(z.object({ x: z.number() })).query(() => null),
    });
    const manifest = createTRPCRunnerManifest({ router, endpoint: "/trpc" });
    const procedure = manifest.procedures[0];
    expect(procedure).toBeDefined();
    const children = (procedure!.input as { children: Record<string, unknown> }).children;
    expect(children["x"]).toMatchObject({ label: "x", path: ["x"] });
  });

  it("handles z.union which is unsupported", () => {
    const router = t.router({
      test: t.procedure
        .input(z.object({ val: z.union([z.string(), z.number()]) }))
        .query(() => null),
    });
    const manifest = createTRPCRunnerManifest({ router, endpoint: "/trpc" });
    expect(manifest.procedures[0]?.inputUnsupported).toBe(true);
  });

  it("handles readonly, catch, and pipeline wrappers", () => {
    const router = t.router({
      test: t.procedure
        .input(
          z.object({
            frozen: z.object({ a: z.string() }).readonly(),
            fallback: z.number().catch(0),
            piped: z.string().pipe(z.string().min(1)),
          }),
        )
        .query(() => null),
    });
    const manifest = createTRPCRunnerManifest({ router, endpoint: "/trpc" });
    expect(manifest.procedures[0]?.inputUnsupported).toBe(false);
    expect(manifest.procedures[0]?.input).toMatchObject({
      children: {
        frozen: { kind: "object", children: { a: { kind: "string" } } },
        fallback: { kind: "number" },
        piped: { kind: "string" },
      },
    });
  });

  it("marks numeric native enums as unsupported", () => {
    enum Level {
      Low,
      High,
    }
    const router = t.router({
      test: t.procedure.input(z.object({ level: z.nativeEnum(Level) })).query(() => null),
    });
    const manifest = createTRPCRunnerManifest({ router, endpoint: "/trpc" });
    expect(manifest.procedures[0]?.inputUnsupported).toBe(true);
  });

  it("marks any and unknown fields as optional", () => {
    const router = t.router({
      test: t.procedure.input(z.object({ data: z.any() })).query(() => null),
    });
    const manifest = createTRPCRunnerManifest({ router, endpoint: "/trpc" });
    expect(manifest.procedures[0]?.input).toMatchObject({
      children: { data: { kind: "unknown", optional: true } },
    });
  });
});

describe("createTRPCRunnerManifest with Zod v4", () => {
  it("parses objects, arrays, primitives, and enums", () => {
    const router = t.router({
      test: t.procedure
        .input(
          z4.object({
            name: z4.string().describe("Display name"),
            age: z4.number(),
            big: z4.bigint(),
            active: z4.boolean(),
            role: z4.enum(["admin", "member"]),
            tags: z4.array(z4.string()),
          }),
        )
        .query(() => null),
    });
    const manifest = createTRPCRunnerManifest({
      router,
      endpoint: "/trpc",
      transformer: "superjson",
    });
    expect(manifest.procedures[0]?.inputUnsupported).toBe(false);
    expect(manifest.procedures[0]?.input).toMatchObject({
      kind: "object",
      children: {
        name: { kind: "string", description: "Display name" },
        age: { kind: "number" },
        big: { kind: "bigint" },
        active: { kind: "boolean" },
        role: { kind: "enum", values: ["admin", "member"] },
        tags: { kind: "array", element: { kind: "string", path: ["tags", 0] } },
      },
    });
    expect(manifest.warnings).toEqual([]);
  });

  it("parses literals, including multi-value literals as enums", () => {
    const router = t.router({
      test: t.procedure
        .input(z4.object({ one: z4.literal("x"), many: z4.literal(["a", "b"]) }))
        .query(() => null),
    });
    const manifest = createTRPCRunnerManifest({ router, endpoint: "/trpc" });
    expect(manifest.procedures[0]?.input).toMatchObject({
      children: {
        one: { kind: "literal", value: "x" },
        many: { kind: "enum", values: ["a", "b"] },
      },
    });
  });

  it("unwraps optional, nullable, default, readonly, and transform pipes", () => {
    const router = t.router({
      test: t.procedure
        .input(
          z4.object({
            opt: z4.string().optional(),
            nul: z4.string().nullable(),
            def: z4.number().default(10).describe("Limit"),
            ro: z4.string().readonly(),
            tr: z4.string().transform((value) => value.length),
          }),
        )
        .query(() => null),
    });
    const manifest = createTRPCRunnerManifest({ router, endpoint: "/trpc" });
    expect(manifest.procedures[0]?.inputUnsupported).toBe(false);
    expect(manifest.procedures[0]?.input).toMatchObject({
      children: {
        opt: { kind: "string", optional: true },
        nul: { kind: "string", nullable: true },
        def: { kind: "number", optional: true, defaultValue: 10, description: "Limit" },
        ro: { kind: "string" },
        tr: { kind: "string" },
      },
    });
  });

  it("parses output schemas", () => {
    const router = t.router({
      test: t.procedure.output(z4.object({ ok: z4.boolean() })).query(() => ({ ok: true })),
    });
    const manifest = createTRPCRunnerManifest({ router, endpoint: "/trpc" });
    expect(manifest.procedures[0]?.output).toMatchObject({
      kind: "object",
      children: { ok: { kind: "boolean" } },
    });
    expect(manifest.procedures[0]?.outputUnsupported).toBe(false);
  });

  it("marks unsupported Zod v4 schemas", () => {
    const router = t.router({
      test: t.procedure
        .input(z4.object({ when: z4.date(), either: z4.union([z4.string(), z4.number()]) }))
        .query(() => null),
    });
    const manifest = createTRPCRunnerManifest({ router, endpoint: "/trpc" });
    expect(manifest.procedures[0]?.inputUnsupported).toBe(true);
  });
});

describe("createTRPCRunnerManifest with Zod 4 Mini", () => {
  it("parses schemas that only expose `_zod.def`", () => {
    const schema = zm.object({
      name: zm.string(),
      nickname: zm.optional(zm.string()),
      role: zm.enum(["admin", "member"]),
    });
    expect("_def" in schema).toBe(false);

    const router = t.router({ test: t.procedure.input(schema).query(() => null) });
    const manifest = createTRPCRunnerManifest({ router, endpoint: "/trpc" });

    expect(manifest.procedures[0]?.inputUnsupported).toBe(false);
    expect(manifest.procedures[0]?.input).toMatchObject({
      kind: "object",
      children: {
        name: { kind: "string" },
        nickname: { kind: "string", optional: true },
        role: { kind: "enum", values: ["admin", "member"] },
      },
    });
  });
});

describe("createTRPCRunnerManifest edge cases", () => {
  /** A router shaped like tRPC's internals, for schemas tRPC's builder would reject. */
  function rawRouter(procedures: Record<string, { type?: string; inputs?: unknown[] }>) {
    return {
      _def: {
        procedures: Object.fromEntries(
          Object.entries(procedures).map(([path, def]) => [path, { _def: def }]),
        ),
      },
    } as never;
  }

  function inputOf(schema: unknown) {
    const manifest = createTRPCRunnerManifest({
      router: rawRouter({ test: { type: "query", inputs: [schema] } }),
      endpoint: "/trpc",
    });
    return manifest.procedures[0]!;
  }

  it("reads procedures from a router without `_def.procedures`", () => {
    const procedure = Object.assign(() => null, { _def: { type: "query" } });
    const manifest = createTRPCRunnerManifest({
      router: { ping: procedure, notAProcedure: { _def: {} }, value: 1 } as never,
      endpoint: "/trpc",
    });

    expect(manifest.procedures.map((p) => p.pathLabel)).toEqual(["ping"]);
  });

  it("treats a procedure without `inputs` as having no input", () => {
    const manifest = createTRPCRunnerManifest({
      router: rawRouter({ test: { type: "query" } }),
      endpoint: "/trpc",
    });
    expect(manifest.procedures[0]?.input).toMatchObject({ kind: "object", children: {} });
  });

  it("marks non-Zod input parsers as unsupported", () => {
    const procedure = inputOf((value: unknown) => value);
    expect(procedure.inputUnsupported).toBe(true);
    expect(procedure.input).toMatchObject({ kind: "unknown" });
  });

  it("marks schemas without a recognizable kind as unsupported", () => {
    expect(inputOf({ _def: {} }).inputUnsupported).toBe(true);
  });

  it("marks wrappers around non-schema values as unsupported", () => {
    expect(
      inputOf({ _def: { typeName: "ZodOptional", innerType: undefined } }).inputUnsupported,
    ).toBe(true);
  });

  it("stops unwrapping self-referencing wrappers", () => {
    const cyclic: { _def: Record<string, unknown> } = { _def: { typeName: "ZodOptional" } };
    cyclic._def.innerType = cyclic;
    expect(inputOf(cyclic).inputUnsupported).toBe(true);
  });

  it("marks arrays without an element schema as unsupported", () => {
    expect(inputOf({ _def: { type: "array" } }).inputUnsupported).toBe(true);
  });

  it("treats objects without a shape as empty", () => {
    const procedure = inputOf({ _def: { type: "object" } });
    expect(procedure.inputUnsupported).toBe(false);
    expect(procedure.input).toMatchObject({ kind: "object", children: {} });
  });

  it("marks enums with non-string or missing values as unsupported", () => {
    expect(inputOf({ _def: { typeName: "ZodEnum", values: [1, 2] } }).inputUnsupported).toBe(true);
    expect(inputOf({ _def: { typeName: "ZodEnum" } }).inputUnsupported).toBe(true);
  });

  it("parses number, boolean, and null literals", () => {
    const router = t.router({
      test: t.procedure
        .input(z.object({ n: z.literal(5), b: z.literal(true), nil: z.null() }))
        .query(() => null),
    });
    const manifest = createTRPCRunnerManifest({ router, endpoint: "/trpc" });
    expect(manifest.procedures[0]?.input).toMatchObject({
      children: { n: { kind: "literal", value: 5 }, b: { kind: "literal", value: true } },
    });
    expect(inputOf({ _def: { typeName: "ZodLiteral", value: null } }).input).toMatchObject({
      kind: "literal",
      value: null,
    });
  });

  it("marks bigint and non-string multi-value literals as unsupported", () => {
    const router = t.router({
      big: t.procedure.input(z.object({ v: z.literal(1n) })).query(() => null),
      numbers: t.procedure.input(z4.object({ v: z4.literal([1, 2]) })).query(() => null),
    });
    const manifest = createTRPCRunnerManifest({ router, endpoint: "/trpc" });
    expect(manifest.procedures.map((p) => p.inputUnsupported)).toEqual([true, true]);
  });

  it("drops defaults whose factory throws", () => {
    const router = t.router({
      test: t.procedure
        .input(
          z.object({
            value: z.string().default(() => {
              throw new Error("no default");
            }),
          }),
        )
        .query(() => null),
    });
    const manifest = createTRPCRunnerManifest({ router, endpoint: "/trpc" });
    const value = (manifest.procedures[0]!.input as RunnerObjectNode).children.value;
    expect(value).toMatchObject({ kind: "string", optional: true });
    expect(value?.defaultValue).toBeUndefined();
  });

  it("lets the outermost Zod 4 optionality wrapper win", () => {
    const router = t.router({
      test: t.procedure
        .input(
          z4.object({
            required: z4.string().optional().nonoptional(),
            optional: z4.string().nonoptional().optional(),
          }),
        )
        .query(() => null),
    });
    const manifest = createTRPCRunnerManifest({ router, endpoint: "/trpc" });
    const children = (manifest.procedures[0]!.input as RunnerObjectNode).children;
    expect(children.required).toMatchObject({ kind: "string" });
    expect(children.required?.optional).toBeUndefined();
    expect(children.optional).toMatchObject({ kind: "string", optional: true });
  });

  it("parses Zod 4 prefault and catch wrappers", () => {
    const router = t.router({
      test: t.procedure
        .input(z4.object({ pre: z4.number().prefault(3), caught: z4.string().catch("x") }))
        .query(() => null),
    });
    const manifest = createTRPCRunnerManifest({ router, endpoint: "/trpc" });
    expect(manifest.procedures[0]?.input).toMatchObject({
      children: {
        pre: { kind: "number", optional: true, defaultValue: 3 },
        caught: { kind: "string" },
      },
    });
  });

  it("does not merge chained inputs when one is a nullable object", () => {
    const manifest = createTRPCRunnerManifest({
      router: rawRouter({
        test: {
          type: "query",
          inputs: [z.object({ a: z.string() }), z.object({ b: z.string() }).nullable()],
        },
      }),
      endpoint: "/trpc",
    });
    expect(manifest.procedures[0]?.inputUnsupported).toBe(true);
    expect(manifest.warnings[0]?.message).toContain("Multiple input parsers");
  });

  it("marks merged chained inputs unsupported when a field is unsupported", () => {
    const router = t.router({
      test: t.procedure
        .input(z.object({ a: z.string() }))
        .input(z.object({ when: z.date() }))
        .query(() => null),
    });
    const manifest = createTRPCRunnerManifest({ router, endpoint: "/trpc" });
    expect(manifest.procedures[0]?.inputUnsupported).toBe(true);
    expect(manifest.procedures[0]?.input).toMatchObject({
      kind: "object",
      children: { a: { kind: "string" }, when: { kind: "unknown" } },
    });
    expect(manifest.warnings[0]?.message).toContain("unsupported by generated forms");
  });

  it("keeps the first description when merging chained inputs", () => {
    const router = t.router({
      test: t.procedure
        .input(z.object({ a: z.string() }).describe("Base input"))
        .input(z.object({ b: z.string() }).describe("Route input"))
        .query(() => null),
    });
    const manifest = createTRPCRunnerManifest({ router, endpoint: "/trpc" });
    expect(manifest.procedures[0]?.input.description).toBe("Base input");
  });

  it("warns about bigint fields nested in objects and arrays without superjson", () => {
    const router = t.router({
      nested: t.procedure
        .input(z.object({ outer: z.object({ ids: z.array(z.bigint()) }) }))
        .query(() => null),
      none: t.procedure.input(z.object({ ids: z.array(z.string()) })).query(() => null),
    });
    const manifest = createTRPCRunnerManifest({ router, endpoint: "/trpc" });
    expect(manifest.warnings.map((warning) => warning.path)).toEqual(["nested"]);
  });
});
