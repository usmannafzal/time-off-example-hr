/**
 * MSW v2 request handlers — the single source of truth for mock HCM behavior,
 * shared by the browser worker (Storybook) and the node server (Vitest)
 * (TRD §6 preamble). Each resolver delegates to the shared service so behavior
 * is identical to the Next.js route handlers used by the running app.
 *
 * The `*` origin wildcard lets the same handlers match both relative requests
 * (browser) and the absolute URLs MSW requires in node.
 */

import { http } from "msw";
import {
  handleAnniversary,
  handleApproveRequest,
  handleCreateRequest,
  handleDenyRequest,
  handleGetBalanceCell,
  handleGetBalances,
  handleGetRequest,
  handleGetRequests,
  handlePatchRequest,
} from "./service";

export const handlers = [
  http.get("*/api/hcm/balances", ({ request }) => handleGetBalances(request)),

  http.get("*/api/hcm/balance/:locationId", ({ request, params }) =>
    handleGetBalanceCell(request, String(params.locationId)),
  ),

  http.get("*/api/hcm/requests", ({ request }) => handleGetRequests(request)),

  http.get("*/api/hcm/requests/:id", ({ request, params }) =>
    handleGetRequest(request, String(params.id)),
  ),

  http.post("*/api/hcm/requests/:id/approve", ({ request, params }) =>
    handleApproveRequest(request, String(params.id)),
  ),

  http.post("*/api/hcm/requests/:id/deny", ({ request, params }) =>
    handleDenyRequest(request, String(params.id)),
  ),

  http.post("*/api/hcm/requests", ({ request }) => handleCreateRequest(request)),

  http.patch("*/api/hcm/requests/:id", ({ request, params }) =>
    handlePatchRequest(request, String(params.id)),
  ),

  http.post("*/api/hcm/admin/anniversary", ({ request }) =>
    handleAnniversary(request),
  ),
];
