/** All screen geometry is DIP unless explicitly labelled pixels. */
export type Rect = { x: number; y: number; width: number; height: number };
export type Display = {
  id: string;
  bounds: Rect;
  workArea: Rect;
  scaleFactor: number;
};
export type Attachment = {
  id: string;
  name: string;
  mediaType: string;
  data: string;
};
export type Capture = {
  id: string;
  display: Display;
  pixelWidth: number;
  pixelHeight: number;
  image: Attachment;
  region: Rect;
  capturedAt: number;
};
export type Turn = {
  id: string;
  text: string;
  attachments: Attachment[];
  source: "composer" | "quick-ask" | "guide" | "auto-explain" | "companion";
};
export type Selection = {
  model: string;
  effort: "low" | "medium" | "high" | "xhigh" | "max";
};
export type SessionEvent =
  | {
      type: "status";
      state: "starting" | "connected" | "retrying" | "blocked";
      detail?: string;
    }
  | { type: "identity"; localId: string; remoteId: string; url: string }
  | {
      type: "message";
      id: string;
      role: "user" | "assistant";
      content: unknown[];
    }
  | { type: "delta"; id: string; text: string }
  | { type: "selection"; applied: Selection }
  | { type: "done"; turnId: string };
export interface SessionBridge {
  connect(originSessionId?: string): Promise<void>;
  send(turn: Turn): Promise<void>;
  select(selection: Selection): Promise<Selection>;
  stop(): Promise<void>;
  subscribe(listener: (event: SessionEvent) => void): () => void;
  dispose(): Promise<void>;
}
export interface CaptureService {
  screen(displayId: string): Promise<Capture>;
  region(displayId: string, signal: AbortSignal): Promise<Capture | null>;
  fullPage(): Promise<Capture | { companionRequired: true }>;
}
export type Drawing = { id: string; rect: Rect; label: string; step: number };
export interface OverlayService {
  show(capture: Capture, drawings: Drawing[]): Promise<void>;
  step(index: number): void;
  dismiss(): void;
}
export type Action =
  | "screen"
  | "region"
  | "full-page"
  | "guide"
  | "auto-explain"
  | "chat"
  | "settings"
  | "help"
  | "guide-next"
  | "guide-back"
  | "guide-overview"
  | "guide-dismiss";
export type CaptureGuideEvent =
  | { type: "capture"; capture: Capture }
  | {
      type: "capture-status";
      state: string;
      message?: string;
      enabled?: boolean;
    }
  | {
      type: "guide";
      phase: "thinking" | "overview" | "step" | "dismissed" | "error";
      bubbles?: string[];
      index?: number;
      total?: number;
      canBack?: boolean;
      canNext?: boolean;
      message?: string;
    };
export interface DesktopAPI {
  shell(command: ShellCommand): Promise<ShellState>;
  onShell(listener: (event: ShellEvent) => void): () => void;
  action(action: Action): Promise<{ ok: boolean; reason?: string }>;
  interactive(regions: Rect[]): void;
  onEvent(
    listener: (event: SessionEvent | CaptureGuideEvent) => void,
  ): () => void;
}

/** Shell owns visibility/input only; feature code mounts into renderer slots and
 * registers menu handlers with main/services.mjs. Coordinates remain DIP. */
export type ShellCommand =
  | { type: "state" }
  | { type: "drag"; phase: "start" | "end" }
  | { type: "pin"; value: boolean }
  | { type: "visibility"; value: boolean }
  | { type: "close-chat" }
  | { type: "activity" };
export type ShellState = {
  display: Display;
  position: {
    edge: "left" | "right" | "top" | "bottom";
    ratio: number;
    peek: { x: number; y: number };
    reveal: { x: number; y: number };
    area: Rect;
  };
  drag: { x: number; y: number; velocity: number } | null;
  pinned: boolean;
  chatOpen: boolean;
  chatFocused: boolean;
  autoExplain: boolean;
  theme: "light" | "dark";
};
export type ShellEvent =
  | { type: "state"; state: ShellState }
  | { type: "cursor"; point: { x: number; y: number }; hit: boolean }
  | { type: "chat-blur" }
  | { type: "chat-activity" }
  | { type: "focus-composer" }
  | { type: "view"; view: "settings" | "help" }
  | { type: "capture"; capture: Capture };
