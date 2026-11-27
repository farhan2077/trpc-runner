import fs from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// Regression checks on the built client (run `pnpm run build` first, as for the render
// tests). They guard properties the runtime depends on but unit tests cannot see.
const clientDir = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "dist", "client");
const read = (file: string) => fs.readFileSync(join(clientDir, file), "utf8");

describe("built client bundle", () => {
  it("contains only runner.js and runner.css, which is all the middleware serves", () => {
    expect(fs.readdirSync(clientDir).sort()).toEqual(["runner.css", "runner.js"]);
  });

  it("inlines Monaco's workers instead of referencing separate worker files", () => {
    const js = read("runner.js");
    expect(js).not.toMatch(/new URL\(["'][^"']*\.worker[^"']*\.js["']/);
    expect(js).not.toMatch(/["']\/?assets\/[^"']*worker/);
  });

  it("keeps the Monaco setup that replaces the CDN loader", () => {
    expect(read("runner.js")).toContain("MonacoEnvironment");
  });

  it("bundles fonts instead of loading them from a font host", () => {
    const css = read("runner.css");
    expect(css).not.toContain("fonts.googleapis.com");
    expect(css).not.toContain("fonts.gstatic.com");
    expect(css).toMatch(/font-family:\s*"?Inter"?/);
    expect(css).toMatch(/font-family:\s*"?JetBrains Mono"?/);
    expect(css).toContain("data:font/woff2;base64,");
  });

  it("has no browser-unsafe `process` references", () => {
    const js = read("runner.js");
    expect(js.match(/process\.env|(?<![.\w"'-])process\b(?!["'-])/g)).toBeNull();
  });
});
