import { getMission, event } from "@/lib/mission/store";
import { authorize, apiError } from "@/lib/api";
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const m = getMission((await params).id);
    authorize(request, m);
    if (["completed", "failed"].includes(m.status))
      throw new Error("Mission is terminal");
    m.failNextProvider = true;
    event(
      m,
      "demo_failure_armed",
      "DEMO FAILURE SIMULATION: next research provider will fail after payment",
    );
    return Response.json({ armed: true });
  } catch (e) {
    return apiError(e);
  }
}
