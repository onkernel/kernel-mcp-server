/**
 * Network diagnostics Draft – shared types
 *
 * Purpose:
 * - Provide a single, typed surface for network-diagnostics tooling (`capture_network_*`,
 *   `block_*`, `analyze_*`) used by `src/app/[transport]/route.ts`.
 * Future Plan:
 * - src/lib/network/capture.ts   // start/stop capture
 * - src/lib/network/block.ts
 * - src/lib/network/analyze.ts
 * - src/lib/network/types.ts     // shared type definitions
 */

export type NetworkResourceType =
  | "document"
  | "stylesheet"
  | "image"
  | "media"
  | "font"
  | "script"
  | "texttrack"
  | "xhr"
  | "fetch"
  | "eventsource"
  | "websocket"
  | "manifest"
  | "other";

export type NetworkEntry = {
  url: string;
  method: string;
  status?: number;
  type?: NetworkResourceType;
  duration_ms?: number;
  size_bytes?: number;
  request_headers?: Record<string, string>;
  response_headers?: Record<string, string>;
  body_snippet?: string;
};

export type BlockProfile = "aggressive" | "balanced" | "minimal";

export function startNetworkCapture(): void {}

export function stopNetworkCapture(): void {}
