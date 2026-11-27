import type { AnyTRPCRouter } from "@trpc/server";
import { createTRPCRunnerManifest } from "./manifest";
import { loadClientAssets, shouldCacheAssets } from "./assets";
import type { RunnerBootData, TRPCRunnerOptions } from "../types";

export type RunnerPageAssets =
  /** Embed the client CSS and JS in the page (a single self-contained response). */
  | { mode: "inline" }
  /**
   * Link to content-hashed `runner-<hash>.css`/`.js` files under `baseUrl`, which the
   * caller must serve (see `express.ts`). `baseUrl` must end with `/`.
   */
  | { mode: "external"; baseUrl: string };

// Keyed by the options object so each mounted runner (each `createTRPCRunner` call)
// caches its own boot data instead of sharing the first one rendered.
const cachedBootJson = new WeakMap<object, { title: string; json: string }>();

/**
 * Renders the runner as one self-contained HTML page with the client CSS and JS
 * inlined, for use outside the Express middleware.
 */
export function renderTRPCRunner<TRouter extends AnyTRPCRouter = AnyTRPCRouter>(
  options: TRPCRunnerOptions<TRouter>,
) {
  return renderTRPCRunnerPage(options, { mode: "inline" });
}

export function renderTRPCRunnerPage<TRouter extends AnyTRPCRouter = AnyTRPCRouter>(
  options: TRPCRunnerOptions<TRouter>,
  pageAssets: RunnerPageAssets,
) {
  const boot = getBootJson(options);
  const assets = loadClientAssets({ cache: shouldCacheAssets(options) });

  const styles =
    pageAssets.mode === "inline"
      ? `<style>${assets.css.text}</style>`
      : `<link rel="stylesheet" href="${escapeHtml(pageAssets.baseUrl + assets.css.fileName)}" />`;
  const script =
    pageAssets.mode === "inline"
      ? `<script>${assets.js.text}</script>`
      : `<script src="${escapeHtml(pageAssets.baseUrl + assets.js.fileName)}"></script>`;

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(boot.title)}</title>
    ${styles}
  </head>
  <body>
    <div id="root"></div>
    <script>window.__TRPC_RUNNER_DATA__ = ${boot.json};</script>
    ${script}
  </body>
</html>`;
}

function getBootJson<TRouter extends AnyTRPCRouter = AnyTRPCRouter>(
  options: TRPCRunnerOptions<TRouter>,
) {
  if (options.cache) {
    const cached = cachedBootJson.get(options);
    if (cached) return cached;
  }

  const manifest = createTRPCRunnerManifest(options);
  const bootData: RunnerBootData = {
    manifest,
    options: {
      endpoint: options.endpoint,
      title: options.title,
      description: options.description,
      transformer: options.transformer,
      cache: options.cache,
      include: options.include,
      exclude: options.exclude,
      logParseWarnings: options.logParseWarnings,
      defaultTheme: options.defaultTheme,
    },
  };
  const boot = { title: manifest.title, json: safeJson(bootData) };

  if (options.cache) cachedBootJson.set(options, boot);
  return boot;
}

function safeJson(value: unknown) {
  return JSON.stringify(value).replaceAll("<", "\\u003c");
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
