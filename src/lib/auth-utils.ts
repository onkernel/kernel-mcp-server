export function isValidJwtFormat(token: string): boolean {
  return (
    token.split(".").length === 3 &&
    token.split(".").every((part) => part.length > 0)
  );
}

/**
 * Expands redirect URIs to include both localhost and 127.0.0.1 forms.
 * This ensures that clients can use either form in authorization requests
 * and they will match the registered URIs.
 */
export function expandLocalhostUris(uris: string[]): string[] {
  const expanded = new Set<string>();
  
  for (const uri of uris) {
    expanded.add(uri);
    
    try {
      const url = new URL(uri);
      if (url.hostname === "localhost") {
        // Add 127.0.0.1 version
        const altUrl = new URL(uri);
        altUrl.hostname = "127.0.0.1";
        expanded.add(altUrl.toString());
      } else if (url.hostname === "127.0.0.1") {
        // Add localhost version
        const altUrl = new URL(uri);
        altUrl.hostname = "localhost";
        expanded.add(altUrl.toString());
      }
    } catch {
      // If URL parsing fails, just keep the original
      continue;
    }
  }
  
  return Array.from(expanded);
}
