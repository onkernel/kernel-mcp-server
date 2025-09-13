import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  redirects: async () => {
    return [
      {
        source: "/",
        destination: "https://onkernel.com/docs/reference/mcp-server",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
