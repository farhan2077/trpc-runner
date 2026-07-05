import type { AnyTRPCRouter } from "@trpc/server";
import { renderTRPCRunner } from "./server/render";
import type { TRPCRunnerOptions } from "./types";

type RunnerRequest = {
  method?: string;
  path?: string;
  url?: string;
};

type RunnerResponse = {
  status: (code: number) => RunnerResponse;
  type?: (type: string) => RunnerResponse;
  setHeader?: (name: string, value: string) => void;
  send: (body: string) => void;
};

type NextFunction = () => void;

export function createTRPCRunner<TRouter extends AnyTRPCRouter = AnyTRPCRouter>(
  options: TRPCRunnerOptions<TRouter>,
) {
  return function trpcRunnerMiddleware(
    req: RunnerRequest,
    res: RunnerResponse,
    next?: NextFunction,
  ) {
    if (req.method && req.method !== "GET") {
      next?.();
      return;
    }

    const path = normalizePath(req.path ?? req.url ?? "/");
    if (path !== "/" && path !== "") {
      next?.();
      return;
    }

    const html = renderTRPCRunner(options);
    res.status(200);
    if (res.type) {
      res.type("html");
    } else {
      res.setHeader?.("Content-Type", "text/html; charset=utf-8");
    }
    res.send(html);
  };
}

function normalizePath(path: string) {
  return path.split("?")[0]?.replace(/\/+$/, "") || "/";
}
