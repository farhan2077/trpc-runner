# trpc-runner

Backend-mounted tRPC procedure runner with a simple UI

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

Visit `/runner` to browse and run query or mutation procedures from your tRPC router. The package serves a complete HTML page with bundled CSS and JavaScript, so consuming apps do not need Tailwind, shadcn, React, or Vite setup.

## License

MIT
