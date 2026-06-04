import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths(), react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./vitest.setup.ts"],
    // Storybook stories and Playwright specs are run by their own runners.
    include: ["tests/components/**/*.{test,spec}.{ts,tsx}"],
    exclude: ["node_modules", ".next", "tests/integration/**"],
  },
});
