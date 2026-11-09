import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  // Vite 8 compiles with Oxc. tsconfig keeps jsx "preserve" for Next.js, so tests need the React runtime here.
  oxc: {
    jsx: { runtime: "automatic" },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    setupFiles: ["./src/tests/setup.ts"],
    css: {
      modules: {
        classNameStrategy: "non-scoped",
      },
    },
  },
});
