export function isValidJwtFormat(token: string): boolean {
  return (
    token.split(".").length === 3 &&
    token.split(".").every((part) => part.length > 0)
  );
}

/**
 * Normalizes localhost to 127.0.0.1 in redirect URIs for consistency.
 * This ensures that clients can register with either localhost or 127.0.0.1
 * and authorization requests will match regardless of which form is used.
 */
export function normalizeLocalhostUri(uri: string): string {
  try {
    const url = new URL(uri);
    if (url.hostname === "localhost") {
      url.hostname = "127.0.0.1";
      return url.toString();
    }
    return uri;
  } catch {
    return uri;
  }
}
