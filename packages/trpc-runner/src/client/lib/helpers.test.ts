import { describe, expect, it } from "vitest";
import type { RunnerInputNode, RunnerObjectNode } from "../../types";
import {
  cleanHeaders,
  defaultValueForNode,
  ensureEmptyHeaderRow,
  formatBytes,
  inputPathKey,
  isBigIntString,
  isRecord,
  normalizeError,
  prepareRequestInput,
  stringifyJson,
  validateRequiredInput,
} from "./helpers";

const objectNode = (children: Record<string, RunnerInputNode>): RunnerObjectNode => ({
  kind: "object",
  path: [],
  children,
});

describe("stringifyJson", () => {
  it("pretty-prints plain JSON", () => {
    expect(stringifyJson({ a: 1 })).toBe('{\n  "a": 1\n}');
  });

  it("renders BigInt, Map, and Set values instead of throwing", () => {
    const value = {
      big: 12345678901234567890n,
      map: new Map([["k", 1]]),
      numericMap: new Map([[1, "one"]]),
      set: new Set(["a", "b"]),
    };
    expect(JSON.parse(stringifyJson(value))).toEqual({
      big: "12345678901234567890n",
      map: { k: 1 },
      numericMap: [[1, "one"]],
      set: ["a", "b"],
    });
  });
});

describe("prepareRequestInput", () => {
  const node = objectNode({
    id: { kind: "bigint", path: ["id"] },
    ids: { kind: "array", path: ["ids"], element: { kind: "bigint", path: ["ids", 0] } },
    name: { kind: "string", path: ["name"] },
  });

  it("converts bigint fields to BigInt when superjson is enabled", () => {
    expect(
      prepareRequestInput(node, { id: " 42 ", ids: ["1", 2], name: "x" }, { superjson: true }),
    ).toEqual({ id: 42n, ids: [1n, 2n], name: "x" });
  });

  it("leaves bigint fields as strings without superjson", () => {
    expect(prepareRequestInput(node, { id: "42", ids: ["1"] }, { superjson: false })).toEqual({
      id: "42",
      ids: ["1"],
    });
  });

  it("leaves invalid bigint strings and unknown keys untouched", () => {
    expect(prepareRequestInput(node, { id: "4.2", extra: "7" }, { superjson: true })).toEqual({
      id: "4.2",
      extra: "7",
    });
  });
});

describe("validateRequiredInput", () => {
  it("reports missing required fields and skips optional ones", () => {
    const node = objectNode({
      name: { kind: "string", path: ["name"] },
      note: { kind: "string", path: ["note"], optional: true },
      count: { kind: "number", path: ["count"] },
    });
    expect(validateRequiredInput(node, { count: Number.NaN })).toEqual({
      name: "Required",
      count: "Required",
    });
  });

  it("validates bigint fields as whole numbers", () => {
    const node = objectNode({ id: { kind: "bigint", path: ["id"] } });
    expect(validateRequiredInput(node, {})).toEqual({ id: "Required" });
    expect(validateRequiredInput(node, { id: "12a" })).toEqual({ id: "Must be a whole number" });
    expect(validateRequiredInput(node, { id: "-12" })).toEqual({});
  });

  it("does not require any/unknown fields marked optional", () => {
    const node = objectNode({ data: { kind: "unknown", path: ["data"], optional: true } });
    expect(validateRequiredInput(node, {})).toEqual({});
  });
});

describe("defaultValueForNode", () => {
  it("collects nested defaults and literal values", () => {
    const node = objectNode({
      limit: { kind: "number", path: ["limit"], defaultValue: 10 },
      type: { kind: "literal", path: ["type"], value: "user" },
      name: { kind: "string", path: ["name"] },
    });
    expect(defaultValueForNode(node)).toEqual({ limit: 10, type: "user" });
  });
});

describe("normalizeError", () => {
  it("keeps tRPC error data", () => {
    const error = Object.assign(new Error("Input validation failed"), {
      name: "TRPCClientError",
      data: { code: "BAD_REQUEST", httpStatus: 400, path: "users.create" },
      shape: { message: "Input validation failed", code: -32600 },
    });
    expect(normalizeError(error)).toMatchObject({
      name: "TRPCClientError",
      message: "Input validation failed",
      data: { code: "BAD_REQUEST", httpStatus: 400, path: "users.create" },
    });
  });

  it("falls back to the error shape when there is no data", () => {
    const error = Object.assign(new Error("Boom"), { shape: { message: "Boom", code: -32603 } });
    expect(normalizeError(error)).toMatchObject({ shape: { code: -32603 } });
  });

  it("normalizes nested causes and passes through non-errors", () => {
    const error = new Error("outer", { cause: new Error("inner") });
    expect(normalizeError(error)).toMatchObject({ cause: { message: "inner" } });
    expect(normalizeError("plain")).toBe("plain");
  });
});

describe("validateRequiredInput edge cases", () => {
  it("requires a value for an empty required object", () => {
    expect(validateRequiredInput(objectNode({}), undefined)).toEqual({ "": "Required" });
    expect(validateRequiredInput(objectNode({}), {})).toEqual({});
  });

  it("validates arrays and their items", () => {
    const node = objectNode({
      tags: {
        kind: "array",
        path: ["tags"],
        element: { kind: "string", path: ["tags", 0] },
      },
    });
    expect(validateRequiredInput(node, {})).toEqual({ tags: "Required" });
    expect(validateRequiredInput(node, { tags: ["a", ""] })).toEqual({ "tags.0": "Required" });
    expect(validateRequiredInput(node, { tags: "not-an-array" })).toEqual({});
  });

  it("handles nullable, enum, boolean, and defaulted fields", () => {
    const node = objectNode({
      maybe: { kind: "string", path: ["maybe"], nullable: true },
      strict: { kind: "string", path: ["strict"] },
      choice: { kind: "enum", path: ["choice"], values: ["a"] },
      flag: { kind: "boolean", path: ["flag"] },
      limit: { kind: "number", path: ["limit"], defaultValue: 10 },
      data: { kind: "unknown", path: ["data"] },
    });
    expect(
      validateRequiredInput(node, { maybe: null, strict: null, choice: "", flag: "yes", data: 1 }),
    ).toEqual({ strict: "Required", choice: "Required", flag: "Required" });
  });

  it("treats non-object values as empty objects", () => {
    const node = objectNode({ name: { kind: "string", path: ["name"] } });
    expect(validateRequiredInput(node, "text")).toEqual({ name: "Required" });
  });
});

describe("prepareRequestInput edge cases", () => {
  it("leaves non-object and non-array values for structured nodes untouched", () => {
    const node = objectNode({ id: { kind: "bigint", path: ["id"] } });
    expect(prepareRequestInput(node, "raw", { superjson: true })).toBe("raw");
    const arrayNode: RunnerInputNode = {
      kind: "array",
      path: [],
      element: { kind: "bigint", path: [0] },
    };
    expect(prepareRequestInput(arrayNode, null, { superjson: true })).toBeNull();
  });

  it("does not convert unsafe integers or non-numeric values", () => {
    const node: RunnerInputNode = { kind: "bigint", path: [] };
    expect(prepareRequestInput(node, 2 ** 60, { superjson: true })).toBe(2 ** 60);
    expect(prepareRequestInput(node, true, { superjson: true })).toBe(true);
  });
});

describe("isBigIntString", () => {
  it.each([
    ["0", true],
    ["-12", true],
    [" 42 ", true],
    ["12345678901234567890", true],
    ["", false],
    ["1.5", false],
    ["1e3", false],
    ["+1", false],
    ["abc", false],
  ])("treats %j as %s", (value, expected) => {
    expect(isBigIntString(value)).toBe(expected);
  });
});

describe("stringifyJson edge cases", () => {
  it("returns undefined for undefined, like JSON.stringify", () => {
    expect(stringifyJson(undefined)).toBeUndefined();
  });

  it("renders nested BigInts in arrays", () => {
    expect(JSON.parse(stringifyJson([1n, { n: -2n }]))).toEqual(["1n", { n: "-2n" }]);
  });
});

describe("small helpers", () => {
  it("builds input path keys", () => {
    expect(inputPathKey({ kind: "string", path: ["users", 0, "name"] })).toBe("users.0.name");
  });

  it("drops headers with blank names", () => {
    expect(cleanHeaders({ Authorization: "Bearer x", " ": "ignored", "": "ignored" })).toEqual({
      Authorization: "Bearer x",
    });
  });

  it("keeps exactly one empty header row", () => {
    const rows = [{ key: "a", value: "b" }];
    expect(ensureEmptyHeaderRow(rows)).toEqual([...rows, { key: "", value: "" }]);
    const withEmpty = [...rows, { key: "", value: "" }];
    expect(ensureEmptyHeaderRow(withEmpty)).toBe(withEmpty);
  });

  it("detects plain records", () => {
    expect(isRecord({})).toBe(true);
    expect(isRecord([])).toBe(false);
    expect(isRecord(null)).toBe(false);
    expect(isRecord("x")).toBe(false);
  });

  it("formats byte sizes", () => {
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(2048)).toBe("2.0 KB");
  });
});
