import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

// Public routes that don't require authentication
const isPublicRoute = createRouteMatcher([
  "/",
  "/(.well-known)(.*)",
  "/register",
  "/authorize",
  "/token",
]);

export default clerkMiddleware(async (auth, req) => {
  if (isPublicRoute(req)) return;
  if (req.nextUrl.pathname.startsWith("/mcp")) {
      if (req.method === "OPTIONS") return;
      const authheader = req.headers.get("Authorization");
      if (authheader?.startsWith("Bearer ")) return;
    }
  await auth.protect();
});

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
