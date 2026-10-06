import { discoverAgents } from "@/lib/agents/discovery";
import { apiError } from "@/lib/api";
export async function GET(request: Request) {
  try {
    return Response.json(
      await discoverAgents(
        new URL(request.url).searchParams.get("capability") ?? undefined,
      ),
    );
  } catch (e) {
    return apiError(e);
  }
}
