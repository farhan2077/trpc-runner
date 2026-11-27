// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { RunnerProcedure } from "../../types";
import { DocsPanel } from "./docs-panel";

afterEach(cleanup);

function procedure(overrides: Partial<RunnerProcedure> = {}): RunnerProcedure {
  return {
    name: "echo",
    path: ["debug", "echo"],
    pathLabel: "debug.echo",
    kind: "mutation",
    input: { kind: "object", path: [], children: {} },
    ...overrides,
  };
}

describe("DocsPanel", () => {
  it("documents bigint input fields and their string defaults", () => {
    render(
      <DocsPanel
        procedure={procedure({
          input: {
            kind: "object",
            path: [],
            children: {
              amount: {
                kind: "bigint",
                path: ["amount"],
                label: "amount",
                optional: true,
                defaultValue: "10",
              },
            },
          },
        })}
        response={{ state: "idle" }}
      />,
    );

    expect(screen.getByText("amount")).toBeTruthy();
    expect(screen.getByText("bigint")).toBeTruthy();
    expect(screen.getByText('"10"')).toBeTruthy();
  });

  it("infers bigint fields in an observed output shape", () => {
    render(
      <DocsPanel
        procedure={procedure()}
        response={{
          state: "success",
          data: { total: 12345678901234567890n, label: "x" },
          durationMs: 1,
          sizeBytes: 1,
        }}
      />,
    );

    expect(screen.getByText("observed")).toBeTruthy();
    expect(screen.getByText("total")).toBeTruthy();
    expect(screen.getByText("bigint")).toBeTruthy();
    expect(screen.getByText("label")).toBeTruthy();
  });
});
