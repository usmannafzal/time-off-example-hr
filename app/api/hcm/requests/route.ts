import { handleCreateRequest, handleGetRequests } from "@/mocks/service";

export const dynamic = "force-dynamic";

export function GET(request: Request) {
  return handleGetRequests(request);
}

export function POST(request: Request) {
  return handleCreateRequest(request);
}
