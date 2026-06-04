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
    coverage: {
      provider: "v8",
      reporter: ["text", "text-summary", "html", "lcov"],
      reportsDirectory: "./coverage",
      // Only measure the application logic these tests are meant to guard.
      include: ["lib/**", "components/**", "mocks/**", "app/**"],
      exclude: [
        "**/*.d.ts",
        "**/*.stories.{ts,tsx}",
        "app/**/layout.tsx",
        "app/**/page.tsx",
        "app/globals.css",
      ],
    },
  },
});
