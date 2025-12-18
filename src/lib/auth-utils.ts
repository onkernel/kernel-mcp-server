export function isValidJwtFormat(token: string): boolean {
  return (
    token.split(".").length === 3 &&
    token.split(".").every((part) => part.length > 0)
  );
}

/**
 * Normalizes 127.0.0.1 to localhost in a URI.
 * This is needed because Vercel's edge network normalizes 127.0.0.1 to localhost
 * in query parameters. To ensure the redirect_uri matches during token exchange,
 * we need to apply the same normalization to POST body parameters.
 */
export function normalizeLocalhostUri(uri: string): string {
  try {
    const url = new URL(uri);
    if (url.hostname === "127.0.0.1") {
      url.hostname = "localhost";
      return url.toString();
    }
    return uri;
  } catch {
    return uri;
  }
}

/**
 * Expands localhost URIs to include both localhost and 127.0.0.1 variants.
 * This is needed because Vercel's edge network normalizes 127.0.0.1 to localhost
 * in query parameters, so we need to register both variants with Clerk.
 */
export function expandLocalhostUris(uris: string[]): string[] {
  const expanded = new Set<string>();

  for (const uri of uris) {
    expanded.add(uri);

    try {
      const url = new URL(uri);
      if (url.hostname === "localhost") {
        url.hostname = "127.0.0.1";
        expanded.add(url.toString());
      } else if (url.hostname === "127.0.0.1") {
        url.hostname = "localhost";
        expanded.add(url.toString());
      }
    } catch {
      // If URL parsing fails, just keep the original
    }
  }

  return Array.from(expanded);
}
