import { MissionInput } from "@/components/MissionInput";
import { config } from "@/lib/config";
export const dynamic = "force-dynamic";
export default function Home() {
  const cfg = config();
  return <MissionInput paymentMode={cfg.paymentMode} aiMode={cfg.aiMode} />;
}
