import { handleGetBalanceCell } from "@/mocks/service";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ locationId: string }> },
) {
  const { locationId } = await params;
  return handleGetBalanceCell(request, locationId);
}
