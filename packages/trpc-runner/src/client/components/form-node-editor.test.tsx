// @vitest-environment jsdom
import { useState } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { RunnerInputNode, RunnerObjectNode } from "../../types";
import { FormNodeEditor } from "./form-node-editor";

afterEach(cleanup);

const objectNode = (children: Record<string, RunnerInputNode>): RunnerObjectNode => ({
  kind: "object",
  path: [],
  children,
});

/** Renders the editor with parent-owned state, like ProcedurePanel does. */
function ControlledEditor({
  node,
  initialValue,
  onChange,
  errors,
}: {
  node: RunnerInputNode;
  initialValue: unknown;
  onChange: (value: unknown) => void;
  errors?: Record<string, string>;
}) {
  const [value, setValue] = useState(initialValue);
  return (
    <>
      <FormNodeEditor
        node={node}
        value={value}
        errors={errors}
        onChange={(next) => {
          setValue(next);
          onChange(next);
        }}
      />
      <button type="button" onClick={() => setValue({ payload: { replaced: true } })}>
        replace externally
      </button>
    </>
  );
}

describe("FormNodeEditor JSON value field", () => {
  const node = objectNode({ payload: { kind: "unknown", path: ["payload"], optional: true } });

  function textarea() {
    return screen.getByPlaceholderText("JSON value") as HTMLTextAreaElement;
  }

  it("keeps partially typed JSON as a draft and reports it as invalid", () => {
    const onChange = vi.fn();
    render(<ControlledEditor node={node} initialValue={{}} onChange={onChange} />);

    fireEvent.change(textarea(), { target: { value: '{"a":' } });

    expect(textarea().value).toBe('{"a":');
    expect(screen.getByRole("alert").textContent).toBe("Invalid JSON");
    expect(onChange).not.toHaveBeenCalled();
  });

  it("emits the parsed value once the JSON is valid", () => {
    const onChange = vi.fn();
    render(<ControlledEditor node={node} initialValue={{}} onChange={onChange} />);

    fireEvent.change(textarea(), { target: { value: '{"a":' } });
    fireEvent.change(textarea(), { target: { value: '{"a": [1, true, null]}' } });

    expect(onChange).toHaveBeenLastCalledWith({ payload: { a: [1, true, null] } });
    expect(screen.queryByRole("alert")).toBeNull();
    // The user's own formatting is kept rather than re-serialized.
    expect(textarea().value).toBe('{"a": [1, true, null]}');
  });

  it("emits undefined when cleared", () => {
    const onChange = vi.fn();
    render(<ControlledEditor node={node} initialValue={{ payload: 1 }} onChange={onChange} />);
    expect(textarea().value).toBe("1");

    fireEvent.change(textarea(), { target: { value: "   " } });

    expect(onChange).toHaveBeenLastCalledWith({ payload: undefined });
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("replaces the draft when the value changes from outside the field", () => {
    render(<ControlledEditor node={node} initialValue={{}} onChange={vi.fn()} />);
    fireEvent.change(textarea(), { target: { value: "{bad" } });

    fireEvent.click(screen.getByText("replace externally"));

    expect(textarea().value).toBe('{\n  "replaced": true\n}');
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("shows validation errors from the parent", () => {
    render(
      <ControlledEditor
        node={node}
        initialValue={{}}
        onChange={vi.fn()}
        errors={{ payload: "Required" }}
      />,
    );

    expect(screen.getByRole("alert").textContent).toBe("Required");
  });
});

describe("FormNodeEditor bigint field", () => {
  const node = objectNode({ amount: { kind: "bigint", path: ["amount"] } });

  function input() {
    return screen.getByPlaceholderText("0") as HTMLInputElement;
  }

  it("edits the value as a string", () => {
    const onChange = vi.fn();
    render(<ControlledEditor node={node} initialValue={{}} onChange={onChange} />);

    fireEvent.change(input(), { target: { value: "9007199254740993" } });

    expect(onChange).toHaveBeenLastCalledWith({ amount: "9007199254740993" });
    expect(input().value).toBe("9007199254740993");
    expect(input().inputMode).toBe("numeric");
  });

  it("emits undefined when cleared", () => {
    const onChange = vi.fn();
    render(<ControlledEditor node={node} initialValue={{ amount: "5" }} onChange={onChange} />);

    fireEvent.change(input(), { target: { value: "" } });

    expect(onChange).toHaveBeenLastCalledWith({ amount: undefined });
  });

  it("displays non-string values, such as numbers from raw JSON", () => {
    render(<ControlledEditor node={node} initialValue={{ amount: 42 }} onChange={vi.fn()} />);

    expect(input().value).toBe("42");
  });

  it("shows validation errors", () => {
    render(
      <ControlledEditor
        node={node}
        initialValue={{ amount: "1.5" }}
        onChange={vi.fn()}
        errors={{ amount: "Must be a whole number" }}
      />,
    );

    expect(screen.getByRole("alert").textContent).toBe("Must be a whole number");
    expect(input().getAttribute("aria-invalid")).toBe("true");
  });
});
