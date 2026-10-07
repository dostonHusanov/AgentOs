import { localBaseUrl } from "./adapter";
import { MissionVault } from "./vault";

// Explicit local-user trust boundary. Cross-site requests and DNS-rebinding
// hostnames are rejected; no CORS, token URLs, or browser mutation endpoints.
export function browserCredential(
  request: Request,
  id: string,
  vault: MissionVault,
) {
  // Next's internal Request URL may use localhost even when the browser uses
  // 127.0.0.1. Validate the actual Host header against our fixed loopback set.
  const host = request.headers.get("host");
  const origin = localBaseUrl(
    host ? `http://${host}` : new URL(request.url).origin,
  );
  if (
    request.headers.get("sec-fetch-site") !== "same-origin" ||
    (request.headers.has("origin") && request.headers.get("origin") !== origin)
  )
    throw new Error("Unauthorized");
  const credential = vault.get(id);
  if (credential.baseUrl !== origin) throw new Error("Unauthorized");
  return credential;
}
