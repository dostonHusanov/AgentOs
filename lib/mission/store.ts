import {
  mkdirSync,
  existsSync,
  readFileSync,
  writeFileSync,
  renameSync,
} from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import type { Mission, PublicMission } from "@/types/mission";
const root = join(process.cwd(), ".agentos");
const globalStore = globalThis as typeof globalThis & {
  agentosMissions?: Map<string, Mission>;
  agentosRunning?: Set<string>;
};
export const missions = (globalStore.agentosMissions ??= new Map());
export const running = (globalStore.agentosRunning ??= new Set());
export function getMission(id: string): Mission {
  if (!/^[a-f0-9-]{36}$/.test(id)) throw new Error("Mission not found");
  const cached = missions.get(id);
  if (cached) return cached;
  const file = join(root, id + ".json");
  if (!existsSync(file)) throw new Error("Mission not found");
  const m = JSON.parse(readFileSync(file, "utf8")) as Mission;
  missions.set(id, m);
  return m;
}
export function save(m: Mission) {
  mkdirSync(root, { recursive: true });
  const file = join(root, m.id + ".json");
  writeFileSync(file + ".tmp", JSON.stringify(m), { mode: 0o600 });
  renameSync(file + ".tmp", file);
  missions.set(m.id, m);
}
export function publicMission(m: Mission): PublicMission {
  const { accessToken, ...data } = m;
  void accessToken;
  return {
    ...data,
    payments: data.payments.map(({ proofDigest, ...p }) => {
      void proofDigest;
      return p;
    }),
  };
}
export function event(
  m: Mission,
  type: string,
  message: string,
  jobId?: string,
) {
  m.events.push({
    id: randomUUID(),
    type,
    message,
    jobId,
    createdAt: new Date().toISOString(),
  });
  save(m);
  console.info(JSON.stringify({ missionId: m.id, type, jobId, message }));
}
