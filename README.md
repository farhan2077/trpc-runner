# trpc-runner

Backend-mounted tRPC procedure runner with a bundled React UI.

`trpc-runner` lets an Express/tRPC backend expose an internal procedure runner at a route such as `/runner`. The middleware serves the runner page and its client CSS and JavaScript, which are already bundled into the package.

Consumers do not need to configure Tailwind, shadcn, Vite, React, or any app-level CSS setup.

## Features

- Inspect query, mutation, and subscription procedures from a tRPC router.
- Run query and mutation procedures against a configured tRPC endpoint.
- Use generated form inputs for supported Zod input schemas.
- Fall back to raw JSON input for unsupported or advanced schemas.
- Edit raw JSON and inspect responses with a Monaco-backed JSON editor.
- Browse input and output schema docs, including observed output shapes after successful runs when no output parser is configured.
- Keep multiple procedures open in URL-backed tabs.
- Store auth headers, theme, layout, and successful input history locally in the browser. Headers and history are scoped to each runner (page path, endpoint, and title), so different projects on the same host and port do not share them.
- Works offline: the Monaco editor, its workers, and the Inter/JetBrains Mono fonts are bundled into the page instead of loaded from a CDN.
- Use light or dark mode.

## Getting Started

Install the package in an Express/tRPC app:

```sh
pnpm add trpc-runner
```

Mount the runner on a backend route:

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

Visit `http://localhost:<port>/runner` to inspect and run procedures.

The middleware responds to `GET /` for the mounted route with the runner page, and to `GET /assets/runner-<hash>.js` and `.css` with the client bundle (about 1.3 MB with Brotli). Asset URLs contain a content hash and are cached by the browser indefinitely, so only the first visit after an upgrade downloads them. Responses are Brotli- or gzip-compressed when the browser supports it, without a separate compression middleware. Other methods and paths are passed to the next middleware.

To render the page outside Express, `renderTRPCRunner(options)` from `trpc-runner/server` returns a single self-contained HTML page with the assets inlined (about 5.5 MB uncompressed).

## Security

The runner page lists every procedure it can see, with input and output schemas, and lets anyone who can open it call them. Treat it like an admin tool:

- Mount it only in development or behind your own authentication, for example `if (process.env.NODE_ENV !== "production") app.use("/runner", ...)`.
- Use `include`/`exclude` to hide procedures that should not be listed.
- Auth headers entered in the runner are stored in the browser's local storage for that runner.

## Options

```ts
type TRPCRunnerOptions = {
  router: AnyTRPCRouter;
  endpoint: string;
  title?: string;
  description?: string;
  transformer?: "superjson";
  cache?: boolean;
  include?: string[];
  exclude?: string[];
  logParseWarnings?: boolean;
  defaultTheme?: "light" | "dark";
};
```

- `router`: tRPC router to inspect.
- `endpoint`: HTTP endpoint the runner should call when executing procedures.
- `title`: page title and runner title metadata. Defaults to `tRPC Runner`.
- `description`: optional runner description metadata.
- `transformer`: set to `"superjson"` when the tRPC endpoint uses SuperJSON.
- `cache`: cache the generated router manifest and the built client assets between requests. Each mounted runner keeps its own manifest. Assets are always kept in memory in production.
- `include`: only show matching procedure paths. Supports exact paths and trailing `*` prefixes.
- `exclude`: hide matching procedure paths. Supports exact paths and trailing `*` prefixes.
- `logParseWarnings`: log schema/procedure parse warnings to the server console.
- `defaultTheme`: initial theme before the browser has stored a preference.

Example with filtering:

```ts
app.use(
  "/runner",
  createTRPCRunner({
    router: appRouter,
    endpoint: "/trpc",
    transformer: "superjson",
    title: "Internal API Runner",
    include: ["users.*", "health"],
    exclude: ["users.delete"],
    defaultTheme: "dark",
  }),
);
```

## Schema Support

The generated form and docs inspect Zod 3 and Zod 4 schemas from tRPC procedure inputs and outputs. Supported metadata includes:

- Objects
- Arrays
- Strings
- Numbers
- BigInts (edited as whole-number strings and sent as `BigInt` with `transformer: "superjson"`; without superjson they are sent as strings, so use `z.coerce.bigint()`)
- Booleans
- Enums and native enums
- Literals, including Zod 4 multi-value literals
- Any and unknown
- Optional fields
- Nullable fields
- Default values
- Descriptions
- Effects, pipes, and Zod 4 transforms (the form uses the input side)
- Branded, readonly, and catch wrappers
- Chained `.input()` object schemas, merged into one form

Unsupported input shapes, such as dates, unions, records, tuples, and numeric TypeScript enums, remain runnable through the Raw JSON tab. Subscriptions are discovered and labeled but are not runnable yet.

## Local Development

Install dependencies and build the package once:

```sh
pnpm install
pnpm run build
```

Run the smoke-test app:

```sh
pnpm --filter @trpc-runner/example-server dev
```

Open `http://localhost:9999/runner` in a browser. If port `9999` is busy, set another one, for example `PORT=3888 pnpm --filter @trpc-runner/example-server dev`.

The example router covers the main runner features: `users.*` and `posts.search` use Zod 3 schemas with enums, defaults, and descriptions, and `debug.echo` uses Zod 4 with a chained `.input()`, a BigInt field sent through superjson, and a free-form JSON field.

For live client UI development, also run the client bundle watcher in a separate terminal:

```sh
pnpm --filter trpc-runner dev:client
```

Then refresh `/runner` after editing files in `packages/trpc-runner/src/client`.

`apps/example-server` imports `trpc-runner/express` through the package export, so it serves built assets from `packages/trpc-runner/dist`. Client edits are visible after `dev:client` rebuilds `dist/client/runner.js` and `dist/client/runner.css`; the refreshed page picks up the new content-hashed asset URLs without a server restart. Server-side package edits still require a rebuild and one `pnpm dev` restart.

Use `pnpm run build` rather than `build:server` on its own: the server build cleans all of `dist`, including the built client.

The repository also includes `.claude/launch.json`, which lets the Claude Code desktop app start the example server on port `3888` for its preview browser.

## Validation

Run the main checks from the repo root:

```sh
pnpm run format
pnpm run lint
pnpm --filter trpc-runner typecheck
pnpm run build
pnpm test
```

Build before running the tests: the rendering and bundle tests read the built client in `packages/trpc-runner/dist/client`. The bundle tests check that it contains only `runner.js` and `runner.css`, inlines Monaco's workers, bundles its fonts, and has no browser-unsafe `process` references.

Client tests run in jsdom with Testing Library. For a coverage report (a text summary plus `packages/trpc-runner/coverage/index.html`), run:

```sh
pnpm --filter trpc-runner test:coverage
```
