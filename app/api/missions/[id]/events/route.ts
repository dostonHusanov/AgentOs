import { getMission, publicMission } from "@/lib/mission/store";
import { authorize, apiError } from "@/lib/api";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const id = (await params).id;
    authorize(request, getMission(id));
    const encoder = new TextEncoder();
    let timer: ReturnType<typeof setInterval>;
    const stream = new ReadableStream({
      start(controller) {
        let previous = "";
        const tick = () => {
          const m = getMission(id);
          const value = JSON.stringify(publicMission(m));
          if (value !== previous) {
            controller.enqueue(
              encoder.encode(`event: snapshot\ndata: ${value}\n\n`),
            );
            previous = value;
          } else controller.enqueue(encoder.encode(": heartbeat\n\n"));
          if (m.status === "completed" || m.status === "failed") {
            clearInterval(timer);
            controller.close();
          }
        };
        timer = setInterval(tick, 750);
        tick();
        request.signal.addEventListener("abort", () => {
          clearInterval(timer);
          try {
            controller.close();
          } catch {}
        });
      },
      cancel() {
        clearInterval(timer);
      },
    });
    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (e) {
    return apiError(e);
  }
}
