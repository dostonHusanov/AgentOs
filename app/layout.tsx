import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "AgentOS — Autonomous agent economy",
  description: "Give AI a goal and a budget. It builds the team.",
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
