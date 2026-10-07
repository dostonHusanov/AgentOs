import { ReportDownload } from "@/components/ReportDownload";
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return <ReportDownload id={(await params).id} />;
}
