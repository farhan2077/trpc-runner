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

Visit `/runner` to browse and run query or mutation procedures from your tRPC router. The middleware serves the page and its bundled CSS and JavaScript (compressed, content-hashed, and cached by the browser), so consuming apps do not need Tailwind, shadcn, React, or Vite setup.

## Security

The runner page lists every procedure it can see, with input and output schemas, and lets anyone who can open it call them. Treat it like an admin tool:

- Mount it only in development or behind your own authentication, for example `if (process.env.NODE_ENV !== "production") app.use("/runner", ...)`.
- Use `include`/`exclude` to hide procedures that should not be listed.
- Auth headers entered in the runner are stored in the browser's local storage for that runner.

See the [repository README](https://github.com/farhan2077/trpc-runner#readme) for options and schema support.

## License

MIT
