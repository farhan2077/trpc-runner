import type { AnyTRPCRouter } from "@trpc/server";
import {
  getAssetBaseUrl,
  loadClientAssets,
  negotiateEncoding,
  shouldCacheAssets,
  type ClientAssetName,
} from "./server/assets";
import { renderTRPCRunner, renderTRPCRunnerPage } from "./server/render";
import type { TRPCRunnerOptions } from "./types";

type RunnerRequest = {
  method?: string;
  path?: string;
  url?: string;
  /** The full request URL including the mount path (set by Express and connect). */
  originalUrl?: string;
  headers?: Record<string, string | string[] | undefined>;
};

type RunnerResponse = {
  status: (code: number) => RunnerResponse;
  type?: (type: string) => RunnerResponse;
  setHeader?: (name: string, value: string) => void;
  send: (body: string | Buffer) => void;
  statusCode?: number;
  end?: (body?: string | Buffer) => void;
};

type NextFunction = (error?: unknown) => void;

const ASSET_PATH = /^\/assets\/runner-([0-9a-f]{16})\.(js|css)$/;
// Asset URLs contain a content hash, so a given URL never changes content.
const IMMUTABLE_CACHE_CONTROL = "public, max-age=31536000, immutable";

export function createTRPCRunner<TRouter extends AnyTRPCRouter = AnyTRPCRouter>(
  options: TRPCRunnerOptions<TRouter>,
) {
  return function trpcRunnerMiddleware(
    req: RunnerRequest,
    res: RunnerResponse,
    next?: NextFunction,
  ): void | Promise<void> {
    if (req.method && req.method !== "GET" && req.method !== "HEAD") {
      next?.();
      return;
    }

    const path = normalizePath(req.path ?? req.url ?? "/");
    if (path === "/") {
      sendPage(options, req, res);
      return;
    }

    const assetMatch = ASSET_PATH.exec(path);
    if (assetMatch) {
      const [, hash, name] = assetMatch as unknown as [string, string, ClientAssetName];
      return serveAsset(options, req, res, next, name, hash).catch((error: unknown) => {
        if (next) {
          next(error);
          return;
        }
        console.error("[trpc-runner] Failed to serve client asset:", error);
        writeBody(res, 500);
      });
    }

    next?.();
  };
}

function sendPage<TRouter extends AnyTRPCRouter>(
  options: TRPCRunnerOptions<TRouter>,
  req: RunnerRequest,
  res: RunnerResponse,
) {
  // Without the full request URL the asset URLs cannot be resolved, so fall back to
  // the self-contained page with inlined assets.
  const baseUrl = getAssetBaseUrl(req.originalUrl);
  const html =
    baseUrl === undefined
      ? renderTRPCRunner(options)
      : renderTRPCRunnerPage(options, { mode: "external", baseUrl });

  res.status(200);
  // The page embeds the router manifest and the current asset hashes, so the browser
  // must revalidate it instead of reusing a stale copy.
  res.setHeader?.("Cache-Control", "no-cache");
  if (res.type) {
    res.type("html");
  } else {
    res.setHeader?.("Content-Type", "text/html; charset=utf-8");
  }
  res.send(html);
}

async function serveAsset<TRouter extends AnyTRPCRouter>(
  options: TRPCRunnerOptions<TRouter>,
  req: RunnerRequest,
  res: RunnerResponse,
  next: NextFunction | undefined,
  name: ClientAssetName,
  hash: string,
) {
  const asset = loadClientAssets({ cache: shouldCacheAssets(options) })[name];
  // An old hash (the client was rebuilt since the page loaded) is a 404 rather than the
  // new contents, which would otherwise be cached forever under the old URL.
  if (asset.hash !== hash) {
    next?.();
    return;
  }

  const encoding = negotiateEncoding(getHeader(req, "accept-encoding"));
  const etag = `"${asset.hash}${encoding ? `-${encoding}` : ""}"`;
  res.setHeader?.("Cache-Control", IMMUTABLE_CACHE_CONTROL);
  res.setHeader?.("Content-Type", asset.contentType);
  res.setHeader?.("Vary", "Accept-Encoding");
  res.setHeader?.("ETag", etag);

  if (getHeader(req, "if-none-match")?.includes(`"${asset.hash}`)) {
    writeBody(res, 304);
    return;
  }

  const body = encoding ? await asset.encode(encoding) : asset.content;
  if (encoding) res.setHeader?.("Content-Encoding", encoding);
  res.setHeader?.("Content-Length", String(body.length));
  writeBody(res, 200, body);
}

/**
 * Writes with Node's `statusCode`/`end` when available, which skips Express's own
 * ETag hashing of the multi-megabyte body; Node omits the body for HEAD requests.
 */
function writeBody(res: RunnerResponse, status: number, body?: Buffer) {
  if (res.end) {
    res.statusCode = status;
    res.end(body);
    return;
  }
  res.status(status);
  res.send(body ?? "");
}

function getHeader(req: RunnerRequest, name: string) {
  const value = req.headers?.[name];
  return Array.isArray(value) ? value.join(", ") : value;
}

function normalizePath(path: string) {
  return path.split("?")[0]?.replace(/\/+$/, "") || "/";
}
