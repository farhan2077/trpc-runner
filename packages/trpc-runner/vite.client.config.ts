import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { resolve } from "path";
import { defineConfig, type Plugin } from "vite";

/**
 * Monaco's JSON language creates its worker with
 * `new Worker(new URL("json.worker.js", import.meta.url))`, bypassing
 * `MonacoEnvironment`'s fallback path. Vite would emit that as a separate `assets/*.js`
 * file, which the runner does not serve (it serves only runner.js and runner.css), so
 * rewrite it to an inlined worker. The build fails loudly if a Monaco upgrade changes the
 * pattern; `vite.client.config.test.ts` checks it against the installed Monaco.
 */
export function inlineMonacoJsonWorker(): Plugin {
  const workerManager = "/monaco-editor/esm/vs/language/json/workerManager.js";
  const workerCall = `new Worker(new URL('json.worker.js', import.meta.url), { type: "module" })`;
  return {
    name: "trpc-runner:inline-monaco-json-worker",
    enforce: "pre",
    transform(code, id) {
      if (!id.replaceAll("\\", "/").endsWith(workerManager)) return;
      if (!code.includes(workerCall)) {
        this.error(`Monaco JSON worker creation changed in ${id}; update inlineMonacoJsonWorker.`);
      }
      return (
        `import TRPCRunnerJsonWorker from "./json.worker.js?worker&inline";\n` +
        code.replace(workerCall, "new TRPCRunnerJsonWorker()")
      );
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), inlineMonacoJsonWorker()],
  define: {
    process: JSON.stringify({
      env: {
        LOG: "",
        NODE_ENV: "production",
      },
    }),
    "process.env.NODE_ENV": JSON.stringify("production"),
    "process.env.LOG": JSON.stringify(""),
  },
  resolve: {
    alias: {
      "@": resolve(__dirname, "src/client"),
    },
  },
  build: {
    outDir: "dist/client",
    emptyOutDir: true,
    cssCodeSplit: false,
    lib: {
      entry: "src/client/main.tsx",
      name: "TRPCRunnerClient",
      formats: ["iife"],
      fileName: () => "runner.js",
    },
    rollupOptions: {
      output: {
        assetFileNames: "runner.[ext]",
      },
    },
  },
});
