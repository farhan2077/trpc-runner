import Editor, { type EditorProps } from "@monaco-editor/react";
import type { RunnerTheme } from "../../types";
import { cn } from "@/lib/utils";

const sharedOptions: EditorProps["options"] = {
  automaticLayout: true,
  bracketPairColorization: { enabled: true },
  contextmenu: false,
  fixedOverflowWidgets: true,
  fontFamily: '"JetBrains Mono", ui-monospace, monospace',
  fontLigatures: false,
  fontSize: 12,
  lineDecorationsWidth: 10,
  lineNumbersMinChars: 3,
  minimap: { enabled: false },
  padding: { top: 8, bottom: 8 },
  renderLineHighlight: "none",
  scrollBeyondLastLine: false,
  smoothScrolling: true,
  tabSize: 2,
  wordWrap: "on",
};

export function JsonEditor({
  value,
  onChange,
  theme,
  readOnly = false,
  className,
}: {
  value: string;
  onChange?: (value: string) => void;
  theme: RunnerTheme;
  readOnly?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("h-full min-h-64 overflow-hidden", className)}>
      <Editor
        value={value}
        defaultLanguage="json"
        theme={theme === "dark" ? "vs-dark" : "vs-light"}
        height="100%"
        loading={null}
        onChange={(nextValue) => onChange?.(nextValue ?? "")}
        options={{
          ...sharedOptions,
          readOnly,
          domReadOnly: readOnly,
        }}
      />
    </div>
  );
}
