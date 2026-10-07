import { authorize, apiError } from "@/lib/api";
import { getMission, publicMission } from "@/lib/mission/store";
import { createReportPdf } from "@/lib/report/pdf";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const m = getMission((await params).id);
    authorize(request, m);
    const pdf = await createReportPdf(publicMission(m));
    return new Response(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="agentos-${m.id}.pdf"`,
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return apiError(error);
  }
}
