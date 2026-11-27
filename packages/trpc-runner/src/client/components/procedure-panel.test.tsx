// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RunnerBootData, RunnerProcedure } from "../../types";
import type { ResponseState } from "./result-pane";

const trpc = vi.hoisted(() => {
  // ProcedurePanel reads the boot data when its module loads.
  (window as unknown as { __TRPC_RUNNER_DATA__: RunnerBootData }).__TRPC_RUNNER_DATA__ = {
    manifest: {
      title: "Test",
      procedures: [],
      tree: { name: "", path: [], children: [], procedures: [] },
      warnings: [],
    },
    options: { endpoint: "/trpc", transformer: "superjson" },
  };
  return {
    query: vi.fn(),
    mutation: vi.fn(),
    linkOptions: [] as Record<string, unknown>[],
  };
});

vi.mock("@trpc/client", () => ({
  createTRPCUntypedClient: () => ({ query: trpc.query, mutation: trpc.mutation }),
  httpBatchLink: (options: Record<string, unknown>) => {
    trpc.linkOptions.push(options);
    return options;
  },
}));

// Monaco does not run in jsdom; a textarea exposes the same value/onChange contract.
vi.mock("./json-editor", () => ({
  JsonEditor: ({ value, onChange }: { value: string; onChange?: (value: string) => void }) => (
    <textarea
      data-testid="raw-json"
      value={value}
      onChange={(event) => onChange?.(event.target.value)}
    />
  ),
}));

const { ProcedurePanel } = await import("./procedure-panel");
const superjson = (await import("superjson")).default;

const echoProcedure: RunnerProcedure = {
  name: "echo",
  path: ["debug", "echo"],
  pathLabel: "debug.echo",
  kind: "mutation",
  input: {
    kind: "object",
    path: [],
    children: {
      amount: { kind: "bigint", path: ["amount"], label: "amount" },
      note: { kind: "string", path: ["note"], label: "note", optional: true },
    },
  },
};

function renderPanel(procedure: RunnerProcedure = echoProcedure) {
  const onResponse = vi.fn<(response: ResponseState) => void>();
  const onHistoryAdd = vi.fn();
  render(
    <ProcedurePanel
      procedure={procedure}
      headers={{ Authorization: "Bearer token", " ": "dropped" }}
      theme="light"
      response={{ state: "idle" }}
      history={[]}
      onHistoryAdd={onHistoryAdd}
      onHistoryClear={vi.fn()}
      onResponse={onResponse}
    />,
  );
  return { onResponse, onHistoryAdd };
}

function lastResponse(onResponse: ReturnType<typeof renderPanel>["onResponse"]) {
  return onResponse.mock.calls.at(-1)?.[0];
}

function runButton() {
  return screen.getByRole("button", { name: /Run mutation|Run query/ });
}

function amountInput() {
  return screen.getByPlaceholderText("0") as HTMLInputElement;
}

function openTab(name: string) {
  fireEvent.click(screen.getByRole("tab", { name }));
}

beforeEach(() => {
  trpc.query.mockReset();
  trpc.mutation.mockReset();
  trpc.linkOptions.length = 0;
});

afterEach(cleanup);

describe("ProcedurePanel runs", () => {
  it("sends bigint fields as BigInt over superjson and stores the JSON-safe input", async () => {
    trpc.mutation.mockResolvedValue({ amount: 9007199254740993n });
    const { onResponse, onHistoryAdd } = renderPanel();

    fireEvent.change(amountInput(), { target: { value: "9007199254740993" } });
    fireEvent.click(runButton());

    await waitFor(() => expect(lastResponse(onResponse)?.state).toBe("success"));
    expect(trpc.mutation).toHaveBeenCalledWith("debug.echo", { amount: 9007199254740993n });
    expect(onHistoryAdd).toHaveBeenCalledWith({ amount: "9007199254740993" });
    expect(lastResponse(onResponse)).toMatchObject({
      state: "success",
      data: { amount: 9007199254740993n },
      sizeBytes: '{\n  "amount": "9007199254740993n"\n}'.length,
    });
  });

  it("configures the link with the endpoint, superjson, and cleaned headers", async () => {
    trpc.mutation.mockResolvedValue(null);
    const { onResponse } = renderPanel();

    fireEvent.change(amountInput(), { target: { value: "1" } });
    fireEvent.click(runButton());

    await waitFor(() => expect(lastResponse(onResponse)?.state).toBe("success"));
    const link = trpc.linkOptions[0] as {
      url: string;
      transformer: unknown;
      headers: () => unknown;
    };
    expect(link.url).toBe("/trpc");
    expect(link.transformer).toBe(superjson);
    expect(link.headers()).toEqual({ Authorization: "Bearer token" });
  });

  it("reports an empty response body as zero bytes", async () => {
    trpc.mutation.mockResolvedValue(undefined);
    const { onResponse } = renderPanel();

    fireEvent.change(amountInput(), { target: { value: "1" } });
    fireEvent.click(runButton());

    await waitFor(() => expect(lastResponse(onResponse)?.state).toBe("success"));
    expect(lastResponse(onResponse)).toMatchObject({ sizeBytes: 0 });
  });

  it("blocks the run and shows errors when required fields are invalid", () => {
    renderPanel();

    fireEvent.click(runButton());
    expect(screen.getByRole("alert").textContent).toBe("Required");

    fireEvent.change(amountInput(), { target: { value: "1.5" } });
    fireEvent.click(runButton());
    expect(screen.getByRole("alert").textContent).toBe("Must be a whole number");
    expect(trpc.mutation).not.toHaveBeenCalled();
  });

  it("ignores a slower earlier run once a newer run has finished", async () => {
    let resolveFirst!: (value: unknown) => void;
    trpc.mutation
      .mockImplementationOnce(() => new Promise((resolve) => (resolveFirst = resolve)))
      .mockResolvedValueOnce({ run: "second" });
    const { onResponse, onHistoryAdd } = renderPanel();
    fireEvent.change(amountInput(), { target: { value: "1" } });

    fireEvent.click(runButton());
    fireEvent.click(runButton());
    await waitFor(() =>
      expect(lastResponse(onResponse)).toMatchObject({ data: { run: "second" } }),
    );

    resolveFirst({ run: "first" });
    await waitFor(() => expect(onHistoryAdd).toHaveBeenCalledTimes(2));
    expect(lastResponse(onResponse)).toMatchObject({ data: { run: "second" } });
    expect(
      onResponse.mock.calls.some(([response]) =>
        "data" in response && response.data !== null
          ? (response.data as { run?: string }).run === "first"
          : false,
      ),
    ).toBe(false);
  });

  it("ignores a slower earlier failure once a newer run has finished", async () => {
    let rejectFirst!: (error: unknown) => void;
    trpc.mutation
      .mockImplementationOnce(() => new Promise((_, reject) => (rejectFirst = reject)))
      .mockResolvedValueOnce({ ok: true });
    const { onResponse } = renderPanel();
    fireEvent.change(amountInput(), { target: { value: "1" } });

    fireEvent.click(runButton());
    fireEvent.click(runButton());
    await waitFor(() => expect(lastResponse(onResponse)).toMatchObject({ data: { ok: true } }));

    rejectFirst(new Error("late failure"));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(onResponse.mock.calls.some(([response]) => response.state === "error")).toBe(false);
  });

  it("shows tRPC error data from the server", async () => {
    const error = Object.assign(new Error("Input validation failed"), {
      name: "TRPCClientError",
      data: { code: "BAD_REQUEST", httpStatus: 400 },
    });
    trpc.mutation.mockRejectedValue(error);
    const { onResponse, onHistoryAdd } = renderPanel();

    fireEvent.change(amountInput(), { target: { value: "1" } });
    fireEvent.click(runButton());

    await waitFor(() => expect(lastResponse(onResponse)?.state).toBe("error"));
    expect(lastResponse(onResponse)).toMatchObject({
      state: "error",
      sizeBytes: 0,
      data: {
        name: "TRPCClientError",
        message: "Input validation failed",
        data: { code: "BAD_REQUEST", httpStatus: 400 },
      },
    });
    expect(onHistoryAdd).not.toHaveBeenCalled();
  });

  it("runs queries with the query client method", async () => {
    trpc.query.mockResolvedValue("pong");
    const { onResponse } = renderPanel({
      name: "ping",
      path: ["ping"],
      pathLabel: "ping",
      kind: "query",
      input: { kind: "object", path: [], children: {} },
    });

    fireEvent.click(runButton());

    await waitFor(() => expect(lastResponse(onResponse)?.state).toBe("success"));
    expect(trpc.query).toHaveBeenCalledWith("ping", {});
  });
});

describe("ProcedurePanel Raw JSON", () => {
  function rawEditor() {
    return screen.getByTestId("raw-json") as HTMLTextAreaElement;
  }

  it("syncs valid raw edits back into the generated form", () => {
    renderPanel();
    openTab("Raw JSON");

    fireEvent.change(rawEditor(), { target: { value: '{"amount": "77", "note": "hi"}' } });
    openTab("Body");

    expect(amountInput().value).toBe("77");
    expect((screen.getAllByRole("textbox").at(-1) as HTMLInputElement).value).toBe("hi");
  });

  it("keeps the form unchanged while raw JSON is incomplete", () => {
    renderPanel();
    fireEvent.change(amountInput(), { target: { value: "5" } });
    openTab("Raw JSON");

    expect(() => fireEvent.change(rawEditor(), { target: { value: '{"amount": ' } })).not.toThrow();
    openTab("Body");

    expect(amountInput().value).toBe("5");
  });

  it("converts bigint fields in raw input before sending", async () => {
    trpc.mutation.mockResolvedValue(null);
    const { onResponse, onHistoryAdd } = renderPanel();
    openTab("Raw JSON");

    fireEvent.change(rawEditor(), { target: { value: '{"amount": 12}' } });
    fireEvent.click(runButton());

    await waitFor(() => expect(lastResponse(onResponse)?.state).toBe("success"));
    expect(trpc.mutation).toHaveBeenCalledWith("debug.echo", { amount: 12n });
    expect(onHistoryAdd).toHaveBeenCalledWith({ amount: 12 });
  });

  it("reports invalid raw JSON on run without calling the server", () => {
    renderPanel();
    openTab("Raw JSON");

    fireEvent.change(rawEditor(), { target: { value: "{bad" } });
    fireEvent.click(runButton());

    expect(screen.getByRole("alert").textContent).toMatch(/JSON/);
    expect(trpc.mutation).not.toHaveBeenCalled();
  });

  it("sends raw input unchanged for procedures without a generated form", async () => {
    trpc.mutation.mockResolvedValue(null);
    const { onResponse } = renderPanel({
      ...echoProcedure,
      input: { kind: "unknown", path: [] },
      inputUnsupported: true,
    });

    fireEvent.change(rawEditor(), { target: { value: '{"amount": "12"}' } });
    fireEvent.click(runButton());

    await waitFor(() => expect(lastResponse(onResponse)?.state).toBe("success"));
    expect(trpc.mutation).toHaveBeenCalledWith("debug.echo", { amount: "12" });
  });
});
