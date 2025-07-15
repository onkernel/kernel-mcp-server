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

  // Required OAuth parameters
  const clientId = searchParams.get("client_id");
  const redirectUri = searchParams.get("redirect_uri");
  const responseType = searchParams.get("response_type");
  const scope = searchParams.get("scope");
  const state = searchParams.get("state");
  const codeChallenge = searchParams.get("code_challenge");
  const codeChallengeMethod = searchParams.get("code_challenge_method");
  const selectedOrgId = searchParams.get("org_id");

  // Validate required parameters
  if (!clientId || !redirectUri || !responseType) {
    return NextResponse.json(
      {
        error: "invalid_request",
        error_description: "Missing required parameters",
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

  if (responseType !== "code") {
    return NextResponse.json(
      {
        error: "unsupported_response_type",
        error_description: "Only authorization_code flow is supported",
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

  // PKCE is required for public clients
  if (!codeChallenge || codeChallengeMethod !== "S256") {
    return NextResponse.json(
      {
        error: "invalid_request",
        error_description: "PKCE with S256 is required",
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
    // TTL here is 1 hour, not 24 hours like JWT because this is only used for the authorization code flow
    await setOrgIdForClientId({
      clientId,
      orgId: selectedOrgId,
      ttlSeconds: 3600,
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

  // Build Clerk authorization URL with the original client parameters
  const clerkAuthUrl = new URL(`https://${clerkDomain}/oauth/authorize`);
  clerkAuthUrl.searchParams.set("client_id", clientId);
  clerkAuthUrl.searchParams.set("redirect_uri", redirectUri);
  clerkAuthUrl.searchParams.set("response_type", responseType);
  clerkAuthUrl.searchParams.set("scope", scope || "openid");
  if (state) clerkAuthUrl.searchParams.set("state", state);
  clerkAuthUrl.searchParams.set("code_challenge", codeChallenge);
  clerkAuthUrl.searchParams.set("code_challenge_method", codeChallengeMethod);

  // Direct redirect to Clerk
  return NextResponse.redirect(clerkAuthUrl.toString());
}
