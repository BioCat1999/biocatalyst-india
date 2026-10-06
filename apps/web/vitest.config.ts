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
  },
});
