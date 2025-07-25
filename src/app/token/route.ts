/**
 * OAuth Token Exchange Endpoint
 *
 * Organization Resolution:
 * - For ephemeral clients (MCP): Uses Redis to store/retrieve org_id mappings
 *   since each MCP session gets a unique client_id
 * - For shared clients (CLI): Avoids Redis to prevent cross-user overwrites
 *   since all CLI instances share the same client_id
 * - For refresh requests: Attempts to extract org_id from expired JWT first,
 *   then falls back to Redis lookup
 *
 * Token Creation:
 * - Exchanges Clerk tokens for custom JWT tokens using "mcp-server-7day" template
 * - Extends token lifetime beyond standard OAuth tokens for better UX
 * - Embeds org_id in response when available for client context
 *
 * Redis TTL Management:
 * - Refreshes TTL to 8 weeks on successful refresh_token grants (ephemeral clients only)
 * - Provides buffer beyond 1-week JWT lifetime to ensure mapping persistence
 */

import { NextRequest, NextResponse } from "next/server";
import { setOrgIdForClientId } from "../../lib/redis";
import { clerkClient } from "@clerk/nextjs/server";
import { SHARED_CLIENT_IDS } from "../../lib/const";
import { resolveOrgId } from "../../lib/org-utils";
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

interface ClerkTokenResponse {
  access_token: string;
  expires_in: number;
  refresh_token: string;
  token_type: string;
  id_token?: string; // Optional, only present for authorization_code grants
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const clerk = await clerkClient();

  // Step 1: Validate request format
  const contentType = request.headers.get("content-type");
  if (!contentType?.includes("application/x-www-form-urlencoded")) {
    return createErrorResponse(
      "invalid_request",
      "Content-Type must be application/x-www-form-urlencoded",
    );
  }

  const body = await request.formData();

  // Step 2: Validate server configuration
  const clerkDomain = process.env.NEXT_PUBLIC_CLERK_DOMAIN;
  if (!clerkDomain) {
    return createErrorResponse(
      "server_error",
      "Server configuration error - clerk domain not found",
      500,
    );
  }

  try {
    // Step 3: Prepare parameters for Clerk token exchange
    const params = new URLSearchParams();
    for (const [key, value] of body.entries()) {
      params.append(key, value.toString());
    }

    const grantType = body.get("grant_type") as string;

    // Step 4: Exchange authorization code/refresh token with Clerk
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

    const clerkTokens: ClerkTokenResponse = await clerkTokenResponse.json();

    // Step 5: Resolve organization context based on client type and grant type
    const clientId = body.get("client_id") as string;
    const expiredToken = body.get("expired_token");

    const orgResult = await resolveOrgId(
      grantType,
      clientId,
      expiredToken ? expiredToken.toString() : undefined,
    );
    if (orgResult.error) {
      return orgResult.error;
    }
    const orgId = orgResult.orgId;

    // Step 6: Validate organization context for ephemeral clients
    // Shared clients can proceed without org_id as they handle it via JWT round-trip
    if (!orgId && !SHARED_CLIENT_IDS.includes(clientId)) {
      console.warn("No org_id resolved for ephemeral client:", clientId);
      return createErrorResponse(
        "invalid_grant",
        "Unable to resolve organization context. Please re-authorize.",
      );
    }

    if (!clerkTokens.access_token) {
      return createErrorResponse(
        "invalid_grant",
        "Failed to retrieve access_token from Clerk",
      );
    }

    // Step 7: Get user information from Clerk
    // This is needed because oauth-derived tokens don't include session claims
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

    // Step 8: Create backend Clerk session
    const clerkSession = await clerk.sessions.createSession({
      userId: userInfo.sub as string,
    });

    // Step 9: Generate custom JWT using mcp-server-7day template
    const mcpToken = await clerk.sessions.getToken(
      clerkSession.id,
      "mcp-server-7day",
    );

    // Step 10: Calculate token expiration time
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

    // Step 11: Maintain Redis TTL for active ephemeral clients (refresh_token only)
    if (grantType === "refresh_token" && orgId) {
      const clientId = body.get("client_id") as string;

      if (clientId && !SHARED_CLIENT_IDS.includes(clientId)) {
        try {
          // Refresh TTL to 8 weeks (JWT TTL is 1 week, so this gives plenty of buffer)
          await setOrgIdForClientId({
            clientId,
            orgId,
            ttlSeconds: 8 * 7 * 24 * 60 * 60, // 8 weeks
          });
          console.debug("Refreshed Redis TTL for ephemeral client:", clientId);
        } catch (error) {
          console.error("Failed to refresh Redis TTL:", error);
        }
      } else {
        console.debug(
          "Skipping Redis TTL refresh for shared client:",
          clientId,
        );
      }
    }

    // Step 12: Build final token response
    // Note: org_id is embedded in the JWT itself, no need to return it separately
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
