import { createHash } from "node:crypto";
import fs from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { brotliCompress, constants as zlibConstants, gzip } from "node:zlib";

export type ClientAssetName = "js" | "css";
export type ContentEncoding = "br" | "gzip";

export type ClientAsset = {
  name: ClientAssetName;
  /** First 16 hex characters of the SHA-256 of the file contents. */
  hash: string;
  /** Content-hashed file name, for example `runner-0123456789abcdef.js`. */
  fileName: string;
  contentType: string;
  content: Buffer;
  /** The contents as UTF-8 text, for inlining into HTML. */
  readonly text: string;
  /** Compresses the contents once per encoding and caches the result. */
  encode: (encoding: ContentEncoding) => Promise<Buffer>;
};

export type ClientAssets = Record<ClientAssetName, ClientAsset>;

const moduleDir = dirname(fileURLToPath(import.meta.url));
const clientDirCandidates = [
  join(moduleDir, "client"),
  join(moduleDir, "..", "..", "dist", "client"),
  join(process.cwd(), "dist", "client"),
];

const brotliCompressAsync = promisify(brotliCompress);
const gzipAsync = promisify(gzip);

// Quality 6 compresses runner.js about as well as maximum quality minus ~13%, in
// ~0.1s instead of ~13s, so it is cheap enough to do on first request.
const BROTLI_QUALITY = 6;
const GZIP_LEVEL = 6;

let loaded: { key: string; assets: ClientAssets } | null = null;

/**
 * Whether built client assets may be kept in memory without checking the files again:
 * when `cache` is enabled or in production. Otherwise each request stats the files and
 * reloads them only when they changed, so `dev:client` rebuilds show up without a
 * server restart.
 */
export function shouldCacheAssets(options: { cache?: boolean }) {
  return Boolean(options.cache || process.env.NODE_ENV === "production");
}

export function loadClientAssets(options: { cache: boolean }): ClientAssets {
  if (options.cache && loaded) return loaded.assets;

  const clientDir = clientDirCandidates.find((dir) => fs.existsSync(join(dir, "runner.js")));
  if (!clientDir) {
    throw new Error("Unable to locate trpc-runner client assets. Run the package build first.");
  }

  const jsPath = join(clientDir, "runner.js");
  const cssPath = join(clientDir, "runner.css");
  const key = [jsPath, cssPath]
    .map((path) => {
      const stats = fs.statSync(path);
      return `${path}:${stats.size}:${stats.mtimeMs}`;
    })
    .join("|");
  if (loaded?.key === key) return loaded.assets;

  const assets: ClientAssets = {
    js: createClientAsset("js", fs.readFileSync(jsPath)),
    css: createClientAsset("css", fs.readFileSync(cssPath)),
  };
  loaded = { key, assets };
  return assets;
}

export function createClientAsset(name: ClientAssetName, content: Buffer): ClientAsset {
  const hash = createHash("sha256").update(content).digest("hex").slice(0, 16);
  const encoded = new Map<ContentEncoding, Promise<Buffer>>();
  let text: string | undefined;

  return {
    name,
    hash,
    fileName: `runner-${hash}.${name}`,
    contentType: name === "js" ? "text/javascript; charset=utf-8" : "text/css; charset=utf-8",
    content,
    get text() {
      text ??= content.toString("utf8");
      return text;
    },
    encode(encoding) {
      let result = encoded.get(encoding);
      if (!result) {
        result = compress(content, encoding);
        encoded.set(encoding, result);
        // Let a failed compression be retried instead of caching the failure.
        result.catch(() => encoded.delete(encoding));
      }
      return result;
    },
  };
}

function compress(content: Buffer, encoding: ContentEncoding) {
  if (encoding === "br") {
    return brotliCompressAsync(content, {
      params: {
        [zlibConstants.BROTLI_PARAM_QUALITY]: BROTLI_QUALITY,
        [zlibConstants.BROTLI_PARAM_SIZE_HINT]: content.length,
      },
    });
  }
  return gzipAsync(content, { level: GZIP_LEVEL });
}

/**
 * Picks the response encoding from an `Accept-Encoding` header, preferring Brotli,
 * then gzip, and honoring `q=0` exclusions and the `*` wildcard.
 */
export function negotiateEncoding(acceptEncoding: string | undefined): ContentEncoding | undefined {
  if (!acceptEncoding) return undefined;

  const weights = new Map<string, number>();
  for (const part of acceptEncoding.split(",")) {
    const [rawName, ...params] = part.trim().split(";");
    const name = rawName?.trim().toLowerCase();
    if (!name) continue;
    const qParam = params.find((param) => param.trim().toLowerCase().startsWith("q="));
    const q = qParam ? Number.parseFloat(qParam.trim().slice(2)) : 1;
    weights.set(name, Number.isNaN(q) ? 0 : q);
  }

  const weightOf = (name: ContentEncoding) => weights.get(name) ?? weights.get("*") ?? 0;
  const candidates = (["br", "gzip"] as const).filter((name) => weightOf(name) > 0);
  // Prefer the higher weight; on ties keep the order above (Brotli first).
  return candidates.sort((a, b) => weightOf(b) - weightOf(a))[0];
}

/**
 * Returns the asset base URL relative to the page, so it works under any mount path
 * and behind proxies that add or strip a path prefix:
 *
 * - `/runner` resolves `./runner/assets/x.js` to `/runner/assets/x.js`
 * - `/runner/` resolves `./assets/x.js` to `/runner/assets/x.js`
 *
 * The `./` prefix keeps a segment containing `:` from being read as a URL scheme.
 */
export function getAssetBaseUrl(originalUrl: string | undefined) {
  if (!originalUrl) return undefined;
  const pathname = originalUrl.split(/[?#]/)[0] ?? "";
  if (pathname === "" || pathname.endsWith("/")) return "./assets/";
  return `./${pathname.slice(pathname.lastIndexOf("/") + 1)}/assets/`;
}
