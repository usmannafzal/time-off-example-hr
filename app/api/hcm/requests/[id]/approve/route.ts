import { handleApproveRequest } from "@/mocks/service";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  return handleApproveRequest(request, id);
}
