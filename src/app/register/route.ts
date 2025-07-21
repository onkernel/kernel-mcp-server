import { NextRequest, NextResponse } from "next/server";
import { clerkClient } from "@clerk/nextjs/server";

// Custom registration endpoint needed because Clerk doesn't support custom scopes
// We only want "openid" scope instead of Clerk's default email/profile scopes
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

export async function POST(request: NextRequest): Promise<NextResponse> {
  const contentType = request.headers.get("content-type");
  if (!contentType?.includes("application/json")) {
    return NextResponse.json(
      {
        error: "invalid_request",
        error_description: "Content-Type must be application/json",
      },
      { status: 400 },
    );
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "invalid_request", error_description: "Invalid JSON body" },
      { status: 400 },
    );
  }

  const {
    redirect_uris,
    client_name,
    client_uri,
    logo_uri,
    contacts,
    tos_uri,
    policy_uri,
    token_endpoint_auth_method = "none", // Default to PKCE for public clients
    grant_types = ["authorization_code"],
    response_types = ["code"],
    scope = "openid",
  } = body;

  // Validate required parameters
  if (
    !redirect_uris ||
    !Array.isArray(redirect_uris) ||
    redirect_uris.length === 0
  ) {
    return NextResponse.json(
      {
        error: "invalid_redirect_uri",
        error_description:
          "redirect_uris is required and must be a non-empty array",
      },
      { status: 400 },
    );
  }

  // Validate redirect URIs
  for (const uri of redirect_uris) {
    try {
      const url = new URL(uri);
      // Allow HTTPS, localhost, and custom URI schemes (for native apps)
      if (url.protocol === "https:") {
        // HTTPS is always allowed
        continue;
      } else if (
        url.protocol === "http:" &&
        (url.hostname === "localhost" || url.hostname === "127.0.0.1")
      ) {
        // HTTP localhost is allowed for development
        continue;
      } else if (url.protocol !== "http:" && url.protocol !== "https:") {
        // Custom URI schemes are allowed for native apps (e.g., cursor://, myapp://)
        continue;
      } else {
        // HTTP with non-localhost hostname is not allowed
        return NextResponse.json(
          {
            error: "invalid_redirect_uri",
            error_description:
              "HTTP redirect URIs are only allowed for localhost",
          },
          { status: 400 },
        );
      }
    } catch {
      return NextResponse.json(
        {
          error: "invalid_redirect_uri",
          error_description: "Invalid redirect URI format",
        },
        { status: 400 },
      );
    }
  }

  try {
    // Register the OAuth application with Clerk
    const clerk = await clerkClient();
    const oauthApp = await clerk.oauthApplications.create({
      name: client_name || "MCP Client",
      redirectUris: redirect_uris,
      scopes: scope ? scope : "openid",
      public: true,
    });

    // Create response in OAuth Dynamic Client Registration format
    const now = Math.floor(Date.now() / 1000);

    const registrationResponse = {
      client_id: oauthApp.clientId,
      client_secret: oauthApp.clientSecret || undefined, // May be null for public clients
      client_name: client_name || "MCP Client",
      client_uri,
      logo_uri,
      contacts,
      tos_uri,
      policy_uri,
      redirect_uris,
      token_endpoint_auth_method,
      grant_types,
      response_types,
      scope,
      client_id_issued_at: now,
      client_secret_expires_at: 0, // Public clients don't expire
      registration_access_token: oauthApp.id, // Use OAuth app ID as registration token
      registration_client_uri: `${request.nextUrl.origin}/register/${oauthApp.clientId}`,
    };

    return NextResponse.json(registrationResponse, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
      },
    });
  } catch (error) {
    console.error("Client registration error:", error);
    return NextResponse.json(
      {
        error: "invalid_request",
        error_description: "Failed to register client with OAuth provider",
      },
      { status: 500 },
    );
  }
}
