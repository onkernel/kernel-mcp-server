import { NextRequest, NextResponse } from "next/server";
import { setOrgIdForJwt } from "../../lib/redis";
import { resolveOrgId } from "../../lib/org-utils";

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
  // Step 1: Validate request format
  const contentType = request.headers.get("content-type");
  if (!contentType?.includes("application/x-www-form-urlencoded")) {
    return createErrorResponse(
      "invalid_request",
      "Content-Type must be application/x-www-form-urlencoded",
    );
  }

  const body = await request.formData();

  // print the body
  console.log('request token body', body);

  // Step 2: Validate server configuration
  const clerkDomain = process.env.NEXT_PUBLIC_CLERK_DOMAIN;

  if (!clerkDomain) {
    console.error("NEXT_PUBLIC_CLERK_DOMAIN environment variable is not set");
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

    // Step 4: Exchange authorization code with Clerk
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

    console.log('clerkTokens', clerkTokens);

    // Step 5: Resolve organization context
    const clientId = body.get("client_id") as string;

    // For shared clients, extract org_id from direct parameter
    // For ephemeral clients, rely on Redis storage
    let directOrgId: string | undefined;

    // Extract org_id from request body (shared clients only)
    const directOrgIdParam = body.get("org_id");
    if (directOrgIdParam) {
      // mask the middle of the org_id
      const orgId = directOrgIdParam.toString();
      directOrgId = orgId;
      const maskedOrgId = orgId.slice(0, 4) + "..." + orgId.slice(-4);
      console.debug("Using org_id from request body:", maskedOrgId);
    }

    const orgResult = await resolveOrgId(grantType, clientId, directOrgId);
    if (orgResult.error) {
      return orgResult.error;
    }
    const orgId = orgResult.orgId;

    // Step 6: Validate organization context
    if (!orgId || orgId === "") {
      console.warn("No org_id resolved for client:", clientId);
      return createErrorResponse(
        "invalid_grant",
        "Unable to resolve organization context. Please re-authorize.",
      );
    }

    // Step 7: Validate grant type and extract JWT
    let finalJwt: string;
    let expiresIn: number;

    if (grantType === "authorization_code") {
      // For authorization_code: Use id_token directly (already has proper structure)
      if (!clerkTokens.id_token) {
        return createErrorResponse(
          "invalid_grant",
          "Failed to retrieve id_token from Clerk authorization code",
        );
      }

      finalJwt = clerkTokens.id_token;
      expiresIn = clerkTokens.expires_in;
    } else if (grantType === "refresh_token") {
      if (!clerkTokens.id_token) {
        return createErrorResponse(
          "invalid_grant",
          "Failed to retrieve id_token from Clerk refresh token",
        );
      }

      finalJwt = clerkTokens.id_token;
      expiresIn = clerkTokens.expires_in;
    } else {
      return createErrorResponse(
        "unsupported_grant_type",
        `Grant type '${grantType}' is not supported`,
      );
    }

    // Step 8: Store JWT to org_id mapping for verifyjwt.go
    try {
      // Store JWT to org_id mapping with JWT expiration time
      await setOrgIdForJwt({
        jwt: finalJwt,
        orgId,
        ttlSeconds: expiresIn,
      });
      console.debug("Stored JWT to org_id mapping in Redis");
    } catch (error) {
      console.error("Failed to store JWT to org_id mapping:", error);
      return createErrorResponse(
        "server_error",
        "Failed to store authentication context",
        500,
      );
    }

    // Step 9: Build final token response
    const mcpTokenResponse = {
      ...clerkTokens,
      access_token: finalJwt,
      expires_in: expiresIn,
    };

    console.log('response token body', mcpTokenResponse);

    return NextResponse.json(mcpTokenResponse, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
      },
    });
  } catch (error) {
    console.error("Token exchange error:", error);

    // If it's a Clerk error, log the detailed error information
    if (error && typeof error === "object" && "clerkError" in error) {
      const clerkError = error as any;
      console.error("Clerk error details:");
      console.error("  Status:", clerkError.status);
      console.error("  Clerk Trace ID:", clerkError.clerkTraceId);
      if (clerkError.errors && Array.isArray(clerkError.errors)) {
        console.error("  Specific errors:");
        clerkError.errors.forEach((err: any, index: number) => {
          console.error(
            `    Error ${index + 1}:`,
            JSON.stringify(err, null, 2),
          );
        });
      }
    }

    return createErrorResponse("server_error", "Internal server error", 500);
  }
}
