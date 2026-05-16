import type { NextConfig } from "next";

const config: NextConfig = {
  reactStrictMode: true,
  experimental: { typedRoutes: true },
  transpilePackages: ["@caltrans/db", "@caltrans/sync"],
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "cwwp2.dot.ca.gov" },
    ],
  },
};

export default config;
