import type { NextConfig } from "next";
const config: NextConfig = {
  serverExternalPackages: ["@x402/cardano", "@x402/core", "@x402/fetch"],
  experimental: { cpus: 2 },
};
export default config;
