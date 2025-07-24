import { NextRequest, NextResponse } from "next/server";
import { setOrgIdForClientId } from "../../lib/redis";

export async function OPTIONS(): Promise<NextResponse> {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    },
  });
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const searchParams = request.nextUrl.searchParams;

  // Extract required parameters for basic validation
  const clientId = searchParams.get("client_id");
  const selectedOrgId = searchParams.get("org_id");

  // Validate minimum required parameters
  if (!clientId) {
    return NextResponse.json(
      {
        error: "invalid_request",
        error_description: "Missing required parameter: client_id",
      },
      {
        status: 400,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, Authorization",
        },
      },
    );
  }

  // If no selected orgId, redirect to select-org
  if (!selectedOrgId) {
    const selectOrgUrl = new URL("/select-org", request.nextUrl.origin);

    // Pass all OAuth parameters to the org selector
    searchParams.forEach((value, key) => {
      selectOrgUrl.searchParams.set(key, value);
    });

    return NextResponse.redirect(selectOrgUrl.toString());
  }

  // Get Clerk configuration for upstream authentication
  const clerkDomain = process.env.NEXT_PUBLIC_CLERK_DOMAIN;

  if (!clerkDomain) {
    return NextResponse.json(
      {
        error: "server_error",
        error_description: "Server configuration error",
      },
      {
        status: 500,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, Authorization",
        },
      },
    );
  }

  // Store org_id in Redis with client_id as key
  try {
    // TTL here needs to be long enough for a refresh_token to be used and still get the org_id via the client_id
    await setOrgIdForClientId({
      clientId,
      orgId: selectedOrgId,
      ttlSeconds: 30 * 24 * 60 * 60, // 30 days
    });
  } catch (error) {
    console.error("Failed to store org_id in Redis:", error);
    return NextResponse.json(
      {
        error: "server_error",
        error_description: "Failed to store organization context",
      },
      {
        status: 500,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, Authorization",
        },
      },
    );
  }

  // Build Clerk authorization URL with all original parameters (except org_id)
  const clerkAuthUrl = new URL(`https://${clerkDomain}/oauth/authorize`);

  // Pass through all original parameters except our custom org_id
  searchParams.forEach((value, key) => {
    if (key !== "org_id") {
      clerkAuthUrl.searchParams.set(key, value);
    }
  });

  // Direct redirect to Clerk
  return NextResponse.redirect(clerkAuthUrl.toString());
}
