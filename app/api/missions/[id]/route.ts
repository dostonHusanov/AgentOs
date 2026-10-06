import { getMission, publicMission } from "@/lib/mission/store";
import { authorize, apiError } from "@/lib/api";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const m = getMission((await params).id);
    authorize(request, m);
    return Response.json(publicMission(m));
  } catch (e) {
    return apiError(e);
  }
}
