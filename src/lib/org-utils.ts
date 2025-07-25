import { NextResponse } from "next/server";
import { getOrgIdForClientId } from "./redis";
import { SHARED_CLIENT_IDS } from "./const";
import jwt from "jsonwebtoken";

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

/**
 * Resolves organization ID based on grant type and available parameters
 * @param grantType - OAuth grant type ("authorization_code" or "refresh_token")
 * @param clientId - The OAuth client ID
 * @param expiredToken - The expired JWT token (for refresh_token grants)
 * @returns { orgId: string | null, error?: NextResponse } - org_id or error response
 */
export async function resolveOrgId(
  grantType: string,
  clientId: string,
  expiredToken?: string,
): Promise<{ orgId: string | null; error?: NextResponse }> {
  let orgId: string | null = null;

  if (grantType === "authorization_code") {
    // Strategy A: Authorization code flow
    // - Get org_id from Redis lookup using client_id as key
    // - Only works for ephemeral clients (MCP) where client_id is unique per session
    // - Shared clients (CLI) will not have Redis entries to avoid cross-user overwrites
    return await getOrgIdFromRedis(clientId, "authorization");
  } else if (grantType === "refresh_token") {
    // Strategy B: Refresh token flow
    // Step 1: Try to extract org_id from expired JWT token (preferred)
    if (expiredToken) {
      orgId = getOrgIdFromExpiredToken(expiredToken);
    }

    // Step 2: Fallback to Redis lookup if no expired_token or org_id not found
    if (!orgId) {
      return await getOrgIdFromRedis(clientId, "refresh");
    }

    return { orgId };
  }

  // Strategy C: Unknown grant type error
  console.error("Unknown grant_type:", grantType);
  return {
    orgId: null,
    error: createErrorResponse(
      "unsupported_grant_type",
      `Grant type '${grantType}' is not supported`,
    ),
  };
}

/**
 * Extracts org_id from an expired JWT token
 * @param expiredToken - The expired JWT token string
 * @returns org_id string or null if not found/invalid
 */
function getOrgIdFromExpiredToken(expiredToken: string): string | null {
  try {
    const decoded = jwt.decode(expiredToken);
    if (decoded && typeof decoded === "object" && "org_id" in decoded) {
      const orgId = decoded.org_id as string;
      console.debug("Extracted org_id from expired JWT:", orgId);
      return orgId;
    }
  } catch (error) {
    console.debug("Failed to decode expired token:", error);
  }
  return null;
}

/**
 * Retrieves org_id from Redis for ephemeral clients, handling errors appropriately
 * @param clientId - The OAuth client ID
 * @param context - Context for error messages ("authorization" or "refresh")
 * @returns { orgId: string | null, error?: NextResponse } - org_id or error response
 */
async function getOrgIdFromRedis(
  clientId: string,
  context: "authorization" | "refresh",
): Promise<{ orgId: string | null; error?: NextResponse }> {
  try {
    const orgId = await getOrgIdForClientId({ clientId });
    if (orgId) {
      console.debug(
        `Retrieved org_id from Redis for ephemeral client (${context}):`,
        orgId,
      );
      return { orgId };
    } else {
      // Check if this is an ephemeral client that lost its org context
      if (!SHARED_CLIENT_IDS.includes(clientId)) {
        console.warn(
          `Ephemeral client missing org context during ${context} - Redis entry expired`,
        );
        return {
          orgId: null,
          error: createErrorResponse(
            "invalid_grant",
            "Organization context expired. Please re-authorize to select your organization.",
          ),
        };
      }
      console.debug(
        `No org_id in Redis - shared client (expected) during ${context}`,
      );
      return { orgId: null };
    }
  } catch (error) {
    console.error(
      `Failed to retrieve org_id from Redis during ${context}:`,
      error,
    );
    // For ephemeral clients, Redis errors are fatal since they need org context
    if (!SHARED_CLIENT_IDS.includes(clientId)) {
      return {
        orgId: null,
        error: createErrorResponse(
          "server_error",
          "Failed to retrieve organization context",
        ),
      };
    }
    return { orgId: null };
  }
}
