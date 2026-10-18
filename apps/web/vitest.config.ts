import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { defineConfig } from "vitest/config";

const root = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  esbuild: {
    // Match Next.js: automatic JSX runtime so component tests need no React import.
    jsx: "automatic",
  },
  resolve: {
    alias: {
      "@": resolve(root, "src"),
    },
  },
  test: {
    include: ["src/**/*.test.{ts,tsx}"],
    // The API integration files intentionally share biocatalyst_web_test.
    // Run files serially so one suite's cleanup cannot delete another
    // suite's users or sessions mid-request.
    fileParallelism: false,
  },
});
