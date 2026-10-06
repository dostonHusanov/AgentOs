import { errorSummary } from "./errors";
import { timingSafeEqual } from "node:crypto";
import type { Mission } from "@/types/mission";
export function authorize(request: Request, m: Mission) {
  const token =
    request.headers.get("authorization")?.replace(/^Bearer /, "") ??
    new URL(request.url).searchParams.get("token") ??
    "";
  if (
    Buffer.byteLength(token) !== Buffer.byteLength(m.accessToken) ||
    !timingSafeEqual(Buffer.from(token), Buffer.from(m.accessToken))
  )
    throw new Error("Unauthorized");
}
export function apiError(error: unknown) {
  const message = errorSummary(error);
  return Response.json(
    { error: message },
    {
      status:
        message === "Unauthorized"
          ? 401
          : message === "Mission not found"
            ? 404
            : 400,
    },
  );
}
