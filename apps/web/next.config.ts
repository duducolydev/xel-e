import type { NextConfig } from "next";

const API_URL = process.env.API_URL ?? "http://127.0.0.1:3001";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@xel-e/shared"],
  // Le navigateur ne parle qu'au front : cookies de session first-party, pas de CORS.
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${API_URL}/:path*` }];
  },
};

export default nextConfig;
