import { handleAnniversary } from "@/mocks/service";

export const dynamic = "force-dynamic";

export function POST(request: Request) {
  return handleAnniversary(request);
}
