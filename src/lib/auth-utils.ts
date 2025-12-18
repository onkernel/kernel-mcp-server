export function isValidJwtFormat(token: string): boolean {
  return (
    token.split(".").length === 3 &&
    token.split(".").every((part) => part.length > 0)
  );
}
