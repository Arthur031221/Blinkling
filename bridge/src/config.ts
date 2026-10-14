export const PORT = Number(process.env.BLINKLING_PORT ?? 43827);
export const HISTORY_LIMIT = 12;
export const HISTORY_TTL_MS = 10 * 60_000;
export const WATCH_LIMIT_PER_MINUTE = 6;
export const MAX_PNG_BYTES = 8 * 1024 * 1024;
export const MAX_UPLOAD_MESSAGE_BYTES =
  Math.ceil((MAX_PNG_BYTES * 4) / 3) + 64_000;
export const MAX_PIXELS = 40_000_000;
export const MAX_LONG_EDGE = 4096;
export const DEFAULT_LONG_EDGE = 1568;

export function positiveInteger(
  value: unknown,
  fallback: number,
  max: number,
): number {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isSafeInteger(number) && number > 0
    ? Math.min(number, max)
    : fallback;
}
