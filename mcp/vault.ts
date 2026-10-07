import { mkdirSync, writeFileSync, readFileSync, chmodSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { SafeMcpError } from "./errors";

export const missionIdSchema = z.string().uuid();
const credentialSchema = z.object({
  missionId: missionIdSchema,
  accessToken: z.string().regex(/^[a-f0-9]{64}$/),
  baseUrl: z.string().url(),
});
export type MissionCredential = z.infer<typeof credentialSchema>;

// Per-mission exclusive files avoid lost updates across multiple MCP clients.
// The private vault is never returned through tools, URLs, or diagnostic logs.
export class MissionVault {
  constructor(private directory: string) {}
  put(credential: MissionCredential) {
    const value = credentialSchema.parse(credential);
    mkdirSync(this.directory, { recursive: true, mode: 0o700 });
    chmodSync(this.directory, 0o700);
    writeFileSync(
      join(this.directory, `${value.missionId}.json`),
      JSON.stringify(value),
      {
        mode: 0o600,
        flag: "wx",
      },
    );
  }
  get(id: string): MissionCredential {
    try {
      missionIdSchema.parse(id);
      const value = credentialSchema.parse(
        JSON.parse(readFileSync(join(this.directory, `${id}.json`), "utf8")),
      );
      if (value.missionId !== id) throw new Error();
      return value;
    } catch {
      throw new SafeMcpError(
        "Mission is not available to this MCP installation.",
      );
    }
  }
}
