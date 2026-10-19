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
    /** Where the viewport stands on the page, and the page's size, in CSS pixels. */
    scrollX: number;
    scrollY: number;
    pageWidth: number;
    pageHeight: number;
    /** The visible part of the page, in CSS pixels. */
    viewWidth: number;
    viewHeight: number;
  };
  elements: PageElement[];
};
export type FullPageProgress = { completed: number; total: number };
export type CompanionSession = Pick<
  SessionBridge,
  "subscribe" | "select" | "send" | "stop"
>;
export type LinkedSession = {
  session: string;
  pid: number;
  cwd: string;
  /** Started with the channel flag: it can answer Blink's chat itself. */
  channel: boolean;
};
export function startDesktopHost(options?: {
  directory?: string;
  descriptor?: string;
  version?: string;
  session?: CompanionSession;
  onOpen?: (from: { session: string }) => unknown;
  onShutdown?: () => unknown;
  onMirror?: (line: {
    role: "user" | "assistant";
    text: string;
    id: string;
    session: string;
  }) => unknown;
  onLink?: (link: LinkedSession) => unknown;
  onUnlink?: (link: { session: string }) => unknown;
  onReply?: (reply: { session: string; turn: string; text: string }) => unknown;
  onTurnEnd?: (end: { session: string; text: string }) => unknown;
  chatImages?: (from: {
    session: string;
  }) => Promise<{ mediaType: string; data: string }[]>;
}): Promise<{
  address: DesktopEndpoint;
  attachSession: (session: CompanionSession | undefined) => void;
  /** The linked Claude Code sessions, oldest first. */
  links: () => LinkedSession[];
  /** One frame to a session started with the channel flag; false if it is not. */
  toSession: (session: string, frame: Record<string, unknown>) => boolean;
  /** Blink is closing: a notice event to each channel session and a mark for
   * every other linked session; how many channel sessions took it. */
  announceQuit: () => Promise<number>;
  /** The same frame to every channel session; how many took it. */
  toChannels: (frame: Record<string, unknown>) => number;
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
  /** Scrolls the page under a screen point (DIP) to page coordinates (CSS pixels). */
  scrollPage: (options?: {
    point?: { x: number; y: number };
    x?: number;
    y?: number;
    signal?: AbortSignal;
  }) => Promise<{ ok: boolean }>;
  translatePage: (options?: {
    on?: boolean;
    signal?: AbortSignal;
  }) => Promise<{ ok: boolean }>;
  openPdfReader: (options?: {
    signal?: AbortSignal;
  }) => Promise<{ ok: boolean }>;
  close: () => Promise<void>;
}>;
