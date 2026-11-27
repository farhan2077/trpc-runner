import { loader } from "@monaco-editor/react";
// The editor API plus JSON language support. This skips the ~70 other languages (and
// the CSS/HTML/TypeScript workers) in `editor.main`. Monaco 0.55's JSON language
// modules import the standard editor contributions themselves, so those cannot be
// trimmed further without forking Monaco's JSON registration.
import * as monaco from "monaco-editor/esm/vs/editor/editor.api.js";
import "monaco-editor/esm/vs/language/json/monaco.contribution.js";
import EditorWorker from "monaco-editor/esm/vs/editor/editor.worker.js?worker&inline";
import JsonWorker from "monaco-editor/esm/vs/language/json/json.worker.js?worker&inline";

/**
 * Points @monaco-editor/react at the bundled Monaco instead of its default jsDelivr
 * CDN. This is an explicit call rather than a side-effect import because the package's
 * `sideEffects` field lets the bundler drop side-effect-only modules.
 *
 * `MonacoEnvironment.getWorker` takes precedence over the worker Monaco's JSON language
 * would create itself, so it must route the `json` label to the JSON language worker.
 * (`vite.client.config.ts` also rewrites Monaco's own fallback to this same inlined
 * worker, so the build emits no separate worker file.)
 */
export function configureMonaco() {
  // Workers are inlined as blob URLs so the runner needs no extra asset routes.
  self.MonacoEnvironment = {
    getWorker: (_workerId, label) => (label === "json" ? new JsonWorker() : new EditorWorker()),
  };
  loader.config({ monaco });
}
