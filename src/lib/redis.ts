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
  await client.setEx(clientId, ttlSeconds, orgId);
}

export async function getOrgIdForClientId({
  clientId,
}: {
  clientId: string;
}): Promise<string | null> {
  await ensureConnected();
  return await client.get(clientId);
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
  await client.setEx(hashedJwt, ttlSeconds, orgId);
}

export { client as redisClient };
