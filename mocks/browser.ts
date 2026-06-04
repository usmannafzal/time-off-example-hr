/**
 * MSW browser worker for Storybook (and optional in-app dev mocking)
 * (TRD §6). Storybook's MSW addon starts this worker; per-story handlers can
 * override these defaults to simulate specific HCM behaviors (TRD §7).
 */

import { setupWorker } from "msw/browser";
import { handlers } from "./handlers";

export const worker = setupWorker(...handlers);
