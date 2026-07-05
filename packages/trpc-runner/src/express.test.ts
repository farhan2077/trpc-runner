import { describe, expect, it, vi } from "vitest";
import { createTRPCRunner } from "./express";

vi.mock("./server/render", () => ({
  renderTRPCRunner: () => "<html>mock</html>",
}));

interface MockResponse {
  status: (code: number) => MockResponse;
  type?: (type: string) => MockResponse;
  setHeader: (name: string, value: string) => void;
  send: (body: string) => void;
}

function mockResponse(): MockResponse {
  const status = vi.fn();
  const type = vi.fn();
  const setHeader = vi.fn();
  const send = vi.fn();
  const res: MockResponse = { status, type, setHeader, send };
  status.mockReturnValue(res);
  type.mockReturnValue(res);
  return res;
}

describe("createTRPCRunner middleware", () => {
  it("returns HTML for GET request to root path", () => {
    const middleware = createTRPCRunner({ router: {} as never, endpoint: "/trpc" });
    const req = { method: "GET", path: "/" };
    const res = mockResponse();
    const next = vi.fn();

    middleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.type).toHaveBeenCalledWith("html");
    expect(res.send).toHaveBeenCalledWith("<html>mock</html>");
    expect(next).not.toHaveBeenCalled();
  });

  it("calls next for non-GET requests", () => {
    const middleware = createTRPCRunner({ router: {} as never, endpoint: "/trpc" });
    const req = { method: "POST", path: "/" };
    const res = mockResponse();
    const next = vi.fn();

    middleware(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(res.send).not.toHaveBeenCalled();
  });

  it("calls next for non-root path", () => {
    const middleware = createTRPCRunner({ router: {} as never, endpoint: "/trpc" });
    const req = { method: "GET", path: "/some/deep/path" };
    const res = mockResponse();
    const next = vi.fn();

    middleware(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(res.send).not.toHaveBeenCalled();
  });

  it("uses url as fallback when path is undefined", () => {
    const middleware = createTRPCRunner({ router: {} as never, endpoint: "/trpc" });
    const req = { method: "GET", url: "/" };
    const res = mockResponse();
    const next = vi.fn();

    middleware(req, res, next);

    expect(res.send).toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });

  it("normalizes path by stripping query string and trailing slashes", () => {
    const middleware = createTRPCRunner({ router: {} as never, endpoint: "/trpc" });
    const req = { method: "GET", path: "/?foo=bar" };
    const res = mockResponse();
    const next = vi.fn();

    middleware(req, res, next);

    expect(res.send).toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });

  it("handles path with trailing slashes", () => {
    const middleware = createTRPCRunner({ router: {} as never, endpoint: "/trpc" });
    const req = { method: "GET", path: "///" };
    const res = mockResponse();
    const next = vi.fn();

    middleware(req, res, next);

    expect(res.send).toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });

  it("uses setHeader fallback when res.type is not available (connect-style)", () => {
    const middleware = createTRPCRunner({ router: {} as never, endpoint: "/trpc" });
    const req = { method: "GET", path: "/" };
    const res = mockResponse();
    delete res.type;
    const next = vi.fn();

    middleware(req, res, next);

    expect(res.setHeader).toHaveBeenCalledWith("Content-Type", "text/html; charset=utf-8");
    expect(res.send).toHaveBeenCalled();
  });

  it("works without next function", () => {
    const middleware = createTRPCRunner({ router: {} as never, endpoint: "/trpc" });
    const req = { method: "GET", path: "/" };
    const res = mockResponse();

    expect(() => middleware(req, res)).not.toThrow();
    expect(res.send).toHaveBeenCalled();
  });

  it("does not crash when next is omitted for non-root path", () => {
    const middleware = createTRPCRunner({ router: {} as never, endpoint: "/trpc" });
    const req = { method: "GET", path: "/other" };
    const res = mockResponse();

    expect(() => middleware(req, res)).not.toThrow();
    expect(res.send).not.toHaveBeenCalled();
  });
});
