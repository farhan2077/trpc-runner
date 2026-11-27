import fs from "node:fs";
import { brotliDecompressSync, gunzipSync } from "node:zlib";
import { afterEach, describe, expect, it, vi } from "vitest";
import type * as Zlib from "node:zlib";
import {
  createClientAsset,
  getAssetBaseUrl,
  loadClientAssets,
  negotiateEncoding,
  shouldCacheAssets,
} from "./assets";

describe("createClientAsset", () => {
  it("names the file after a content hash", () => {
    const first = createClientAsset("js", Buffer.from("a"));
    const same = createClientAsset("js", Buffer.from("a"));
    const different = createClientAsset("js", Buffer.from("b"));

    expect(first.hash).toMatch(/^[0-9a-f]{16}$/);
    expect(first.fileName).toBe(`runner-${first.hash}.js`);
    expect(same.hash).toBe(first.hash);
    expect(different.hash).not.toBe(first.hash);
    expect(createClientAsset("css", Buffer.from("a")).fileName).toBe(`runner-${first.hash}.css`);
  });

  it("exposes the contents as text", () => {
    expect(createClientAsset("css", Buffer.from("body{}")).text).toBe("body{}");
  });

  it("compresses once per encoding", async () => {
    const asset = createClientAsset("js", Buffer.from("x".repeat(10_000)));

    const br = asset.encode("br");
    expect(asset.encode("br")).toBe(br);
    expect(brotliDecompressSync(await br).toString()).toBe("x".repeat(10_000));
    expect(gunzipSync(await asset.encode("gzip")).toString()).toBe("x".repeat(10_000));
  });
});

describe("negotiateEncoding", () => {
  it.each([
    [undefined, undefined],
    ["", undefined],
    ["identity", undefined],
    ["gzip", "gzip"],
    ["gzip, deflate, br", "br"],
    ["br;q=0, gzip", "gzip"],
    ["gzip;q=1, br;q=0.5", "gzip"],
    ["*", "br"],
    ["*;q=0, gzip", "gzip"],
    ["BR", "br"],
    ["gzip;q=0, br;q=0", undefined],
    [", gzip,,", "gzip"],
    ["br;q=abc, gzip", "gzip"],
    ["gzip; level=1", "gzip"],
  ])("negotiates %s as %s", (header, expected) => {
    expect(negotiateEncoding(header)).toBe(expected);
  });
});

describe("shouldCacheAssets", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("caches when cache is enabled or in production", () => {
    vi.stubEnv("NODE_ENV", "development");
    expect(shouldCacheAssets({})).toBe(false);
    expect(shouldCacheAssets({ cache: true })).toBe(true);
    vi.stubEnv("NODE_ENV", "production");
    expect(shouldCacheAssets({})).toBe(true);
  });
});

describe("loadClientAssets", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  function mockClientFiles(files: { js: string; css: string; mtimeMs: number }) {
    vi.spyOn(fs, "existsSync").mockReturnValue(true);
    const statSync = vi.spyOn(fs, "statSync").mockImplementation(
      (path) =>
        ({
          size: String(path).endsWith(".js") ? files.js.length : files.css.length,
          mtimeMs: files.mtimeMs,
        }) as fs.Stats,
    );
    const readFileSync = vi
      .spyOn(fs, "readFileSync")
      .mockImplementation((path) =>
        Buffer.from(String(path).endsWith(".js") ? files.js : files.css),
      );
    return { statSync, readFileSync };
  }

  it("reloads assets only when the files change", () => {
    const files = { js: "js-v1", css: "css-v1", mtimeMs: 1 };
    const { readFileSync } = mockClientFiles(files);

    const first = loadClientAssets({ cache: false });
    expect(first.js.text).toBe("js-v1");
    expect(loadClientAssets({ cache: false })).toBe(first);
    expect(readFileSync).toHaveBeenCalledTimes(2);

    files.js = "js-v2";
    files.mtimeMs = 2;
    const second = loadClientAssets({ cache: false });
    expect(second).not.toBe(first);
    expect(second.js.text).toBe("js-v2");
    expect(second.js.hash).not.toBe(first.js.hash);
  });

  it("skips file checks when caching", () => {
    const { statSync } = mockClientFiles({ js: "js-v3", css: "css-v3", mtimeMs: 3 });
    const loaded = loadClientAssets({ cache: false });
    statSync.mockClear();

    expect(loadClientAssets({ cache: true })).toBe(loaded);
    expect(statSync).not.toHaveBeenCalled();
  });
});

describe("getAssetBaseUrl", () => {
  it.each([
    ["/runner", "./runner/assets/"],
    ["/runner/", "./assets/"],
    ["/runner?tab=a&tabs=a", "./runner/assets/"],
    ["/runner#section", "./runner/assets/"],
    ["/api/v1/runner", "./runner/assets/"],
    ["/api/v1/runner/?tab=a", "./assets/"],
    ["/", "./assets/"],
    ["?tab=a", "./assets/"],
    ["/a:b", "./a:b/assets/"],
  ])("resolves %s to %s", (originalUrl, expected) => {
    expect(getAssetBaseUrl(originalUrl)).toBe(expected);
  });

  it("returns undefined without a URL", () => {
    expect(getAssetBaseUrl(undefined)).toBeUndefined();
    expect(getAssetBaseUrl("")).toBeUndefined();
  });

  it("produces URLs that resolve under the mount path", () => {
    for (const pageUrl of [
      "http://host/runner",
      "http://host/runner/?tab=x",
      "http://host/api/runner?tab=x",
    ]) {
      const url = new URL(pageUrl);
      const baseUrl = getAssetBaseUrl(url.pathname + url.search);
      expect(new URL(`${baseUrl}runner-abc.js`, pageUrl).pathname).toBe(
        `${url.pathname.replace(/\/$/, "")}/assets/runner-abc.js`,
      );
    }
  });
});

describe("createClientAsset compression failures", () => {
  afterEach(() => {
    vi.doUnmock("node:zlib");
    vi.resetModules();
  });

  it("retries compression after a failure instead of caching the error", async () => {
    vi.resetModules();
    let calls = 0;
    vi.doMock("node:zlib", async (importOriginal) => {
      const actual = await importOriginal<typeof Zlib>();
      return {
        ...actual,
        brotliCompress: (
          buffer: Buffer,
          options: Zlib.BrotliOptions,
          callback: (error: Error | null, result?: Buffer) => void,
        ) => {
          calls += 1;
          if (calls === 1) callback(new Error("compression failed"));
          else actual.brotliCompress(buffer, options, callback);
        },
      };
    });
    const { createClientAsset: createIsolatedAsset } = await import("./assets");
    const asset = createIsolatedAsset("js", Buffer.from("retry me"));

    await expect(asset.encode("br")).rejects.toThrow("compression failed");
    // Let the cache-eviction handler run.
    await Promise.resolve();
    expect(brotliDecompressSync(await asset.encode("br")).toString()).toBe("retry me");
    expect(calls).toBe(2);
  });
});
