import type { NextConfig } from "next";
const config: NextConfig = {
  serverExternalPackages: [
    "@x402/cardano",
    "@x402/core",
    "@x402/fetch",
    "pdfkit",
  ],
  outputFileTracingIncludes: { "/*": ["./assets/fonts/*.ttf"] },
  experimental: { cpus: 2 },
};
export default config;
