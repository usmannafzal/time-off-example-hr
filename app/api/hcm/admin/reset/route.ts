import { handleReset } from "@/mocks/service";

export const dynamic = "force-dynamic";

export function POST() {
  return handleReset();
}
