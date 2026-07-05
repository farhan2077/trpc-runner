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

When a user visits `/runner`, the middleware returns a complete HTML page with bundled client CSS/JS and boot data for the provided tRPC router.

Current option support includes `title`, `description`, `transformer: "superjson"`, `cache`, `include`, `exclude`, `logParseWarnings`, and `defaultTheme`. Keep the backend mount API small and framework-consumer friendly.

## Workspace Layout

- `packages/trpc-runner`: main package intended for npm publishing.
- `apps/example-server`: local Express/tRPC smoke-test app.
- `packages/trpc-runner/src/express.ts`: Express/connect middleware entry.
- `packages/trpc-runner/src/server.ts`: server helper exports.
- `packages/trpc-runner/src/server/manifest.ts`: tRPC router/procedure manifest extraction.
- `packages/trpc-runner/src/server/render.ts`: HTML rendering and built client asset loading.
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
- `src/client/fonts.css`: bundled Inter and JetBrains Mono font-face definitions.
- `src/client/lib/helpers.ts`: JSON, input defaults, field flattening, header cleanup, error formatting.
- `src/client/lib/hooks.ts`: local storage hook.
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
- Icons currently use `@hugeicons/react` and `@hugeicons/core-free-icons`.

The package should remain consumer-simple: consumers should not need Tailwind, shadcn, or app-level CSS setup to mount `/runner`. Tailwind and shadcn are implementation details of the bundled client build.

## UI Primitive Notes

The package currently contains `@base-ui/react`, `cmdk`, `@monaco-editor/react`, `react-resizable-panels`, `nuqs`, Tailwind v4, and shadcn-style wrappers.

Before changing primitives:

- Check the actual wrapper in `src/client/components/ui/*`.
- Keep the public backend API unchanged.
- Keep the final runner assets bundled.
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

The client bundle must not contain browser-unsafe `process` references. After building, check:

```sh
rg -o "process\\.env|\\bprocess\\b" packages/trpc-runner/dist/client/runner.js
```

This should produce no output.

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

`src/server/render.ts` should not cache client assets during local development. It may cache assets when `options.cache` is enabled or `NODE_ENV=production`, but in normal dev mode it should reread `dist/client` on each request so `dev:client` changes show up without restarting the example server. If you change server-side package code that is imported from `dist` (for example `src/express.ts`, `src/server/render.ts`, or manifest logic), rebuild and restart `pnpm --filter @trpc-runner/example-server dev` once so the running process loads the new built server code.

## Local Package Testing

Create a local package tarball:

```sh
pnpm run pack:local
```

The tarball is written to:

```txt
/tmp/trpc-runner-pack/trpc-runner-0.1.0.tgz
```

For the Flow Sense test project, the consuming app is:

```txt
/Users/farhan2077/Documents/work/flow-sense/apps/tower
```

The relevant server file is:

```txt
/Users/farhan2077/Documents/work/flow-sense/apps/tower/src/api/http/app.mts
```

The vendored tarball path used there is:

```txt
/Users/farhan2077/Documents/work/flow-sense/vendor/trpc-runner/trpc-runner-0.1.0.tgz
```

After changing `trpc-runner`, refresh the vendored package like this:

```sh
pnpm run build
pnpm run pack:local
cp /tmp/trpc-runner-pack/trpc-runner-0.1.0.tgz /Users/farhan2077/Documents/work/flow-sense/vendor/trpc-runner/trpc-runner-0.1.0.tgz
cd /Users/farhan2077/Documents/work/flow-sense
pnpm install
pnpm --filter @workspace/tower typecheck
```

If Tower is running in Docker or another container, rebuild/restart that runtime so it uses the refreshed package.

## Implementation Notes

- Keep the package ESM-first.
- Keep `@trpc/server` as a peer dependency.
- The published package currently includes only `dist` via the `files` field.
- Public package exports are `trpc-runner/express`, `trpc-runner/server`, `trpc-runner/types`, and `trpc-runner/style.css`.
- Client assets are built into `dist/client/runner.js` and `dist/client/runner.css`.
- `src/server/render.ts` inlines both built assets into the returned HTML.
- `vite.client.config.ts` uses the `@` alias for `src/client`.
- `vite.client.config.ts` also defines browser-safe `process` replacements; keep these when adding dependencies that contain Node-style env guards.
- `build:server` uses `tsdown` with `packages/trpc-runner/tsdown.config.ts`.
- `tsdown.config.ts` keeps `fixedExtension: false` so the ESM server build emits `.js` and `.d.ts` files that match the package `exports` field, instead of `.mjs` and `.d.mts`.
- Prefer feature/component-level edits over reintroducing a large single-file client.
- Router inspection currently reads tRPC internals, supports include/exclude filters with exact or trailing `*` matches, extracts `meta.description`, parses Zod input and output metadata, and records parse warnings.
- Zod metadata support currently includes objects, arrays, strings, numbers/bigints, booleans, enums/native enums, literals, any/unknown, optional, nullable, default, effects, branded, and readonly wrappers.
- Unsupported or unsafe input metadata, including multiple input parsers and unsupported Zod nodes such as dates/unions, should stay runnable through Raw JSON and should record manifest warnings.
- Test files:
  - `packages/trpc-runner/src/server/manifest.test.ts`: manifest extraction — procedure discovery, tree building, filters, warnings, supported Zod metadata, and unsupported-schema fallbacks.
  - `packages/trpc-runner/src/server/render.test.ts`: HTML rendering, cache behavior, asset loading, HTML escaping, boot data serialization.
  - `packages/trpc-runner/src/express.test.ts`: middleware logic — method checks, path normalization, response type branching, connect-style fallback, missing next.
- If changing router inspection logic, update or add tests in `packages/trpc-runner/src/server/manifest.test.ts`.
- If changing middleware or mount behavior, update `packages/trpc-runner/src/express.test.ts`.
- If changing rendered HTML or asset loading, update `packages/trpc-runner/src/server/render.test.ts`.

## Current Known Behavior

- Subscriptions are discovered and labeled but not runnable yet.
- Some input shapes may fall back to Raw JSON when the input schema cannot be safely introspected.
- Auth headers are stored in browser local storage.
- Procedure run history is stored in browser local storage.
- Procedure tab state is stored in the URL query string through `tab` and `tabs`; the selected procedure-panel Body/Raw JSON/Input History/Docs view is local component state.
- Layout sizes, theme, headers, and history are local to the browser.
