import type { SessionBridge, Capture } from "../../desktop/shared/contracts.js";
import type { DesktopEndpoint } from "./client.mjs";
export type CompanionCapture = Pick<
  Capture,
  "id" | "image" | "pixelWidth" | "pixelHeight" | "capturedAt"
> & { page?: unknown };
export type CompanionPage = CompanionCapture & {
  /** Every tile top to bottom; the capture itself is the first. */
  tiles: CompanionCapture[];
  /** The page was longer than the tiles can hold. */
  truncated: boolean;
};
export type ElementRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};
export type PageElement = {
  id: string;
  kind: string;
  /** Lowercase tag name ("canvas", "td"), or "" when the helper sent none. */
  tag: string;
  /** Viewport CSS px. */
  rect: ElementRect;
  role: string;
  name: string;
  text: string;
  parentId: string | null;
  /** A password or payment field: it never carries a name, text or content. */
  secure: boolean;
  content?: {
    markdown?: string;
    code?: string;
    language?: string;
    latex?: string;
    mathml?: string;
  };
};
export type PageElements = {
  page: { url: string; title: string; tabId: number; incognito: boolean };
  frame: {
    screenX: number;
    screenY: number;
    devicePixelRatio: number;
    zoom: number;
  };
  elements: PageElement[];
};
export type FullPageProgress = { completed: number; total: number };
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
    onProgress?: (progress: FullPageProgress) => void,
  ) => Promise<CompanionPage | { companionRequired: true }>;
  /** Page structure under a screen point (DIP); null with no helper, no browser window there, or a restricted page. */
  elements: (query?: {
    point?: { x: number; y: number };
    signal?: AbortSignal;
    /** Skip the helper's short cache, for the read a click depends on. */
    fresh?: boolean;
  }) => Promise<PageElements | null>;
  translatePage: (options?: {
    on?: boolean;
    signal?: AbortSignal;
  }) => Promise<{ ok: boolean }>;
  openPdfReader: (options?: {
    signal?: AbortSignal;
  }) => Promise<{ ok: boolean }>;
  close: () => Promise<void>;
}>;
