// import { authServerMetadataHandlerClerk } from "@clerk/mcp-tools/next";
import { NextRequest, NextResponse } from "next/server";
  
  const handler = async (request: NextRequest) => {
    // redirect to oauth-protected-resource/mcp
    return NextResponse.redirect(new URL("/oauth-protected-resource/mcp", request.nextUrl.origin));

    // const clerkResponse = await authServerMetadataHandlerClerk()();
  
    // const clerkMetadata = await clerkResponse.json();
  
    // const baseUrl = `${request.nextUrl.protocol}//${request.nextUrl.host}`;
    // const clerkDomain = process.env.NEXT_PUBLIC_CLERK_DOMAIN;

    // if (!clerkDomain) {
    //   return Response.json({ error: "server_error", error_description: "Clerk domain not found" }, { status: 500 });
    // }

    // const clerkBaseUrl = `https://${clerkDomain}`;
  
    // const modifiedMetadata: Record<string, unknown> = {
    //     ...clerkMetadata,
    //     resource: baseUrl,
    //     authorization_servers: [baseUrl],
    //     authorization_endpoint: `${baseUrl}/authorize`,
    //     token_endpoint: `${baseUrl}/token`,
    //     registration_endpoint: `${clerkBaseUrl}/oauth/register`,
    // };

    // return Response.json(modifiedMetadata, {
    //   headers: {
    //     "Access-Control-Allow-Origin": "*",
    //     "Access-Control-Allow-Methods": "GET, OPTIONS",
    //     "Access-Control-Allow-Headers": "Content-Type, Authorization",
    //   },
    // });
  };
  
  export const OPTIONS = async (): Promise<Response> =>
    new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
      },
    });

  export { handler as GET };
