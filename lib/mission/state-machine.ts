import type { Mission, MissionStatus } from "@/types/mission";
import { event } from "./store";
const allowed: Record<MissionStatus, MissionStatus[]> = {
  created: ["planning"],
  planning: ["discovering"],
  discovering: ["selecting"],
  selecting: ["purchasing"],
  purchasing: ["executing", "discovering"],
  executing: ["verifying", "discovering"],
  verifying: ["discovering", "synthesizing"],
  synthesizing: ["discovering", "completed"],
  completed: [],
  failed: [],
};
export function transition(m: Mission, next: MissionStatus) {
  if (m.status === "completed" || m.status === "failed")
    throw new Error("Mission is terminal");
  if (!allowed[m.status].includes(next))
    throw new Error(`Invalid mission transition: ${m.status} → ${next}`);
  m.status = next;
  event(m, `mission_${next}`, `Mission ${next}`);
}
