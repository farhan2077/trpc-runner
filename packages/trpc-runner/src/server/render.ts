import fs from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { AnyTRPCRouter } from "@trpc/server";
import { createTRPCRunnerManifest } from "./manifest";
import type { RunnerBootData, TRPCRunnerOptions } from "../types";

const moduleDir = dirname(fileURLToPath(import.meta.url));
const clientDirCandidates = [
  join(moduleDir, "client"),
  join(moduleDir, "..", "..", "dist", "client"),
  join(process.cwd(), "dist", "client"),
];

let cachedAssets: { js: string; css: string } | null = null;
let cachedHtml: string | null = null;

export function renderTRPCRunner<TRouter extends AnyTRPCRouter = AnyTRPCRouter>(
  options: TRPCRunnerOptions<TRouter>,
) {
  if (options.cache && cachedHtml) return cachedHtml;

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
  const assets = readClientAssets(shouldCacheAssets(options));
  const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(manifest.title)}</title>
    <style>${assets.css}</style>
  </head>
  <body>
    <div id="root"></div>
    <script>window.__TRPC_RUNNER_DATA__ = ${safeJson(bootData)};</script>
    <script>${assets.js}</script>
  </body>
</html>`;

  if (options.cache) cachedHtml = html;
  return html;
}

function readClientAssets(cacheAssets: boolean) {
  if (cacheAssets && cachedAssets) return cachedAssets;
  const clientDir = clientDirCandidates.find((dir) => fs.existsSync(join(dir, "runner.js")));
  if (!clientDir) {
    throw new Error("Unable to locate trpc-runner client assets. Run the package build first.");
  }
  const assets = {
    js: fs.readFileSync(join(clientDir, "runner.js"), "utf8"),
    css: fs.readFileSync(join(clientDir, "runner.css"), "utf8"),
  };
  if (cacheAssets) cachedAssets = assets;
  return assets;
}

function shouldCacheAssets<TRouter extends AnyTRPCRouter = AnyTRPCRouter>(
  options: TRPCRunnerOptions<TRouter>,
) {
  return Boolean(options.cache || process.env.NODE_ENV === "production");
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
