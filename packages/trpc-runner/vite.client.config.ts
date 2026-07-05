import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { resolve } from "path";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
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
