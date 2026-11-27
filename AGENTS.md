# AGENTS.md

## Project Overview

`trpc-runner` is a pnpm workspace for an npm package that mounts a live tRPC procedure runner UI from a backend route.

The intended public API is:

```ts
import { createTRPCRunner } from "trpc-runner/express";

app.use(
  "/runner",
  createTRPCRunner({
    router: appRouter,
    endpoint: "/trpc",
    transformer: "superjson",
  }),
);
```

When a user visits `/runner`, the middleware returns a small HTML page with the boot data for the provided tRPC router, linking to the bundled client CSS/JS, which the same middleware serves from `/runner/assets/runner-<hash>.(js|css)` with long-lived immutable caching. `renderTRPCRunner()` (from `trpc-runner/server`) still returns a single self-contained page with the assets inlined, for use outside the Express middleware.

Current option support includes `title`, `description`, `transformer: "superjson"`, `cache`, `include`, `exclude`, `logParseWarnings`, and `defaultTheme`. Keep the backend mount API small and framework-consumer friendly.

## Workspace Layout

- `packages/trpc-runner`: main package intended for npm publishing.
- `apps/example-server`: local Express/tRPC smoke-test app.
- `packages/trpc-runner/src/express.ts`: Express/connect middleware entry: serves the page and the content-hashed client assets.
- `packages/trpc-runner/src/server.ts`: server helper exports.
- `packages/trpc-runner/src/server/manifest.ts`: tRPC router/procedure manifest extraction.
- `packages/trpc-runner/src/server/render.ts`: HTML rendering, with assets inlined (`renderTRPCRunner`) or linked (`renderTRPCRunnerPage` with `mode: "external"`).
- `packages/trpc-runner/src/server/assets.ts`: built client asset loading, content hashing, lazy Brotli/gzip compression, and `Accept-Encoding` negotiation.
- `packages/trpc-runner/src/types.ts`: public option, manifest, procedure, and input metadata types.

## Client Layout

The client has been split into focused React modules:

- `src/client/main.tsx`: React root, global CSS import, and `NuqsAdapter` wrapper for URL-backed tab state.
- `src/client/app.tsx`: app-level resizable layout, URL-backed procedure tabs, response state, sidebar collapse/reset state, theme state, and headers dialog state.
- `src/client/components/sidebar-header.tsx`: sidebar controls, command search dialog, theme menu, and auth headers button.
- `src/client/components/tree-node-view.tsx`: recursive procedure/router tree navigation.
- `src/client/components/procedure-tabs.tsx`: open procedure tabs, tab selection, drag reorder, close all, and undo close all.
- `src/client/components/procedure-panel.tsx`: selected procedure header, run action, and local Body/Raw JSON/Input History/Docs tabs.
- `src/client/components/form-node-editor.tsx`: generated input controls.
- `src/client/components/json-editor.tsx`: Monaco-backed JSON editor used for raw input and read-only output.
- `src/client/components/result-pane.tsx`: response status, timing/size metadata, copy action, and JSON output.
- `src/client/components/headers-dialog.tsx`: locally stored auth/header editor.
- `src/client/components/docs-panel.tsx`: input/output schema documentation, including observed output shape after successful runs when no output parser exists.
- `src/client/components/history-panel.tsx`: locally stored successful input history.
- `src/client/components/procedure-badge.tsx`: query/mutation/subscription labeling.
- `src/client/components/theme-toggle.tsx`: standalone theme icon toggle helper; the current sidebar uses the theme menu in `sidebar-header.tsx`.
- `src/client/components/ui/*`: shadcn-style UI wrappers.
- `src/client/fonts.css`: bundled Inter and JetBrains Mono variable font-face definitions (Latin subset from `@fontsource-variable/*`, inlined into `runner.css`).
- `src/client/lib/monaco.ts`: `configureMonaco()`, which points `@monaco-editor/react` at the bundled `monaco-editor` (editor API + JSON language) and an inlined editor worker instead of the jsDelivr CDN.
- `src/client/lib/helpers.ts`: display-safe JSON (BigInt/Map/Set), input defaults, required-field validation, BigInt request conversion (`prepareRequestInput`), header cleanup, and tRPC error formatting that keeps the server's error `data`.
- `src/client/lib/helpers.test.ts`: unit tests for the pure client helpers.
- `src/client/lib/hooks.ts`: local storage hook (writes in an effect, not inside state updaters) and `getRunnerStorageKeys`, which scopes header/history keys to the runner.
- `src/client/lib/utils.ts`: `cn()` helper using `clsx` and `tailwind-merge`.

## UI And Styling Direction

The runner UI should stay practical and dense, like an API inspection tool.

Current UI requirements:

- Three resizable areas: collapsible procedure tree sidebar, selected procedure input/docs area, and response output.
- URL-backed multi-tab procedure workflow via `nuqs` query state (`tab` and `tabs`).
- Sidebar command search with `Cmd/Ctrl+K`, sidebar collapse with `Cmd/Ctrl+B`, theme menu, panel reset, and auth headers.
- Clear labels for query, mutation, and subscription procedures.
- Generated form inputs when input metadata can be inferred.
- Raw JSON editor fallback.
- Monaco-backed JSON editing and read-only JSON responses.
- Docs tab for inferred input metadata, configured output parser metadata, and observed output shape after a successful run when output metadata is unavailable.
- Per-procedure input history from successful runs.
- Only the latest run of a procedure may update its response; slower earlier requests are ignored.
- Valid Raw JSON edits are synced back into the generated form.
- Resizable panel sizes are saved locally by `react-resizable-panels` and can be reset from the options menu.
- Light and dark mode only for now.

Current styling implementation:

- shadcn-style component wrappers live under `src/client/components/ui`.
- `components.json` configures shadcn with `style: "base-nova"` and no Tailwind prefix.
- Tailwind v4 is compiled internally through `@tailwindcss/vite`.
- `src/client/globals.css` imports bundled fonts, Tailwind with `@import "tailwindcss";`, and `tw-animate-css`.
- Tailwind utility classes in package code are unprefixed.
- Theme tokens live in `src/client/globals.css` using shadcn-style CSS variables.
- Use `Inter` for regular UI elements.
- Use `JetBrains Mono` for Monaco, JSON, and code-like output.
- Fonts and Monaco are bundled; do not add runtime requests to CDNs or font hosts.
- Icons currently use `@hugeicons/react` and `@hugeicons/core-free-icons`.

The package should remain consumer-simple: consumers should not need Tailwind, shadcn, or app-level CSS setup to mount `/runner`. Tailwind and shadcn are implementation details of the bundled client build.

## UI Primitive Notes

The package currently contains `@base-ui/react`, `cmdk`, `@monaco-editor/react`, `react-resizable-panels`, `nuqs`, Tailwind v4, and shadcn-style wrappers.

Before changing primitives:

- Check the actual wrapper in `src/client/components/ui/*`.
- Keep the public backend API unchanged.
- Keep the final runner assets bundled.
- The package `sideEffects` field lets Vite drop side-effect-only imports from `src/client`, so client setup code must be an explicit call (see `configureMonaco()` in `main.tsx`), not a bare `import "./setup"`.
- Avoid reintroducing prefixed Tailwind utility classes.

## Build And Validation Commands

Run these from the repo root:

```sh
pnpm run format
pnpm run lint
pnpm --filter trpc-runner typecheck
pnpm test
pnpm run build
```

Use `pnpm run format:write` before committing formatting changes.

Run `pnpm --filter trpc-runner test:coverage` for a coverage report (text summary plus `packages/trpc-runner/coverage/index.html`). Server code and `src/client/lib` are fully covered; keep new behavior covered by tests that fail when the behavior breaks.

Tests need a prior `pnpm run build`: `render.test.ts` and `client-bundle.test.ts` read the built `dist/client`. Note that `build:server` alone wipes `dist` (tsdown `clean: true`), including `dist/client`; use `pnpm run build`.

The client bundle must not contain browser-unsafe `process` references. After building, check:

```sh
rg -P -o "process\\.env|(?<![.\\w\"'-])process\\b(?![\"'-])" packages/trpc-runner/dist/client/runner.js
```

This should produce no output. The lookarounds skip Monaco's harmless `globalThis.vscode.process` property reads and `"server-process"` icon names, which a plain `\bprocess\b` search also matches.

## Local Example Server

Run the smoke-test backend:

```sh
PORT=3888 pnpm --filter @trpc-runner/example-server dev
```

Open:

```txt
http://localhost:3888/runner
```

The example server defaults to port `9999` if `PORT` is not provided. Use `PORT=3888` or another free port when `9999` is busy.

For live client UI work, run the client bundle watcher and the example server in separate terminals:

```sh
pnpm --filter trpc-runner dev:client
PORT=3888 pnpm --filter @trpc-runner/example-server dev
```

`apps/example-server` imports `trpc-runner/express` through the package export, so it serves the built files from `packages/trpc-runner/dist`, not `packages/trpc-runner/src/client` directly. Client edits require `dev:client` to rebuild `dist/client/runner.js` and `dist/client/runner.css`; after that, refresh `/runner` in the browser.

`src/server/assets.ts` must not serve stale client assets during local development. It keeps assets in memory without rechecking only when `options.cache` is enabled or `NODE_ENV=production`; in normal dev mode it stats `dist/client` on each request and reloads (and re-hashes) the files when their size or mtime changed, so `dev:client` changes show up after a page refresh without restarting the example server. The refreshed page links to the new hashes; a page loaded before the rebuild gets 404s for its old asset URLs until it is refreshed. If you change server-side package code that is imported from `dist` (for example `src/express.ts`, `src/server/render.ts`, or manifest logic), rebuild and restart `pnpm --filter @trpc-runner/example-server dev` once so the running process loads the new built server code.

## Local Package Testing

Create a local package tarball:

```sh
pnpm run pack:local
```

The tarball is written to:

```txt
/tmp/trpc-runner-pack/trpc-runner-<version>.tgz
```

`<version>` is the `version` in `packages/trpc-runner/package.json` (currently `0.0.1`).

For the Flow Sense test project, the consuming app is:

```txt
/Users/farhan2077/Documents/work/flow-sense/apps/tower
```

The relevant server file is:

```txt
/Users/farhan2077/Documents/work/flow-sense/apps/tower/src/api/http/app.mts
```

The vendored tarball path used there (its file name is fixed, independent of the package version) is:

```txt
/Users/farhan2077/Documents/work/flow-sense/vendor/trpc-runner/trpc-runner-0.1.0.tgz
```

After changing `trpc-runner`, refresh the vendored package like this:

```sh
pnpm run build
pnpm run pack:local
cp /tmp/trpc-runner-pack/trpc-runner-0.0.1.tgz /Users/farhan2077/Documents/work/flow-sense/vendor/trpc-runner/trpc-runner-0.1.0.tgz
cd /Users/farhan2077/Documents/work/flow-sense
pnpm install
pnpm --filter @workspace/tower typecheck
```

If Tower is running in Docker or another container, rebuild/restart that runtime so it uses the refreshed package.

## Implementation Notes

- Keep the package ESM-first.
- Keep `@trpc/server` as a peer dependency.
- The published package currently includes only `dist` via the `files` field.
- The package has no runtime `dependencies`: everything the client uses is bundled into `dist/client`, so client libraries belong in `devDependencies`. Only `@trpc/server` (peer) is needed at runtime.
- Public package exports are `trpc-runner/express`, `trpc-runner/server`, `trpc-runner/types`, and `trpc-runner/style.css`.
- Client assets are built into `dist/client/runner.js` and `dist/client/runner.css` (about 5 MB and 0.5 MB, mostly Monaco).
- The Express middleware serves the page with `Cache-Control: no-cache` and serves the assets at `assets/runner-<16-hex sha256>.(js|css)` with `Cache-Control: public, max-age=31536000, immutable`, an ETag, `Vary: Accept-Encoding`, and 304 responses for matching `If-None-Match`. An asset request with an outdated hash calls `next()` (404) rather than serving new contents under an old immutable URL.
- Assets are compressed at runtime on first request per encoding (Brotli quality 6, gzip level 6, ~0.1s) and cached in memory; nothing extra is written to `dist`.
- Asset URLs in the page are relative to the page URL (`./runner/assets/` for `/runner`, `./assets/` for `/runner/`), computed from `req.originalUrl` by `getAssetBaseUrl`, so they work under any mount path and behind prefix-rewriting proxies. Without `req.originalUrl`, the middleware falls back to the inlined page.
- `src/server/render.ts` caches the manifest boot data per options object when `cache` is enabled (one entry per `createTRPCRunner` call).
- `vite.client.config.ts` uses the `@` alias for `src/client`.
- `vite.client.config.ts` also defines browser-safe `process` replacements; keep these when adding dependencies that contain Node-style env guards.
- `vite.client.config.ts` has an `inlineMonacoJsonWorker` plugin that rewrites Monaco's JSON worker `new Worker(new URL(...))` call to a `?worker&inline` import, because the runner serves only `runner.js` and `runner.css`. It fails the build if a Monaco upgrade changes that code; after upgrading `monaco-editor`, check `dist/client` contains only `runner.js` and `runner.css`.
- `build:server` uses `tsdown` with `packages/trpc-runner/tsdown.config.ts`.
- `tsdown.config.ts` keeps `fixedExtension: false` so the ESM server build emits `.js` and `.d.ts` files that match the package `exports` field, instead of `.mjs` and `.d.mts`.
- Prefer feature/component-level edits over reintroducing a large single-file client.
- Router inspection currently reads tRPC internals, supports include/exclude filters with exact or trailing `*` matches, extracts `meta.description`, parses Zod input and output metadata, and records parse warnings.
- Zod 3 (`_def.typeName`) and Zod 4 (`_def.type` / `_zod.def`) are both supported; `getZodKind` normalizes them to lowercase kinds. Test both versions (`zod` and `zod/v4`) when changing parsing.
- Zod metadata support currently includes objects, arrays, strings, numbers, bigints (`kind: "bigint"`, string defaults), booleans, string enums/native enums, literals (Zod 4 multi-value literals become enums), any/unknown (always optional), optional, nonoptional, nullable, default/prefault, catch, effects, pipes/transforms (input side), branded, and readonly wrappers.
- Chained `.input()` object schemas are merged into one object node, matching how tRPC merges parsed inputs.
- Unsupported or unsafe input metadata, including non-object chained inputs, numeric native enums, and unsupported Zod nodes such as dates/unions, should stay runnable through Raw JSON and should record manifest warnings.
- BigInt inputs without `transformer: "superjson"` record a warning, since they can only be sent as strings.
- Tests run with Vitest using `packages/trpc-runner/vitest.config.ts` (Node environment and the `@` alias). React tests opt into jsdom with a `// @vitest-environment jsdom` first line and use `@testing-library/react`; mock `./json-editor` with a textarea, since Monaco does not run in jsdom.
- Test files:
  - `packages/trpc-runner/src/server/manifest.test.ts`: manifest extraction — procedure discovery, tree building, filters, warnings, supported Zod metadata, and unsupported-schema fallbacks.
  - `packages/trpc-runner/src/server/render.test.ts`: HTML rendering in inline and external asset modes, cache behavior, HTML escaping, boot data serialization.
  - `packages/trpc-runner/src/server/assets.test.ts`: asset hashing, reload-on-change, compression, and `Accept-Encoding` negotiation.
  - `packages/trpc-runner/src/server/client-bundle.test.ts`: built `dist/client` checks: only `runner.js`/`runner.css`, inlined Monaco workers, `MonacoEnvironment` setup kept, bundled fonts, and no browser-unsafe `process` references.
  - `packages/trpc-runner/src/client/lib/helpers.test.ts`, `hooks.test.tsx`, `monaco.test.ts`: client helpers, `useLocalStorage`/`getRunnerStorageKeys`, and `configureMonaco` worker routing.
  - `packages/trpc-runner/src/client/components/*.test.tsx`: form editor (JSON draft and BigInt fields), docs panel, and procedure panel runs (BigInt conversion, stale-run guard, Raw JSON sync, error details).
  - `packages/trpc-runner/vite.client.config.test.ts`: the `inlineMonacoJsonWorker` plugin, including against the installed Monaco source.
  - `packages/trpc-runner/src/express.test.ts`: middleware logic — method checks, path normalization, response type branching, connect-style fallback, missing next, asset base URLs, and asset serving (cache headers, compression, 304, outdated hashes).
- If changing router inspection logic, update or add tests in `packages/trpc-runner/src/server/manifest.test.ts`.
- If changing middleware or mount behavior, update `packages/trpc-runner/src/express.test.ts`.
- If changing rendered HTML or asset loading, update `packages/trpc-runner/src/server/render.test.ts` and `packages/trpc-runner/src/server/assets.test.ts`.

## Current Known Behavior

- Subscriptions are discovered and labeled but not runnable yet.
- Some input shapes may fall back to Raw JSON when the input schema cannot be safely introspected.
- Auth headers are stored in browser local storage, under a key scoped to the runner (page path, endpoint, and title).
- Procedure run history is stored in browser local storage with the same scope. Theme and panel layout are origin-wide.
- Procedure tab state is stored in the URL query string through `tab` and `tabs`; the selected procedure-panel Body/Raw JSON/Input History/Docs view is local component state.
- Layout sizes, theme, headers, and history are local to the browser.
