import type { SessionBridge, Capture } from "../../desktop/shared/contracts.js";
import type { DesktopEndpoint } from "./client.mjs";
export type CompanionCapture = Pick<
  Capture,
  "id" | "image" | "pixelWidth" | "pixelHeight" | "capturedAt"
> & { page?: unknown };
export type CompanionSession = Pick<
  SessionBridge,
  "subscribe" | "select" | "send" | "stop"
>;
export function startDesktopHost(options?: {
  directory?: string;
  descriptor?: string;
  version?: string;
  session?: CompanionSession;
  onOpen?: () => unknown;
  onShutdown?: () => unknown;
}): Promise<{
  address: DesktopEndpoint;
  attachSession: (session: CompanionSession | undefined) => void;
  openCompanionGuide: () => Promise<void>;
  fullPage: (
    signal?: AbortSignal,
  ) => Promise<CompanionCapture | { companionRequired: true }>;
  close: () => Promise<void>;
}>;
