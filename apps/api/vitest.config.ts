import swc from "unplugin-swc";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    root: "./",
    include: ["src/**/*.spec.ts", "prisma/**/*.spec.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],
      include: ["src/**/*.ts", "prisma/**/*.ts"],
      exclude: ["src/**/*.spec.ts", "src/main.ts", "prisma/**/*.spec.ts"],
    },
  },
  plugins: [swc.vite({ module: { type: "es6" } })],
});
