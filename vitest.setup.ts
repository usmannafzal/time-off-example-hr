import "@testing-library/jest-dom/vitest";
import { afterAll, afterEach, beforeAll } from "vitest";
import { cleanup } from "@testing-library/react";
import { server } from "./mocks/node";
import { resetStore } from "./mocks/store";

// Start the MSW node server once for the whole component-test suite.
// Handlers are the single source of truth shared with Storybook (TRD §6).
beforeAll(() => server.listen({ onUnhandledRequest: "error" }));

// Reset request handlers and the in-memory HCM store between tests so each
// test is fully deterministic (TRD §6.3).
afterEach(() => {
  cleanup();
  server.resetHandlers();
  resetStore();
});

afterAll(() => server.close());
