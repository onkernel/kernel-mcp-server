import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  redirects: async () => {
    return [
      {
        source: "/",
        destination: "https://docs.onkernel.com/reference/mcp-server",
        permanent: true,
      },
      
    ];
  },
  rewrites: async () => {
    return [
      {
        source: "/oauth-protected-resourece/mcp",
        destination: "/.well-known/oauth-protected-resource/mcp",
      },
      {
        source: "/.well-known/oauth-authorization-server",
        destination: "/.well-known/oauth-protected-resource/mcp",
      },
    ];
  },
};

export default nextConfig;
