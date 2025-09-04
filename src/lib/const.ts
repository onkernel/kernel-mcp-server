// Shared client IDs that use JWT round-trip instead of Redis for org persistence
export const SHARED_CLIENT_IDS = [
  process.env.KERNEL_CLI_PROD_CLIENT_ID,
  process.env.KERNEL_CLI_STAGING_CLIENT_ID,
  process.env.KERNEL_CLI_DEV_CLIENT_ID,
].filter(Boolean) as string[];
