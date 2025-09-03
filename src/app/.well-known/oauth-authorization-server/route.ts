import {
  metadataCorsOptionsRequestHandler,
  protectedResourceHandlerClerk,
} from "@clerk/mcp-tools/next";
import { NextRequest } from "next/server";

const handler = async (request: NextRequest) => {
  const clerkResponse = await protectedResourceHandlerClerk({
    scopes_supported: ["openid"],
  })(request);

  const clerkMetadata = await clerkResponse.json();

  const baseUrl = `${request.nextUrl.protocol}//${request.nextUrl.host}`;

  // Optionally source Clerk's registration endpoint directly from Clerk metadata
  let clerkRegistrationEndpoint: string | undefined;
  try {
    const clerkDomain = process.env.NEXT_PUBLIC_CLERK_DOMAIN;
    if (clerkDomain) {
      const authMetaRes = await fetch(
        `https://${clerkDomain}/.well-known/oauth-authorization-server`,
      );
      if (authMetaRes.ok) {
        const authMeta = await authMetaRes.json();
        clerkRegistrationEndpoint = authMeta.registration_endpoint as
          | string
          | undefined;
      }
    }
  } catch {
    // Ignore; fall back to our local /register if needed
  }

  const modifiedMetadata: Record<string, unknown> = {
    ...clerkMetadata,
    resource: baseUrl,
    authorization_servers: [baseUrl],
    authorization_endpoint: `${baseUrl}/authorize`,
    token_endpoint: `${baseUrl}/token`,
    registration_endpoint:
      clerkRegistrationEndpoint ?? `${baseUrl}/register`,
    jwks_uri: `${baseUrl}/.well-known/jwks.json`,
    scopes_supported: ["openid"],
  };

  // Remove introspection fields that don't apply to resource metadata for MCP
  delete (modifiedMetadata as any).token_introspection_endpoint;
  delete (modifiedMetadata as any)
    .token_introspection_endpoint_auth_methods_supported;

  console.log(modifiedMetadata);

  return Response.json(modifiedMetadata);
};

export { handler as GET, metadataCorsOptionsRequestHandler as OPTIONS };
