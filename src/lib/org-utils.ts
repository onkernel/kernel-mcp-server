import { NextResponse } from "next/server";
import { getOrgIdForClientId } from "./redis";
import { SHARED_CLIENT_IDS } from "./const";

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
 * @returns { orgId: string | null, error?: NextResponse } - org_id or error response
 */
export async function resolveOrgId(
  grantType: string,
  clientId: string,
  directOrgId?: string,
): Promise<{ orgId: string | null; error?: NextResponse }> {
  const isSharedClient = SHARED_CLIENT_IDS.includes(clientId);

  if (isSharedClient) {
    // Shared clients (CLI): Use org_id from OAuth state parameter
    if (directOrgId) {
      console.debug(
        "Using org_id from OAuth request body for shared client:",
        directOrgId,
      );
      return { orgId: directOrgId };
    } else {
      console.warn("Shared client missing org_id in request body");
      return {
        orgId: null,
        error: createErrorResponse(
          "invalid_grant",
          "Missing organization context in OAuth request body. Please re-authorize.",
        ),
      };
    }
  }

  // Ephemeral clients (MCP): Use Redis only
  try {
    const orgId = await getOrgIdForClientId({ clientId });
    if (orgId) {
      console.debug(
        `Retrieved org_id from Redis for ephemeral client (${grantType}):`,
        orgId,
      );
      return { orgId };
    } else {
      console.warn(
        `Ephemeral client missing org context during ${grantType} - Redis entry expired for client: ${clientId}`,
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
      `Failed to retrieve org_id from Redis during ${grantType} for client: ${clientId}:`,
      error,
    );
    return {
      orgId: null,
      error: createErrorResponse(
        "server_error",
        "Failed to retrieve organization context for client: " + clientId,
      ),
    };
  }
}
