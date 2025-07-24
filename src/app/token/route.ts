import { NextRequest, NextResponse } from "next/server";
import { getOrgIdForClientId } from "../../lib/redis";
import { clerkClient } from "@clerk/nextjs/server";
import jwt from "jsonwebtoken";

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
  const clerk = await clerkClient();

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

    console.log("clerkTokens", clerkTokens);

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

    if (!clerkTokens.access_token) {
      return createErrorResponse(
        "invalid_grant",
        "Failed to retrieve access_token from Clerk",
      );
    }

    // Call the user_info endpoint to get the user_id
    const userInfoResponse = await fetch(
      `https://${clerkDomain}/oauth/userinfo`,
      {
        headers: {
          Authorization: `Bearer ${clerkTokens.access_token}`,
        },
      },
    );

    if (!userInfoResponse.ok) {
      return createErrorResponse(
        "invalid_grant",
        "Failed to retrieve user_id from Clerk",
      );
    }

    const userInfo = await userInfoResponse.json();

    console.log("userInfo", userInfo);

    if (!userInfo.sub) {
      return createErrorResponse(
        "invalid_grant",
        "Failed to retrieve user_id from Clerk",
      );
    }

    // Create backend clerk session
    const clerkSession = await clerk.sessions.createSession({
      userId: userInfo.sub as string,
    });

    // Create a JWT for the session from the "mcp-server-7day" jwt template
    const mcpToken = await clerk.sessions.getToken(
      clerkSession.id,
      "mcp-server-7day",
    );

    console.log("mcpToken", mcpToken);

    // Log decoded mcpToken
    console.log("decoded mcpToken", jwt.decode(mcpToken.jwt));

    // Get the expiration time of the mcpToken
    const decodedToken = jwt.decode(mcpToken.jwt);
    if (
      !decodedToken ||
      typeof decodedToken === "string" ||
      !decodedToken.exp ||
      !decodedToken.iat
    ) {
      return createErrorResponse("invalid_grant", "Failed to decode mcpToken");
    }
    const expiresIn = decodedToken.exp - decodedToken.iat;

    const mcpTokenResponse = {
      ...clerkTokens,
      // Override the access_token to be the jwt id_token
      access_token: mcpToken.jwt,
      expires_in: expiresIn,
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
