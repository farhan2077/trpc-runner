import { defineConfig } from "tsdown/config";

export default defineConfig({
  entry: ["src/express.ts", "src/server.ts", "src/types.ts"],
  format: "esm",
  dts: true,
  clean: true,
  outDir: "dist",
  fixedExtension: false,
});
