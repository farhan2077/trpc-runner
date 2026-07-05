# trpc-runner

Backend-mounted tRPC procedure runner with a bundled React UI.

`trpc-runner` lets an Express/tRPC backend expose an internal procedure runner at a route such as `/runner`. The runner serves a complete HTML page from the backend route, with the client CSS and JavaScript already bundled into the package.

Consumers do not need to configure Tailwind, shadcn, Vite, React, or any app-level CSS setup.

## Features

- Inspect query, mutation, and subscription procedures from a tRPC router.
- Run query and mutation procedures against a configured tRPC endpoint.
- Use generated form inputs for supported Zod input schemas.
- Fall back to raw JSON input for unsupported or advanced schemas.
- Edit raw JSON and inspect responses with a Monaco-backed JSON editor.
- Browse input and output schema docs, including observed output shapes after successful runs when no output parser is configured.
- Keep multiple procedures open in URL-backed tabs.
- Store auth headers, theme, layout, and successful input history locally in the browser.
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

The middleware responds to `GET /` for the mounted route and passes other methods or nested paths to the next middleware.

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
- `cache`: cache generated HTML and built client assets between requests.
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

The generated form and docs currently inspect Zod-like schemas from tRPC procedure inputs and outputs. Supported metadata includes:

- Objects
- Arrays
- Strings
- Numbers and bigints
- Booleans
- Enums and native enums
- Literals
- Any and unknown
- Optional fields
- Nullable fields
- Default values
- Descriptions
- Effects
- Branded wrappers
- Readonly wrappers

Unsupported input shapes remain runnable through the Raw JSON tab. Subscriptions are discovered and labeled but are not runnable yet.

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

Open `http://localhost:9999/runner` in browser

For live client UI development, also run the client bundle watcher in separate terminals:

```sh
pnpm --filter trpc-runner dev:client
```

Then refresh `/runner` after editing files in `packages/trpc-runner/src/client`.

`apps/example-server` imports `trpc-runner/express` through the package export, so it serves built assets from `packages/trpc-runner/dist`. Client edits are visible after `dev:client` rebuilds `dist/client/runner.js` and `dist/client/runner.css`. Server-side package edits still require a rebuild and one `pnpm dev` restart.

## Validation

Run the main checks from the repo root:

```sh
pnpm run format
pnpm run lint
pnpm --filter trpc-runner typecheck
pnpm test
pnpm run build
```
