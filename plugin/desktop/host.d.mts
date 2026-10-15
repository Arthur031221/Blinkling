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
export type FullPageProgress = { completed: number; total: number };
export type CompanionSession = Pick<
  SessionBridge,
  "subscribe" | "select" | "send" | "stop"
>;
export type PageElementKind =
  | "paragraph"
  | "heading"
  | "image"
  | "figure"
  | "table"
  | "code"
  | "formula"
  | "video"
  | "canvas"
  | "link"
  | "button"
  | "input";
export type PageElement = {
  id: string;
  kind: PageElementKind;
  /** Viewport CSS pixels. */
  rect: { x: number; y: number; width: number; height: number };
  role: string;
  name: string;
  /** Empty for a secure field. */
  text: string;
  parentId?: string;
  /** A password or other secret field: located, never read. */
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
  /** Where the viewport sits on the screen (DIP), and its scale. */
  frame: {
    screenX: number;
    screenY: number;
    devicePixelRatio: number;
    zoom: number;
  };
  elements: PageElement[];
};
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
  /** Null without a helper, a Chrome/Edge window under the point, or on a
   * restricted page. `point` is in screen DIP. */
  elements: (query?: {
    point?: { x: number; y: number };
    signal?: AbortSignal;
  }) => Promise<PageElements | null>;
  translatePage: (options: { on: boolean }) => Promise<{ ok: boolean }>;
  openPdfReader: () => Promise<{ ok: boolean }>;
  close: () => Promise<void>;
}>;
