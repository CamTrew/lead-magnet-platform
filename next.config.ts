import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  devIndicators: false,
  outputFileTracingIncludes: {
    "/mcp": ["./app/fonts/campaign/*"],
    "/mcp/workspace": ["./app/fonts/campaign/*"],
    "/campaign-covers/*": ["./app/fonts/campaign/*"],
    "/campaign-resources/*": ["./app/fonts/campaign/*"],
    "/api/campaigns/*/resource": ["./app/fonts/campaign/*"],
  },
  poweredByHeader: false,
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**",
      },
    ],
  },
};

export default nextConfig;
