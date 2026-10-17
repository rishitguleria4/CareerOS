import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep native/Node-only packages external from bundling.
  serverExternalPackages: [
    "@electric-sql/pglite",
    "pg",
    "mammoth",
    "unpdf",
    "nodemailer",
    "playwright-core",
  ],
  experimental: { serverActions: { bodySizeLimit: "8mb" } },
};

export default nextConfig;
