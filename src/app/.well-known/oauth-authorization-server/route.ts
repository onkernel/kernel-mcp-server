import {
  authServerMetadataHandlerClerk,
  metadataCorsOptionsRequestHandler,
} from "@clerk/mcp-tools/next";
import { NextRequest } from "next/server";

const handler = async (request: NextRequest) => {
  const clerkResponse = await authServerMetadataHandlerClerk()();

  // Parse the Clerk response to get the JSON data
  const clerkMetadata = await clerkResponse.json();

  // Get the base URL from the current request
  const baseUrl = `${request.nextUrl.protocol}//${request.nextUrl.host}`;

  // Override the authorization and token endpoints to use our server
  // This allows us to implement the org-scoped OAuth flow we need
  const modifiedMetadata = {
    ...clerkMetadata,
    authorization_endpoint: `${baseUrl}/authorize`,
    token_endpoint: `${baseUrl}/token`,
    registration_endpoint: `${baseUrl}/register`,
    scopes_supported: ["openid"],
  };

  return Response.json(modifiedMetadata);
};

export { handler as GET, metadataCorsOptionsRequestHandler as OPTIONS };
