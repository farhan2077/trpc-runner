import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": resolve(__dirname, "src/client"),
    },
  },
  test: {
    // Server tests run in Node; client tests opt into jsdom with a
    // `// @vitest-environment jsdom` comment at the top of the file.
    environment: "node",
    coverage: {
      provider: "v8",
      include: ["src/**/*.{ts,tsx}", "vite.client.config.ts"],
      exclude: ["**/*.test.{ts,tsx}", "src/**/*.d.ts", "src/client/components/ui/**"],
      reporter: ["text", "html"],
    },
  },
});
