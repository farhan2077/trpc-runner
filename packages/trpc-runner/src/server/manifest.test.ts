import { initTRPC } from "@trpc/server";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { createTRPCRunnerManifest } from "./manifest";

const t = initTRPC.create();

describe("createTRPCRunnerManifest", () => {
  it("discovers query and mutation procedures with zod input metadata", () => {
    const router = t.router({
      users: t.router({
        list: t.procedure
          .meta({ description: "List users" })
          .input(
            z.object({
              role: z
                .enum(["admin", "member"])
                .optional()
                .describe("Role filter"),
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
        create: t.procedure
          .input(z.object({ name: z.string() }))
          .mutation(() => ({ ok: true })),
      }),
    });

    const manifest = createTRPCRunnerManifest({
      router,
      endpoint: "/trpc",
      title: "Test Runner",
    });

    expect(manifest.title).toBe("Test Runner");
    expect(manifest.procedures.map((procedure) => procedure.pathLabel)).toEqual(
      ["users.list", "users.create"],
    );
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

    expect(manifest.procedures.map((procedure) => procedure.pathLabel)).toEqual(
      ["public"],
    );
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
          procedures: [
            { name: "recent", pathLabel: "posts.recent", kind: "query" },
          ],
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
    expect(manifest.warnings[0]?.message).toBe(
      "Unable to detect procedure type.",
    );
  });

  it("parses boolean input", () => {
    const router = t.router({
      test: t.procedure
        .input(z.object({ flag: z.boolean() }))
        .query(() => null),
    });
    const manifest = createTRPCRunnerManifest({ router, endpoint: "/trpc" });
    expect(manifest.procedures[0]?.input).toMatchObject({
      kind: "object",
      children: { flag: { kind: "boolean" } },
    });
  });

  it("parses bigint input as number kind", () => {
    const router = t.router({
      test: t.procedure
        .input(z.object({ count: z.bigint() }))
        .query(() => null),
    });
    const manifest = createTRPCRunnerManifest({ router, endpoint: "/trpc" });
    expect(manifest.procedures[0]?.input).toMatchObject({
      kind: "object",
      children: { count: { kind: "number" } },
    });
  });

  it("parses native enum input", () => {
    enum Color {
      Red = "red",
      Green = "green",
      Blue = "blue",
    }
    const router = t.router({
      test: t.procedure
        .input(z.object({ color: z.nativeEnum(Color) }))
        .query(() => null),
    });
    const manifest = createTRPCRunnerManifest({ router, endpoint: "/trpc" });
    expect(manifest.procedures[0]?.input).toMatchObject({
      kind: "object",
      children: { color: { kind: "enum", values: ["red", "green", "blue"] } },
    });
  });

  it("parses literal input", () => {
    const router = t.router({
      test: t.procedure
        .input(z.object({ status: z.literal("active") }))
        .query(() => null),
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
    expect(
      (data as { children: Record<string, unknown> }).children,
    ).toMatchObject({
      data: { kind: "unknown" },
    });
  });

  it("parses unknown input as supported unknown", () => {
    const router = t.router({
      test: t.procedure
        .input(z.object({ data: z.unknown() }))
        .query(() => null),
    });
    const manifest = createTRPCRunnerManifest({ router, endpoint: "/trpc" });
    const data = manifest.procedures[0]?.input;
    expect(data).toBeDefined();
    expect(
      (data as { children: Record<string, unknown> }).children,
    ).toMatchObject({
      data: { kind: "unknown" },
    });
  });

  it("handles nullable wrapper", () => {
    const router = t.router({
      test: t.procedure
        .input(z.object({ name: z.string().nullable() }))
        .query(() => null),
    });
    const manifest = createTRPCRunnerManifest({ router, endpoint: "/trpc" });
    expect(manifest.procedures[0]?.input).toMatchObject({
      kind: "object",
      children: { name: { kind: "string", nullable: true } },
    });
  });

  it("handles optional wrapper", () => {
    const router = t.router({
      test: t.procedure
        .input(z.object({ name: z.string().optional() }))
        .query(() => null),
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
    const tsNode = (procedure!.input as { children: Record<string, unknown> })
      .children["ts"] as {
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
    expect(
      manifest.warnings.some((w) => w.message.includes("unsupported")),
    ).toBe(true);
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
    expect(
      manifest.warnings.some((w) => w.message.includes("Output schema")),
    ).toBe(true);
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

  it("marks multiple input parsers as unsupported with warning", () => {
    const router = t.router({
      test: t.procedure
        .input(z.object({ a: z.string() }))
        .input(z.object({ b: z.number() }))
        .query(() => null),
    });
    const manifest = createTRPCRunnerManifest({ router, endpoint: "/trpc" });
    expect(manifest.procedures[0]?.inputUnsupported).toBe(true);
    expect(manifest.procedures[0]?.input).toMatchObject({ kind: "unknown" });
    expect(
      manifest.warnings.some((w) =>
        w.message.includes("Multiple input parsers"),
      ),
    ).toBe(true);
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
    const children = (procedure!.input as { children: Record<string, unknown> })
      .children;
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
});
