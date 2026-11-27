// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  loaderConfig: vi.fn(),
  monaco: { editor: {}, languages: {} },
  EditorWorker: vi.fn(),
  JsonWorker: vi.fn(),
}));

vi.mock("@monaco-editor/react", () => ({ loader: { config: mocks.loaderConfig } }));
vi.mock("monaco-editor/esm/vs/editor/editor.api.js", () => mocks.monaco);
vi.mock("monaco-editor/esm/vs/language/json/monaco.contribution.js", () => ({}));
vi.mock("monaco-editor/esm/vs/editor/editor.worker.js?worker&inline", () => ({
  default: mocks.EditorWorker,
}));
vi.mock("monaco-editor/esm/vs/language/json/json.worker.js?worker&inline", () => ({
  default: mocks.JsonWorker,
}));

const { configureMonaco } = await import("./monaco");

describe("configureMonaco", () => {
  it("points the React loader at the bundled Monaco instead of the CDN", () => {
    configureMonaco();

    expect(mocks.loaderConfig).toHaveBeenCalledWith({ monaco: expect.anything() });
    const { monaco } = mocks.loaderConfig.mock.calls[0]![0] as { monaco: object };
    expect(monaco).toMatchObject({ editor: {}, languages: {} });
  });

  it("routes the json label to the JSON language worker and others to the editor worker", () => {
    configureMonaco();
    const environment = self.MonacoEnvironment!;

    expect(environment.getWorker!("workerMain.js", "json")).toBeInstanceOf(mocks.JsonWorker);
    expect(environment.getWorker!("workerMain.js", "editorWorkerService")).toBeInstanceOf(
      mocks.EditorWorker,
    );
    expect(mocks.JsonWorker).toHaveBeenCalledTimes(1);
    expect(mocks.EditorWorker).toHaveBeenCalledTimes(1);
  });
});
