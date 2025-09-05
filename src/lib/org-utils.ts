import { NextResponse } from "next/server";
import { getOrgIdForClientId, getOrgIdForRefreshTokenSliding } from "./redis";
import { REFRESH_TOKEN_ORG_TTL_SECONDS, SHARED_CLIENT_IDS } from "./const";

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
 * Resolves organization ID based on client type and grant type
 * @param grantType - OAuth grant type ("authorization_code" or "refresh_token")
 * @param clientId - The OAuth client ID
 * @param directOrgId - The org_id from OAuth state parameter (shared clients only)
 * @param refreshToken - The refresh token from OAuth state parameter (shared clients only)
 * @returns { orgId: string | null, error?: NextResponse } - org_id or error response
 */
export async function resolveOrgId({
  grantType,
  clientId,
  directOrgId,
  refreshToken,
}: {
  grantType: string;
  clientId: string;
  directOrgId?: string;
  refreshToken?: string | null;
}): Promise<{ orgId: string | null; error?: NextResponse }> {
  const isSharedClient = SHARED_CLIENT_IDS.includes(clientId);
  const clientIdMasked = clientId ? clientId.slice(0, 4) + "..." : "";
  console.debug("[org-utils] resolveOrgId", {
    grantType,
    isSharedClient,
    hasDirectOrgId: Boolean(directOrgId),
    hasRefreshToken: Boolean(refreshToken),
  });

  if (isSharedClient) {
    // Shared clients (CLI): Use org_id from OAuth state parameter
    if (directOrgId) {
      console.debug("[org-utils] shared client: using direct org_id from body");
      return { orgId: directOrgId };
    } else if (grantType === "refresh_token" && refreshToken) {
      try {
        const orgIdFromRefresh = await getOrgIdForRefreshTokenSliding({
          refreshToken,
          ttlSeconds: REFRESH_TOKEN_ORG_TTL_SECONDS,
        });
        if (orgIdFromRefresh) {
          console.debug(
            "[org-utils] shared client: resolved org via refresh_token mapping",
          );
          return { orgId: orgIdFromRefresh };
        }
      } catch (e) {
        console.error(
          "[org-utils] shared client: error reading refresh_token mapping",
          { error: e },
        );
        return {
          orgId: null,
          error: createErrorResponse(
            "server_error",
            "Failed to retrieve organization context for refresh token.",
          ),
        };
      }
      console.warn(
        "[org-utils] shared client: missing org_id and no refresh mapping",
      );
      return {
        orgId: null,
        error: createErrorResponse(
          "invalid_grant",
          "Missing organization context in refresh request. Please re-authorize.",
        ),
      };
    } else {
      console.warn("[org-utils] shared client: missing org_id in request body");
      return {
        orgId: null,
        error: createErrorResponse(
          "invalid_grant",
          "Missing organization context in OAuth request body. Please re-authorize.",
        ),
      };
    }
  }

  // Ephemeral clients (MCP)
  if (grantType === "authorization_code") {
    // Use client_id mapping just to bridge the initial hop
    try {
      const orgId = await getOrgIdForClientId({ clientId });
      if (orgId) {
        console.debug(
          "[org-utils] ephemeral client: resolved org via client_id mapping",
        );
        return { orgId };
      } else {
        console.warn(
          "[org-utils] ephemeral client: missing org context for authorization_code",
          { clientIdMasked },
        );
        return {
          orgId: null,
          error: createErrorResponse(
            "invalid_grant",
            "Organization context expired for client: " + clientId + ". Please re-authorize to select your organization.",
          ),
        };
      }
    } catch (error) {
      console.error(
        "[org-utils] ephemeral client: error reading client_id mapping",
        { error, clientIdMasked },
      );
      return {
        orgId: null,
        error: createErrorResponse(
          "server_error",
          "Failed to retrieve organization context for client: " + clientId,
        ),
      };
    }
  } else if (grantType === "refresh_token") {
    // Use refresh_token mapping for ongoing refresh flows
    if (!refreshToken) {
      console.debug("[org-utils] refresh flow without refresh_token param");
      return {
        orgId: null,
        error: createErrorResponse(
          "invalid_request",
          "Missing required parameter: refresh_token",
        ),
      };
    }
    try {
      const orgId = await getOrgIdForRefreshTokenSliding({
        refreshToken,
        ttlSeconds: REFRESH_TOKEN_ORG_TTL_SECONDS,
      });
      if (orgId) {
        console.debug("[org-utils] resolved org via refresh_token mapping");
        return { orgId };
      }
      console.warn(
        "[org-utils] no org mapping for refresh_token (expired or unknown)",
      );
      return {
        orgId: null,
        error: createErrorResponse(
          "invalid_grant",
          "Organization context expired for this refresh token. Please re-authorize.",
        ),
      };
    } catch (error) {
      console.error("[org-utils] error reading refresh_token mapping", { error });
      return {
        orgId: null,
        error: createErrorResponse(
          "server_error",
          "Failed to retrieve organization context for refresh token.",
        ),
      };
    }
  }

  return {
    orgId: null,
    error: createErrorResponse(
      "unsupported_grant_type",
      `Grant type '${grantType}' is not supported`,
    ),
  };
}
