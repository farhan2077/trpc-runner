import { randomUUID } from "node:crypto";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import express from "express";
import { createTRPCRunner } from "trpc-runner/express";
import { appRouter } from "./router";

const app = express();
const port = Number(process.env.PORT ?? 9999);

app.use(
  "/trpc",
  createExpressMiddleware({
    router: appRouter,
    createContext: () => ({
      requestId: randomUUID(),
    }),
  }),
);

app.use(
  "/runner",
  createTRPCRunner({
    router: appRouter,
    endpoint: "/trpc",
    transformer: "superjson",
    title: "Example API Runner",
    description: "Local tRPC runner test",
    logParseWarnings: true,
  }),
);

app.get("/", (_req, res) => {
  res.type("html").send(`<a href="/runner" style="font-family: sans-serif;">Open tRPC Runner</a>`);
});

app.listen(port, () => {
  console.log(`trpc-runner example server: http://localhost:${port}/runner`);
});
