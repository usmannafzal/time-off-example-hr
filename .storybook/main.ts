import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import tsconfigPaths from "vite-tsconfig-paths";
import type { StorybookConfig } from "@storybook/react-vite";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const config: StorybookConfig = {
  stories: ["../stories/**/*.stories.@(ts|tsx)"],
  addons: [
    "@storybook/addon-essentials",
    "@storybook/addon-interactions",
  ],
  framework: {
    name: "@storybook/react-vite",
    options: {},
  },
  staticDirs: ["../public"],
  core: { disableTelemetry: true },
  // Ensure `process.env` exists in the browser bundle so `lib/config.ts`'s
  // `process.env.*` reads fall back to defaults rather than crashing.
  async viteFinal(viteConfig) {
    viteConfig.define = {
      ...viteConfig.define,
      "process.env": viteConfig.define?.["process.env"] ?? {},
    };
    // Resolve the `@/*` path alias the same way the app/tsconfig does.
    viteConfig.plugins = [...(viteConfig.plugins ?? []), tsconfigPaths()];
    viteConfig.resolve = {
      ...viteConfig.resolve,
      alias: {
        ...(viteConfig.resolve?.alias ?? {}),
        "@": projectRoot,
      },
    };
    return viteConfig;
  },
};

export default config;
