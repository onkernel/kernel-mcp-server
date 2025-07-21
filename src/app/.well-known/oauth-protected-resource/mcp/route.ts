import {
  metadataCorsOptionsRequestHandler,
  protectedResourceHandlerClerk,
} from "@clerk/mcp-tools/next";

const handler = protectedResourceHandlerClerk({
  scopes_supported: ["openid"],
});

export { handler as GET, metadataCorsOptionsRequestHandler as OPTIONS };
