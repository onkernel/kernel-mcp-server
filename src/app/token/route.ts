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

  // Step 2: Validate server configuration
  const clerkDomain = process.env.NEXT_PUBLIC_CLERK_DOMAIN;
  
  if (!clerkDomain) {
    console.error("NEXT_PUBLIC_CLERK_DOMAIN environment variable is missing!");
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
      console.error("Request parameters sent to Clerk:");
      for (const [key, value] of params.entries()) {
        console.error(`  ${key}: ${value}`);
      }
      console.error(`Clerk domain: ${clerkDomain}`);
      console.error(`Token exchange URL: https://${clerkDomain}/oauth/token`);
      return createErrorResponse(
        "invalid_grant",
        "Failed to exchange authorization code",
      );
    }

    const clerkTokens: ClerkTokenResponse = await clerkTokenResponse.json();

    // Step 5: Resolve organization context
    const clientId = body.get("client_id") as string;
    const directOrgId = body.get("org_id"); // Extract org_id from OAuth request

    const orgResult = await resolveOrgId(
      grantType,
      clientId,
      directOrgId ? directOrgId.toString() : undefined,
    );
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
          "Failed to retrieve id_token from Clerk",
        );
      }
      
      finalJwt = clerkTokens.id_token;
      expiresIn = clerkTokens.expires_in;
    } else if (grantType === "refresh_token") {
      return createErrorResponse(
        "unsupported_grant_type",
        "refresh_token grant type is not yet supported",
      );
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
        ttlSeconds: expiresIn
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
    if (error && typeof error === 'object' && 'clerkError' in error) {
      const clerkError = error as any;
      console.error("Clerk error details:");
      console.error("  Status:", clerkError.status);
      console.error("  Clerk Trace ID:", clerkError.clerkTraceId);
      if (clerkError.errors && Array.isArray(clerkError.errors)) {
        console.error("  Specific errors:");
        clerkError.errors.forEach((err: any, index: number) => {
          console.error(`    Error ${index + 1}:`, JSON.stringify(err, null, 2));
        });
      }
    }
    
    return createErrorResponse("server_error", "Internal server error", 500);
  }
}
