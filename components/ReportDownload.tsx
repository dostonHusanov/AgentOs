"use client";
import { useEffect, useState } from "react";
export function ReportDownload({ id }: { id: string }) {
  const [status, setStatus] = useState("Preparing your PDF report…");
  async function download() {
    try {
      const response = await fetch(`/api/mcp/missions/${id}/report`, {
        cache: "no-store",
      });
      if (!response.ok) throw new Error();
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = url;
      link.download = `agentos-${id}.pdf`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
      setStatus("Your PDF download has started.");
    } catch {
      setStatus(
        "Could not download the completed report. Keep AgentOS running and use the original localhost link on this Mac.",
      );
    }
  }
  useEffect(() => {
    void download();
  }, [id]);
  return (
    <main style={{ padding: 48, maxWidth: 700, margin: "auto" }}>
      <h1>AgentOS report</h1>
      <p role="status">{status}</p>
      <button className="secondary-button" onClick={() => void download()}>
        Download PDF again
      </button>
    </main>
  );
}
