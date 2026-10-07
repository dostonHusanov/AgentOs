import { join } from "node:path";
import { authorize } from "@/lib/api";
import { getMission, publicMission } from "@/lib/mission/store";
import { MissionVault } from "@/mcp/vault";
import { browserCredential } from "@/mcp/browser-access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const id = (await params).id;
    const credential = browserCredential(
      request,
      id,
      new MissionVault(join(process.cwd(), ".agentos", "mcp")),
    );
    const mission = getMission(id);
    authorize(
      new Request(request.url, {
        headers: { authorization: `Bearer ${credential.accessToken}` },
      }),
      mission,
    );
    return Response.json(publicMission(mission), {
      headers: {
        "Cache-Control": "no-store",
        "Cross-Origin-Resource-Policy": "same-origin",
      },
    });
  } catch {
    return Response.json(
      {
        error:
          "MCP mission is unavailable. Use the loopback dashboard link returned by MCP on this computer.",
      },
      { status: 403, headers: { "Cache-Control": "no-store" } },
    );
  }
}
