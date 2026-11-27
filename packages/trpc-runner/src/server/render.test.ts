import fs from "node:fs";
import { initTRPC } from "@trpc/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderTRPCRunner, renderTRPCRunnerPage } from "./render";
import { loadClientAssets } from "./assets";
import * as manifestModule from "./manifest";

const t = initTRPC.create();

describe("renderTRPCRunner", () => {
  it("returns HTML with escaped boot data and bundled assets", () => {
    const router = t.router({
      hello: t.procedure.query(() => "world"),
    });

    const html = renderTRPCRunner({
      router,
      endpoint: "/trpc",
      title: "<Runner>",
    });

    expect(html).toContain("<!doctype html>");
    expect(html).toContain("&lt;Runner&gt;");
    expect(html).toContain("window.__TRPC_RUNNER_DATA__");
    expect(html).toContain("hello");
    expect(html).toContain("trpc-runner");
  });

  it("escapes all HTML-sensitive characters in title", () => {
    const router = t.router({ ping: t.procedure.query(() => "pong") });
    const html = renderTRPCRunner({
      router,
      endpoint: "/trpc",
      title: 'a&b<c>d"e',
    });
    expect(html).toContain("<title>a&amp;b&lt;c&gt;d&quot;e</title>");
  });

  it("escapes < in JSON boot data via safeJson", () => {
    const router = t.router({ ping: t.procedure.query(() => "pong") });
    const html = renderTRPCRunner({
      router,
      endpoint: "/trpc",
      title: "</script><script>alert(1)",
    });
    const bootDataMatch = html.match(/window\.__TRPC_RUNNER_DATA__\s*=\s*({.+?});/);
    expect(bootDataMatch).not.toBeNull();
    const bootData = bootDataMatch![1]!;
    expect(bootData).not.toContain("</script>");
    expect(bootData).toContain("\\u003c/script>");
  });

  it("includes all boot data option fields when provided", () => {
    const router = t.router({ ping: t.procedure.query(() => "pong") });
    const html = renderTRPCRunner({
      router,
      endpoint: "/trpc-custom",
      title: "Custom",
      description: "A description",
      transformer: "superjson",
      cache: true,
      include: ["ping"],
      exclude: ["other"],
      logParseWarnings: true,
      defaultTheme: "dark",
    });

    expect(html).toContain('"endpoint":"/trpc-custom"');
    expect(html).toContain('"title":"Custom"');
    expect(html).toContain('"description":"A description"');
    expect(html).toContain('"transformer":"superjson"');
    expect(html).toContain('"cache":true');
    expect(html).toContain('"include":["ping"]');
    expect(html).toContain('"exclude":["other"]');
    expect(html).toContain('"logParseWarnings":true');
    expect(html).toContain('"defaultTheme":"dark"');
  });

  it("includes css and js assets", () => {
    const router = t.router({ ping: t.procedure.query(() => "pong") });
    const html = renderTRPCRunner({ router, endpoint: "/trpc" });
    expect(html).toContain("<style>");
    expect(html).toContain("</style>");
    expect(html).toContain("<script>window.__TRPC_RUNNER_DATA__");
    expect(html).toContain("</script>");
  });
});

describe("renderTRPCRunnerPage", () => {
  const router = t.router({ ping: t.procedure.query(() => "pong" as const) });

  it("links content-hashed assets under the base URL in external mode", () => {
    const assets = loadClientAssets({ cache: false });
    const html = renderTRPCRunnerPage(
      { router, endpoint: "/trpc" },
      { mode: "external", baseUrl: "./runner/assets/" },
    );

    expect(html).toContain(
      `<link rel="stylesheet" href="./runner/assets/runner-${assets.css.hash}.css" />`,
    );
    expect(html).toContain(`<script src="./runner/assets/runner-${assets.js.hash}.js"></script>`);
    expect(html).toContain("<script>window.__TRPC_RUNNER_DATA__");
    expect(html).not.toContain("<style>");
    expect(html.length).toBeLessThan(20_000);
  });

  it("escapes the base URL", () => {
    const html = renderTRPCRunnerPage(
      { router, endpoint: "/trpc" },
      { mode: "external", baseUrl: './a"b<c/assets/' },
    );

    expect(html).toContain('href="./a&quot;b&lt;c/assets/runner-');
    expect(html).not.toContain('./a"b');
  });

  it("inlines the same assets in inline mode", () => {
    const assets = loadClientAssets({ cache: false });
    const html = renderTRPCRunnerPage({ router, endpoint: "/trpc" }, { mode: "inline" });

    expect(html).toContain(`<style>${assets.css.text}</style>`);
    expect(html).not.toContain(assets.js.fileName);
  });
});

describe("renderTRPCRunner cache behavior", () => {
  const router = t.router({ ping: t.procedure.query(() => "pong" as const) });

  it("returns cached HTML on second call when cache is enabled", () => {
    const options = { router, endpoint: "/trpc", title: "CacheTest", cache: true };
    const spy = vi.spyOn(manifestModule, "createTRPCRunnerManifest");
    const first = renderTRPCRunner(options);
    const second = renderTRPCRunner(options);
    expect(second).toBe(first);
    expect(spy).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });

  it("keeps a separate cache for each runner", () => {
    const otherRouter = t.router({ other: t.procedure.query(() => "other" as const) });
    const first = renderTRPCRunner({ router, endpoint: "/trpc", title: "First", cache: true });
    const second = renderTRPCRunner({
      router: otherRouter,
      endpoint: "/other-trpc",
      title: "Second",
      cache: true,
    });
    expect(first).toContain("<title>First</title>");
    expect(second).toContain("<title>Second</title>");
    expect(second).toContain("/other-trpc");
    expect(second).toContain('"pathLabel":"other"');
    expect(second).not.toContain('"pathLabel":"ping"');
  });

  it("does not cache HTML when cache is disabled", () => {
    const spy = vi.spyOn(manifestModule, "createTRPCRunnerManifest");
    renderTRPCRunner({ router, endpoint: "/trpc", cache: false });
    renderTRPCRunner({ router, endpoint: "/trpc", cache: false });
    expect(spy).toHaveBeenCalledTimes(2);
    spy.mockRestore();
  });
});

describe("renderTRPCRunner error handling", () => {
  beforeEach(() => {
    vi.spyOn(fs, "existsSync").mockReturnValue(false);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("throws when client assets are not found", () => {
    const router = t.router({ ping: t.procedure.query(() => "pong" as const) });
    expect(() => renderTRPCRunner({ router, endpoint: "/trpc" })).toThrow(
      "Unable to locate trpc-runner client assets",
    );
  });
});

describe("renderTRPCRunner with manifest mock", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders procedure tree data into JSON boot data", () => {
    const html = renderTRPCRunner({
      router: t.router({ foo: t.procedure.query(() => "bar") }),
      endpoint: "/trpc",
    });
    expect(html).toContain('"pathLabel":"foo"');
  });

  it("renders empty manifest gracefully", () => {
    const html = renderTRPCRunner({
      router: t.router({}),
      endpoint: "/trpc",
    });
    expect(html).toContain('"procedures":[]');
  });
});
