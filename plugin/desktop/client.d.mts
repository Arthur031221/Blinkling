export type DesktopEndpoint = {
  url: string;
  token: string;
  version: string;
  pid: number;
};
export type DesktopStatus = {
  version: string;
  pid: number;
  session: boolean;
  companion: boolean;
  identity?: { localId: string };
  selection?: { model: string; effort: string };
};
export class DesktopClient {
  constructor(endpoint: DesktopEndpoint);
  endpoint: DesktopEndpoint;
  status(timeoutMs?: number): Promise<DesktopStatus>;
  rpc(
    method: string,
    value?: Record<string, unknown>,
    signal?: AbortSignal,
  ): Promise<unknown>;
  events(
    onEvent: (frame: {
      sequence: number;
      event: Record<string, unknown>;
    }) => void,
    signal: AbortSignal,
    after?: number,
    onReady?: () => void,
    path?: string,
  ): Promise<void>;
  /** Holds the line a Claude Code session keeps open to Blink. */
  link(
    params: {
      session: string;
      pid: number;
      cwd: string;
      channel: 0 | 1;
    },
    onEvent: (frame: Record<string, unknown>) => void,
    signal: AbortSignal,
    onReady?: () => void,
  ): Promise<void>;
}
export function discoverDesktop(
  path?: string,
  options?: { timeoutMs?: number; removeStale?: boolean },
): Promise<{ client: DesktopClient; status: DesktopStatus } | undefined>;
