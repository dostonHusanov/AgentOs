import { join } from "node:path";
import { authorize } from "@/lib/api";
import { getMission, publicMission } from "@/lib/mission/store";
import { MissionVault } from "@/mcp/vault";
import { browserCredential } from "@/mcp/browser-access";
import { createReportPdf } from "@/lib/report/pdf";
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
    const m = getMission(id);
    authorize(
      new Request(request.url, {
        headers: { authorization: `Bearer ${credential.accessToken}` },
      }),
      m,
    );
    const pdf = await createReportPdf(publicMission(m));
    return new Response(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="agentos-${id}.pdf"`,
        "Cache-Control": "no-store",
        "Cross-Origin-Resource-Policy": "same-origin",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return Response.json(
      { error: "Completed MCP report unavailable." },
      { status: 403, headers: { "Cache-Control": "no-store" } },
    );
  }
}
