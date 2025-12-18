import { NextRequest, NextResponse } from "next/server";
import { setOrgIdForClientId } from "../../lib/redis";
import { SHARED_CLIENT_IDS } from "../../lib/const";

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
  // Use raw URL to avoid Next.js searchParams normalization (which converts 127.0.0.1 to localhost)
  const rawUrl = new URL(request.url);
  const searchParams = rawUrl.searchParams;

  // Step 1: Extract and validate required OAuth parameters
  const clientId = searchParams.get("client_id");
  const selectedOrgId = searchParams.get("org_id");
  const originalState = searchParams.get("state");

  console.debug("[authorize] start", {
    hasClientId: Boolean(clientId),
    hasSelectedOrgId: Boolean(selectedOrgId),
    hasState: Boolean(originalState),
    rawUrl: request.url,
  });

  // Step 2: Validate minimum required parameters
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

  // Step 3: Redirect to organization selector if no org chosen yet
  if (!selectedOrgId) {
    const redirectUri = searchParams.get("redirect_uri");
    console.debug(
      "[authorize] no org selected yet, redirecting to /select-org",
      { redirectUri },
    );
    const selectOrgUrl = new URL("/select-org", request.nextUrl.origin);

    // Pass all OAuth parameters to the org selector
    searchParams.forEach((value, key) => {
      selectOrgUrl.searchParams.set(key, value);
    });

    const finalUrl = selectOrgUrl.toString();
    console.debug("[authorize] redirect URL built", { finalUrl });

    return NextResponse.redirect(finalUrl);
  }

  // Step 4: Validate server configuration
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

  // Step 5: Store organization context for ephemeral clients
  // Skip Redis storage for shared clients to avoid cross-user overwrites
  if (!SHARED_CLIENT_IDS.includes(clientId)) {
    try {
      // TTL only needs to last through the OAuth flow (authorization_code exchange)
      await setOrgIdForClientId({
        clientId,
        orgId: selectedOrgId,
        ttlSeconds: 60 * 60, // 1 hour
      });
      console.debug("[authorize] stored org_id for ephemeral client", {
        clientIdMasked: clientId?.slice(0, 4) + "...",
      });
    } catch (error) {
      console.error("[authorize] failed to store org_id in Redis", { error });
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
  } else {
    console.debug("[authorize] shared client, skipping Redis store", {
      clientIdMasked: clientId?.slice(0, 4) + "...",
    });
  }

  // Step 6: Handle state parameter based on client type
  let modifiedState = originalState;

  // Only modify state for shared clients (CLI), not ephemeral clients (MCP)
  if (selectedOrgId && SHARED_CLIENT_IDS.includes(clientId)) {
    try {
      // Extract CSRF token from original state if it's base64-encoded JSON
      let csrfToken = originalState || "";

      if (originalState) {
        try {
          // Try to decode originalState as base64-encoded JSON (from CLI)
          const decodedState = Buffer.from(originalState, "base64").toString();
          const parsedState = JSON.parse(decodedState);
          if (parsedState.csrf) {
            csrfToken = parsedState.csrf;
            console.debug("[authorize] extracted CSRF from CLI state param");
          }
        } catch (decodeError) {
          // If decoding fails, treat originalState as plain CSRF token
          csrfToken = originalState;
          console.debug("[authorize] using original state as plain CSRF token");
        }
      }

      const stateData = {
        csrf: csrfToken,
        org_id: selectedOrgId,
      };
      modifiedState = Buffer.from(JSON.stringify(stateData)).toString("base64");
      console.debug("[authorize] encoded org_id into state for shared client", {
        clientIdMasked: clientId?.slice(0, 4) + "...",
      });
    } catch (error) {
      console.error("[authorize] failed to encode org_id into state", {
        error,
      });
      return NextResponse.json(
        {
          error: "server_error",
          error_description: "Failed to encode organization context",
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
  } else if (selectedOrgId) {
    // For ephemeral clients, don't modify state - rely on Redis storage
    console.debug("[authorize] ephemeral client: preserving original state");
  }

  // Step 7: Build Clerk authorization URL with OAuth parameters
  const clerkAuthUrl = new URL(`https://${clerkDomain}/oauth/authorize`);

  // Pass through all original parameters except our custom org_id
  searchParams.forEach((value, key) => {
    if (key !== "org_id") {
      clerkAuthUrl.searchParams.set(key, value);
    }
  });

  // Use the modified state parameter that includes org_id
  if (modifiedState) {
    clerkAuthUrl.searchParams.set("state", modifiedState);
  }

  // Step 8: Redirect to Clerk for actual OAuth authentication
  console.debug("[authorize] redirecting to clerk /oauth/authorize", {
    hasModifiedState: Boolean(modifiedState),
  });
  return NextResponse.redirect(clerkAuthUrl.toString());
}
