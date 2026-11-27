import { brotliDecompressSync, gunzipSync } from "node:zlib";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createTRPCRunner } from "./express";
import { createClientAsset, type ClientAssets } from "./server/assets";

const renderMocks = vi.hoisted(() => ({
  renderTRPCRunner: vi.fn(() => "<html>inline</html>"),
  renderTRPCRunnerPage: vi.fn(() => "<html>external</html>"),
}));

const assetMocks = vi.hoisted(() => ({ assets: undefined as ClientAssets | undefined }));

vi.mock("./server/render", () => renderMocks);

vi.mock("./server/assets", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./server/assets")>();
  return { ...actual, loadClientAssets: () => assetMocks.assets };
});

interface MockResponse {
  status: (code: number) => MockResponse;
  type?: (type: string) => MockResponse;
  setHeader: (name: string, value: string) => void;
  send: (body: string | Buffer) => void;
  statusCode?: number;
  end?: (body?: string | Buffer) => void;
}

function mockResponse(): MockResponse {
  const status = vi.fn();
  const type = vi.fn();
  const setHeader = vi.fn();
  const send = vi.fn();
  const res: MockResponse = { status, type, setHeader, send };
  status.mockReturnValue(res);
  type.mockReturnValue(res);
  return res;
}

/** A Node-style response (`statusCode`/`end`), as Express provides for assets. */
function mockNodeResponse() {
  const headers = new Map<string, string>();
  const res = {
    ...mockResponse(),
    statusCode: 0,
    body: undefined as Buffer | string | undefined,
    headers,
    setHeader: vi.fn((name: string, value: string) => {
      headers.set(name.toLowerCase(), value);
    }),
    end: vi.fn((body?: Buffer | string) => {
      res.body = body;
    }),
  };
  return res;
}

const jsSource = "console.log('runner');".repeat(200);
const cssSource = "body{color:red}".repeat(200);

beforeEach(() => {
  renderMocks.renderTRPCRunner.mockClear();
  renderMocks.renderTRPCRunnerPage.mockClear();
  assetMocks.assets = {
    js: createClientAsset("js", Buffer.from(jsSource)),
    css: createClientAsset("css", Buffer.from(cssSource)),
  };
});

describe("createTRPCRunner middleware", () => {
  it("returns HTML for GET request to root path", () => {
    const middleware = createTRPCRunner({ router: {} as never, endpoint: "/trpc" });
    const req = { method: "GET", path: "/" };
    const res = mockResponse();
    const next = vi.fn();

    middleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.type).toHaveBeenCalledWith("html");
    expect(res.setHeader).toHaveBeenCalledWith("Cache-Control", "no-cache");
    expect(res.send).toHaveBeenCalledWith("<html>inline</html>");
    expect(next).not.toHaveBeenCalled();
  });

  it("calls next for non-GET requests", () => {
    const middleware = createTRPCRunner({ router: {} as never, endpoint: "/trpc" });
    const req = { method: "POST", path: "/" };
    const res = mockResponse();
    const next = vi.fn();

    middleware(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(res.send).not.toHaveBeenCalled();
  });

  it("serves the page for HEAD requests", () => {
    const middleware = createTRPCRunner({ router: {} as never, endpoint: "/trpc" });
    const res = mockResponse();

    middleware({ method: "HEAD", path: "/" }, res, vi.fn());

    expect(res.send).toHaveBeenCalled();
  });

  it("calls next for non-root path", () => {
    const middleware = createTRPCRunner({ router: {} as never, endpoint: "/trpc" });
    const req = { method: "GET", path: "/some/deep/path" };
    const res = mockResponse();
    const next = vi.fn();

    middleware(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(res.send).not.toHaveBeenCalled();
  });

  it("uses url as fallback when path is undefined", () => {
    const middleware = createTRPCRunner({ router: {} as never, endpoint: "/trpc" });
    const req = { method: "GET", url: "/" };
    const res = mockResponse();
    const next = vi.fn();

    middleware(req, res, next);

    expect(res.send).toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });

  it("normalizes path by stripping query string and trailing slashes", () => {
    const middleware = createTRPCRunner({ router: {} as never, endpoint: "/trpc" });
    const req = { method: "GET", path: "/?foo=bar" };
    const res = mockResponse();
    const next = vi.fn();

    middleware(req, res, next);

    expect(res.send).toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });

  it("handles path with trailing slashes", () => {
    const middleware = createTRPCRunner({ router: {} as never, endpoint: "/trpc" });
    const req = { method: "GET", path: "///" };
    const res = mockResponse();
    const next = vi.fn();

    middleware(req, res, next);

    expect(res.send).toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });

  it("uses setHeader fallback when res.type is not available (connect-style)", () => {
    const middleware = createTRPCRunner({ router: {} as never, endpoint: "/trpc" });
    const req = { method: "GET", path: "/" };
    const res = mockResponse();
    delete res.type;
    const next = vi.fn();

    middleware(req, res, next);

    expect(res.setHeader).toHaveBeenCalledWith("Content-Type", "text/html; charset=utf-8");
    expect(res.send).toHaveBeenCalled();
  });

  it("works without next function", () => {
    const middleware = createTRPCRunner({ router: {} as never, endpoint: "/trpc" });
    const req = { method: "GET", path: "/" };
    const res = mockResponse();

    expect(() => middleware(req, res)).not.toThrow();
    expect(res.send).toHaveBeenCalled();
  });

  it("treats a request without path or url as the root", () => {
    const res = mockResponse();

    createTRPCRunner({ router: {} as never, endpoint: "/trpc" })({ method: "GET" }, res, vi.fn());

    expect(res.send).toHaveBeenCalled();
  });

  it("does not crash when next is omitted for non-root path", () => {
    const middleware = createTRPCRunner({ router: {} as never, endpoint: "/trpc" });
    const req = { method: "GET", path: "/other" };
    const res = mockResponse();

    expect(() => middleware(req, res)).not.toThrow();
    expect(res.send).not.toHaveBeenCalled();
  });
});

describe("createTRPCRunner page asset mode", () => {
  it("links external assets relative to the page when the full URL is known", () => {
    const options = { router: {} as never, endpoint: "/trpc" };
    const middleware = createTRPCRunner(options);
    const res = mockResponse();

    middleware({ method: "GET", path: "/", originalUrl: "/runner?tab=users.list" }, res, vi.fn());

    expect(renderMocks.renderTRPCRunnerPage).toHaveBeenCalledWith(options, {
      mode: "external",
      baseUrl: "./runner/assets/",
    });
    expect(renderMocks.renderTRPCRunner).not.toHaveBeenCalled();
    expect(res.send).toHaveBeenCalledWith("<html>external</html>");
  });

  it("inlines assets when the full request URL is unavailable", () => {
    const middleware = createTRPCRunner({ router: {} as never, endpoint: "/trpc" });

    middleware({ method: "GET", path: "/" }, mockResponse(), vi.fn());

    expect(renderMocks.renderTRPCRunner).toHaveBeenCalled();
    expect(renderMocks.renderTRPCRunnerPage).not.toHaveBeenCalled();
  });
});

describe("createTRPCRunner asset serving", () => {
  const options = { router: {} as never, endpoint: "/trpc" };

  function assetPath(name: "js" | "css") {
    return `/assets/${assetMocks.assets![name].fileName}`;
  }

  it("serves the JS bundle with immutable caching headers", async () => {
    const res = mockNodeResponse();
    const next = vi.fn();

    await createTRPCRunner(options)({ method: "GET", path: assetPath("js") }, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(200);
    expect(res.body?.toString()).toBe(jsSource);
    expect(res.headers.get("content-type")).toBe("text/javascript; charset=utf-8");
    expect(res.headers.get("cache-control")).toBe("public, max-age=31536000, immutable");
    expect(res.headers.get("vary")).toBe("Accept-Encoding");
    expect(res.headers.get("etag")).toBe(`"${assetMocks.assets!.js.hash}"`);
    expect(res.headers.get("content-length")).toBe(String(jsSource.length));
    expect(res.headers.has("content-encoding")).toBe(false);
  });

  it("serves the CSS bundle", async () => {
    const res = mockNodeResponse();

    await createTRPCRunner(options)({ method: "GET", path: assetPath("css") }, res, vi.fn());

    expect(res.statusCode).toBe(200);
    expect(res.headers.get("content-type")).toBe("text/css; charset=utf-8");
    expect(res.body?.toString()).toBe(cssSource);
  });

  it("serves Brotli when accepted", async () => {
    const res = mockNodeResponse();

    await createTRPCRunner(options)(
      { method: "GET", path: assetPath("js"), headers: { "accept-encoding": "gzip, deflate, br" } },
      res,
      vi.fn(),
    );

    expect(res.headers.get("content-encoding")).toBe("br");
    expect(res.headers.get("etag")).toBe(`"${assetMocks.assets!.js.hash}-br"`);
    expect(brotliDecompressSync(res.body as Buffer).toString()).toBe(jsSource);
    expect(res.headers.get("content-length")).toBe(String((res.body as Buffer).length));
  });

  it("serves gzip when Brotli is not accepted", async () => {
    const res = mockNodeResponse();

    await createTRPCRunner(options)(
      { method: "GET", path: assetPath("js"), headers: { "accept-encoding": "gzip, br;q=0" } },
      res,
      vi.fn(),
    );

    expect(res.headers.get("content-encoding")).toBe("gzip");
    expect(gunzipSync(res.body as Buffer).toString()).toBe(jsSource);
  });

  it("returns 304 when the ETag matches", async () => {
    const res = mockNodeResponse();
    const hash = assetMocks.assets!.js.hash;

    await createTRPCRunner(options)(
      {
        method: "GET",
        path: assetPath("js"),
        headers: { "accept-encoding": "br", "if-none-match": `W/"${hash}-br"` },
      },
      res,
      vi.fn(),
    );

    expect(res.statusCode).toBe(304);
    expect(res.body).toBeUndefined();
  });

  it("calls next for an outdated asset hash", async () => {
    const res = mockNodeResponse();
    const next = vi.fn();

    await createTRPCRunner(options)(
      { method: "GET", path: "/assets/runner-0000000000000000.js" },
      res,
      next,
    );

    expect(next).toHaveBeenCalledWith();
    expect(res.end).not.toHaveBeenCalled();
  });

  it("calls next for unknown asset names", () => {
    const next = vi.fn();

    createTRPCRunner(options)(
      { method: "GET", path: "/assets/other-0000000000000000.js" },
      mockNodeResponse(),
      next,
    );

    expect(next).toHaveBeenCalled();
  });

  it("falls back to send for responses without end", async () => {
    const res = mockResponse();

    await createTRPCRunner(options)({ method: "GET", path: assetPath("css") }, res, vi.fn());

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.send).toHaveBeenCalledWith(Buffer.from(cssSource));
  });

  it("passes asset loading errors to next", async () => {
    assetMocks.assets = undefined;
    const next = vi.fn();

    await createTRPCRunner(options)(
      { method: "GET", path: "/assets/runner-0000000000000000.js" },
      mockNodeResponse(),
      next,
    );

    expect(next).toHaveBeenCalledWith(expect.any(TypeError));
  });

  it("reads array-valued request headers", async () => {
    const res = mockNodeResponse();

    await createTRPCRunner(options)(
      {
        method: "GET",
        path: assetPath("js"),
        headers: { "accept-encoding": ["identity", "gzip"] },
      },
      res,
      vi.fn(),
    );

    expect(res.headers.get("content-encoding")).toBe("gzip");
  });

  it("serves HEAD requests for assets", async () => {
    const res = mockNodeResponse();

    await createTRPCRunner(options)({ method: "HEAD", path: assetPath("css") }, res, vi.fn());

    expect(res.statusCode).toBe(200);
    expect(res.headers.get("content-length")).toBe(String(cssSource.length));
  });

  it("sends an empty 304 body for responses without end", async () => {
    const res = mockResponse();

    await createTRPCRunner(options)(
      {
        method: "GET",
        path: assetPath("css"),
        headers: { "if-none-match": `"${assetMocks.assets!.css.hash}"` },
      },
      res,
      vi.fn(),
    );

    expect(res.status).toHaveBeenCalledWith(304);
    expect(res.send).toHaveBeenCalledWith("");
  });

  it("responds with 500 when asset loading fails and there is no next", async () => {
    assetMocks.assets = undefined;
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = mockNodeResponse();

    await createTRPCRunner(options)(
      { method: "GET", path: "/assets/runner-0000000000000000.js" },
      res,
    );

    expect(res.statusCode).toBe(500);
    expect(res.end).toHaveBeenCalled();
    expect(consoleError).toHaveBeenCalledWith(
      "[trpc-runner] Failed to serve client asset:",
      expect.any(TypeError),
    );
    consoleError.mockRestore();
  });
});
