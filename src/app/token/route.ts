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

    // Determine grant_type
    const grantType = body.get("grant_type");

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

    // Only look up org_id as appropriate for grant_type
    let orgId: string | null = null;

    if (grantType === "authorization_code") {
      // Only do Redis lookup for authorization_code grant
      const clientId = body.get("client_id") as string;
      try {
        orgId = await getOrgIdForClientId({ clientId });
        if (orgId) {
          console.log("Retrieved org_id from Redis:", orgId);
        }
      } catch (error) {
        console.error("Failed to retrieve org_id from Redis:", error);
        return createErrorResponse(
          "server_error",
          "Failed to retrieve org_id from Redis",
          500,
        );
      }
    } else if (grantType === "refresh_token") {
      // Only check for expired_token on refresh_token grant
      const expiredToken = body.get("expired_token") as string;
      if (expiredToken) {
        try {
          const decoded = jwt.decode(expiredToken);
          if (decoded && typeof decoded === "object" && "org_id" in decoded) {
            orgId = decoded.org_id as string;
            console.log("Extracted org_id from expired JWT:", orgId);
          }
        } catch (error) {
          console.log("Failed to decode expired token:", error);
        }
      }
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
      access_token: mcpToken.jwt,
      expires_in: expiresIn,
    };

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
