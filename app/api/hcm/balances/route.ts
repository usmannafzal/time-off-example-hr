import { handleGetBalances } from "@/mocks/service";
import { startAnniversaryScheduler } from "@/mocks/scheduler";

export const dynamic = "force-dynamic";

// Kick the anniversary scheduler on first load of the mock API (TRD §6.2).
startAnniversaryScheduler();

export function GET(request: Request) {
  return handleGetBalances(request);
}
