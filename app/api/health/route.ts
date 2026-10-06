import { checkHealth } from "@/lib/health";
import { apiError } from "@/lib/api";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    return Response.json(await checkHealth());
  } catch (e) {
    return apiError(e);
  }
}
