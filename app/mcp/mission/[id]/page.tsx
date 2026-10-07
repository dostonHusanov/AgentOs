import { MissionDashboard } from "@/components/MissionDashboard";
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return <MissionDashboard id={(await params).id} mcpReadOnly />;
}
