import { createClient } from "redis";
import { createHmac } from "crypto";

const client = createClient({
  url: process.env.REDIS_URL,
});

client.on("error", (err) => {
  console.error("Redis Client Error", err);
});

// Connect on first use
let isConnected = false;

async function ensureConnected(): Promise<void> {
  if (!isConnected) {
    await client.connect();
    isConnected = true;
  }
}

// Hash JWT using HMAC-SHA256 with CLERK_SECRET_KEY for secure Redis storage
function hashJwt(jwt: string): string {
  const secretKey = process.env.CLERK_SECRET_KEY;
  if (!secretKey) {
    throw new Error("CLERK_SECRET_KEY environment variable must be set");
  }

  return createHmac("sha256", secretKey).update(jwt).digest("hex");
}

// Hash opaque tokens (e.g., refresh tokens) for secure Redis storage
function hashOpaqueToken(token: string): string {
  const secretKey = process.env.CLERK_SECRET_KEY;
  if (!secretKey) {
    throw new Error("CLERK_SECRET_KEY environment variable must be set");
  }

  return createHmac("sha256", secretKey).update(token).digest("hex");
}

export async function setOrgIdForClientId({
  clientId,
  orgId,
  ttlSeconds,
}: {
  clientId: string;
  orgId: string;
  ttlSeconds: number;
}): Promise<void> {
  await ensureConnected();
  const key = `client:${clientId}`;
  await client.setEx(key, ttlSeconds, orgId);
}

export async function getOrgIdForClientId({
  clientId,
}: {
  clientId: string;
}): Promise<string | null> {
  await ensureConnected();
  const key = `client:${clientId}`;
  return await client.get(key);
}

export async function setOrgIdForJwt({
  jwt,
  orgId,
  ttlSeconds,
}: {
  jwt: string;
  orgId: string;
  ttlSeconds: number;
}): Promise<void> {
  await ensureConnected();
  const hashedJwt = hashJwt(jwt);
  const key = `jwt:${hashedJwt}`;
  await client.setEx(key, ttlSeconds, orgId);
}

export { client as redisClient };

export async function setOrgIdForRefreshToken({
  refreshToken,
  orgId,
  ttlSeconds,
}: {
  refreshToken: string;
  orgId: string;
  ttlSeconds: number;
}): Promise<void> {
  await ensureConnected();
  const hashed = hashOpaqueToken(refreshToken);
  const key = `refresh:${hashed}`;
  await client.setEx(key, ttlSeconds, orgId);
}

export async function getOrgIdForRefreshTokenSliding({
  refreshToken,
  ttlSeconds,
}: {
  refreshToken: string;
  ttlSeconds: number;
}): Promise<string | null> {
  await ensureConnected();
  const hashed = hashOpaqueToken(refreshToken);
  const key = `refresh:${hashed}`;
  const orgId = await client.get(key);
  if (orgId) {
    // Refresh TTL to implement sliding expiration on active tokens
    await client.expire(key, ttlSeconds);
  }
  return orgId;
}
