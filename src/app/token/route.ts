import { NextRequest, NextResponse } from "next/server";
import {
  setOrgIdForJwt,
  getOrgIdForClientId,
  deleteOrgIdForClientId,
} from "../../lib/redis";

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

function createErrorResponse(
  error: string,
  errorDescription: string,
  status: number = 400,
) {
  return NextResponse.json(
    {
      error,
      error_description: errorDescription,
    },
    {
      status,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
      },
    },
  );
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const contentType = request.headers.get("content-type");
  if (!contentType?.includes("application/x-www-form-urlencoded")) {
    return createErrorResponse(
      "invalid_request",
      "Content-Type must be application/x-www-form-urlencoded",
    );
  }

  const body = await request.formData();

  console.log("body", body);

  // Get Clerk domain
  const clerkDomain = process.env.NEXT_PUBLIC_CLERK_DOMAIN;
  if (!clerkDomain) {
    return createErrorResponse(
      "server_error",
      "Server configuration error - clerk domain not found",
      500,
    );
  }

  try {
    // Convert FormData to URLSearchParams
    const params = new URLSearchParams();
    for (const [key, value] of body.entries()) {
      params.append(key, value.toString());
    }

    console.log("params", params);

    // Exchange with Clerk
    const clerkTokenResponse = await fetch(
      `https://${clerkDomain}/oauth/token`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: params,
      },
    );

    if (!clerkTokenResponse.ok) {
      const errorData = await clerkTokenResponse.text();
      console.error("Clerk token exchange failed:", errorData);
      return createErrorResponse(
        "invalid_grant",
        "Failed to exchange authorization code",
      );
    }

    const clerkTokens = await clerkTokenResponse.json();

    // Retrieve org_id from Redis using client_id
    let orgId: string | null = null;
    const clientId = body.get("client_id") as string;

    try {
      orgId = await getOrgIdForClientId({ clientId });
    } catch (error) {
      console.error("Failed to retrieve org_id from Redis:", error);
      return createErrorResponse(
        "server_error",
        "Failed to retrieve org_id from Redis",
        500,
      );
    }

    if (!orgId) {
      return createErrorResponse(
        "server_error",
        "Failed to retrieve org_id from Redis",
        500,
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
      // Override the access_token to be the jwt id_token
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
    return createErrorResponse("server_error", "Internal server error", 500);
  }
}
