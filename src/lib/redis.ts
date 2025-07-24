import { createClient } from "redis";

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

export { client as redisClient };
