import { NextRequest, NextResponse } from "next/server";
import {
  setOrgIdForJwt,
  getOrgIdForClientId,
  deleteOrgIdForClientId,
} from "../../lib/redis";
import { verifyToken } from "@clerk/backend";

export async function OPTIONS(): Promise<NextResponse> {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    },
  });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const contentType = request.headers.get("content-type");
  if (!contentType?.includes("application/x-www-form-urlencoded")) {
    return NextResponse.json(
      {
        error: "invalid_request",
        error_description:
          "Content-Type must be application/x-www-form-urlencoded",
      },
      {
        status: 400,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, Authorization",
        },
      },
    );
  }

  const body = await request.formData();
  const grantType = body.get("grant_type") as string;
  const code = body.get("code") as string;
  const codeVerifier = body.get("code_verifier") as string;
  const redirectUri = body.get("redirect_uri") as string;
  const clientId = body.get("client_id") as string;

  // Validate required parameters
  if (!grantType || !code || !redirectUri || !clientId) {
    return NextResponse.json(
      {
        error: "invalid_request",
        error_description: "Missing required parameters",
      },
      {
        status: 400,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, Authorization",
        },
      },
    );
  }

  if (grantType !== "authorization_code") {
    return NextResponse.json(
      {
        error: "unsupported_grant_type",
        error_description: "Only authorization_code grant type is supported",
      },
      {
        status: 400,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, Authorization",
        },
      },
    );
  }

  // PKCE code verifier is required
  if (!codeVerifier) {
    return NextResponse.json(
      {
        error: "invalid_request",
        error_description: "code_verifier is required for PKCE",
      },
      {
        status: 400,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, Authorization",
        },
      },
    );
  }

  // Exchange the code directly with Clerk using the original client credentials
  const clerkDomain = process.env.NEXT_PUBLIC_CLERK_DOMAIN;

  if (!clerkDomain) {
    return NextResponse.json(
      {
        error: "server_error",
        error_description:
          "Server configuration error - clerk domain not found",
      },
      {
        status: 500,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, Authorization",
        },
      },
    );
  }

  try {
    // Exchange code with Clerk using the original client parameters
    const clerkTokenResponse = await fetch(
      `https://${clerkDomain}/oauth/token`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          grant_type: grantType,
          code: code,
          client_id: clientId,
          redirect_uri: redirectUri,
          code_verifier: codeVerifier,
        }),
      },
    );

    if (!clerkTokenResponse.ok) {
      const errorData = await clerkTokenResponse.text();
      console.error("Clerk token exchange failed:", errorData);
      return NextResponse.json(
        {
          error: "invalid_grant",
          error_description: "Failed to exchange authorization code",
        },
        {
          status: 400,
          headers: {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "POST, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type, Authorization",
          },
        },
      );
    }

    const clerkTokens = await clerkTokenResponse.json();

    // Retrieve org_id from Redis using client_id
    let orgId: string | null = null;
    try {
      orgId = await getOrgIdForClientId({ clientId });
    } catch (error) {
      console.error("Failed to retrieve org_id from Redis:", error);
      return NextResponse.json(
        {
          error: "server_error",
          error_description: "Failed to retrieve org_id from Redis",
        },
        {
          status: 500,
          headers: {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "POST, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type, Authorization",
          },
        },
      );
    }

    if (!orgId) {
      return NextResponse.json(
        {
          error: "server_error",
          error_description: "Failed to retrieve org_id from Redis",
        },
        {
          status: 500,
          headers: {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "POST, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type, Authorization",
          },
        },
      );
    }

    // Set org_id for jwt in redis with the ttl of the token
    await setOrgIdForJwt({
      jwt: clerkTokens.id_token,
      orgId,
      ttlSeconds: clerkTokens.expires_in,
    });

    // Clean up the Redis entry after successful token exchange
    await deleteOrgIdForClientId({ clientId: clientId });

    const mcpTokenResponse = {
      ...clerkTokens,
      access_token: clerkTokens.id_token,
    };

    // Return the modified token response
    return NextResponse.json(mcpTokenResponse, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
      },
    });
  } catch (error) {
    console.error("Token exchange error:", error);
    return NextResponse.json(
      { error: "server_error", error_description: "Internal server error" },
      {
        status: 500,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, Authorization",
        },
      },
    );
  }
}
