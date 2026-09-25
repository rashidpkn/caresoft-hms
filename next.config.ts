import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["argon2", "postgres", "drizzle-orm"],
  poweredByHeader: false,
};

export default nextConfig;
