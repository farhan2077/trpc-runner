import fs from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { inlineMonacoJsonWorker } from "./vite.client.config";

const workerManagerId = "/project/node_modules/monaco-editor/esm/vs/language/json/workerManager.js";
const workerCall = `new Worker(new URL('json.worker.js', import.meta.url), { type: "module" })`;

function transform(code: string, id: string) {
  const plugin = inlineMonacoJsonWorker();
  const context = {
    error(message: string): never {
      throw new Error(message);
    },
  };
  return (plugin.transform as (this: typeof context, code: string, id: string) => unknown).call(
    context,
    code,
    id,
  );
}

describe("inlineMonacoJsonWorker", () => {
  it("runs before Vite's own worker handling", () => {
    expect(inlineMonacoJsonWorker().enforce).toBe("pre");
  });

  it("ignores other modules", () => {
    expect(transform(`const w = ${workerCall};`, "/project/src/other.js")).toBeUndefined();
  });

  it("rewrites the JSON worker to an inlined worker import", () => {
    const output = transform(`createWorker: () => ${workerCall},`, workerManagerId);

    expect(output).toBe(
      `import TRPCRunnerJsonWorker from "./json.worker.js?worker&inline";\n` +
        "createWorker: () => new TRPCRunnerJsonWorker(),",
    );
  });

  it("matches Windows-style module ids", () => {
    const output = transform(workerCall, workerManagerId.replaceAll("/", "\\"));
    expect(output).toContain("new TRPCRunnerJsonWorker()");
  });

  it("fails the build when Monaco changes how it creates the worker", () => {
    expect(() => transform("createWorker: () => new Worker(url)", workerManagerId)).toThrow(
      "Monaco JSON worker creation changed",
    );
  });

  it("matches the installed Monaco version", () => {
    const require = createRequire(import.meta.url);
    const monacoRoot = dirname(require.resolve("monaco-editor/package.json"));
    const file = join(monacoRoot, "esm/vs/language/json/workerManager.js");

    const output = transform(fs.readFileSync(file, "utf8"), file) as string;

    expect(output).toContain("new TRPCRunnerJsonWorker()");
    expect(output).not.toContain("new URL('json.worker.js'");
  });
});
