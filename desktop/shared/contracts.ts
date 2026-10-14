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
      type: "activity";
      state: "idle" | "thinking" | "permission" | "finished" | "error";
    }
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
  | "help";
export type ShellState = {
  displayId: string;
  workArea: Rect;
  edge: "left" | "right" | "top" | "bottom";
  peek: { x: number; y: number };
  revealed: { x: number; y: number };
  pinned: boolean;
  dragging: boolean;
  chatOpen: boolean;
};
export type ShellCommand =
  | { type: "state" | "drag-end" | "close-chat" }
  | { type: "drag-start"; anchor: { x: number; y: number } }
  | { type: "pin"; value: boolean };
export type ShellEvent =
  | { type: "pointer"; inside: boolean }
  | { type: "state"; state: ShellState; rebase: boolean };
export interface DesktopAPI {
  shell(command: ShellCommand): Promise<ShellState>;
  onShell(listener: (event: ShellEvent) => void): () => void;
  action(
    action: Action,
  ): Promise<{ ok: boolean; reason?: string; enabled?: boolean }>;
  interactive(regions: Rect[]): void;
  onEvent(listener: (event: SessionEvent) => void): () => void;
}
