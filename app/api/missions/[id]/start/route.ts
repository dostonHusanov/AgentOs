import { after } from "next/server";
import { getMission, publicMission } from "@/lib/mission/store";
import { executeMission } from "@/lib/mission/executor";
import { authorize, apiError } from "@/lib/api";
export const runtime = "nodejs";
export const maxDuration = 800;
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const m = getMission((await params).id);
    authorize(request, m);
    if (m.status === "created") after(() => executeMission(m));
    return Response.json(publicMission(m), { status: 202 });
  } catch (e) {
    return apiError(e);
  }
}
