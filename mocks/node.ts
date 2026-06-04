/**
 * MSW node server for Vitest component tests (TRD §6, §8.2).
 * Lifecycle (listen/reset/close) is wired in `vitest.setup.ts`.
 */

import { setupServer } from "msw/node";
import { handlers } from "./handlers";

export const server = setupServer(...handlers);
