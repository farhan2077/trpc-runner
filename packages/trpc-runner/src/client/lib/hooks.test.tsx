// @vitest-environment jsdom
import { StrictMode, type ReactNode } from "react";
import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { RunnerBootData } from "../../types";
import { getRunnerStorageKeys, useLocalStorage } from "./hooks";

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

function bootData(endpoint: string, title: string): RunnerBootData {
  return {
    manifest: {
      title,
      procedures: [],
      tree: { name: "", path: [], children: [], procedures: [] },
      warnings: [],
    },
    options: { endpoint },
  };
}

describe("getRunnerStorageKeys", () => {
  it("scopes header and history keys to the page path, endpoint, and title", () => {
    expect(getRunnerStorageKeys("/runner", bootData("/trpc", "Example"))).toEqual({
      headers: "trpc-runner.headers:/runner|/trpc|Example",
      history: "trpc-runner.history:/runner|/trpc|Example",
    });
  });

  it("ignores trailing slashes on the page path", () => {
    const boot = bootData("/trpc", "Example");
    expect(getRunnerStorageKeys("/runner/", boot)).toEqual(getRunnerStorageKeys("/runner", boot));
    expect(getRunnerStorageKeys("/", boot).headers).toBe("trpc-runner.headers:/|/trpc|Example");
  });

  it("gives different runners on the same origin different keys", () => {
    const keys = [
      getRunnerStorageKeys("/runner", bootData("/trpc", "Project A")),
      getRunnerStorageKeys("/runner", bootData("/trpc", "Project B")),
      getRunnerStorageKeys("/runner", bootData("/api/trpc", "Project A")),
      getRunnerStorageKeys("/admin/runner", bootData("/trpc", "Project A")),
    ].map((key) => key.headers);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe("useLocalStorage", () => {
  it("returns the initial value when nothing is stored, without writing it", () => {
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    const { result } = renderHook(() => useLocalStorage("key", { a: 1 }));

    expect(result.current[0]).toEqual({ a: 1 });
    expect(setItem).not.toHaveBeenCalled();
    expect(localStorage.getItem("key")).toBeNull();
  });

  it("reads a stored value", () => {
    localStorage.setItem("key", JSON.stringify(["stored"]));
    const { result } = renderHook(() => useLocalStorage<string[]>("key", []));

    expect(result.current[0]).toEqual(["stored"]);
  });

  it("falls back to the initial value for invalid JSON", () => {
    localStorage.setItem("key", "{not json");
    const { result } = renderHook(() => useLocalStorage("key", "fallback"));

    expect(result.current[0]).toBe("fallback");
  });

  it("falls back to the initial value when storage cannot be read", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("denied");
    });
    const { result } = renderHook(() => useLocalStorage("key", "fallback"));

    expect(result.current[0]).toBe("fallback");
  });

  it("persists direct and functional updates", () => {
    const { result } = renderHook(() => useLocalStorage("count", 0));

    act(() => result.current[1](5));
    expect(result.current[0]).toBe(5);
    expect(localStorage.getItem("count")).toBe("5");

    act(() => result.current[1]((current) => current + 1));
    expect(result.current[0]).toBe(6);
    expect(localStorage.getItem("count")).toBe("6");
  });

  it("keeps the setter stable across renders", () => {
    const { result, rerender } = renderHook(() => useLocalStorage("count", 0));
    const setter = result.current[1];

    act(() => setter(1));
    rerender();

    expect(result.current[1]).toBe(setter);
  });

  it("applies functional updates once under StrictMode", () => {
    const wrapper = ({ children }: { children: ReactNode }) => <StrictMode>{children}</StrictMode>;
    const { result } = renderHook(() => useLocalStorage<string[]>("items", []), { wrapper });

    act(() => result.current[1]((items) => [...items, "a"]));

    expect(result.current[0]).toEqual(["a"]);
    expect(JSON.parse(localStorage.getItem("items")!)).toEqual(["a"]);
  });

  it("keeps working when storage writes fail", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("quota exceeded");
    });
    const { result } = renderHook(() => useLocalStorage("count", 0));

    expect(() => act(() => result.current[1](2))).not.toThrow();
    expect(result.current[0]).toBe(2);
  });
});
