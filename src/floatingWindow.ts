export type FloatingSize = "compact" | "expanded";
export type FloatingKind = "pip" | "popup";

export type ScreenBounds = {
  left: number;
  top: number;
  width: number;
  height: number;
};

export type WindowMetrics = {
  innerWidth: number;
  innerHeight: number;
  outerWidth: number;
  outerHeight: number;
  left: number;
  top: number;
};

export type FloatingGeometry = {
  width: number;
  height: number;
  left?: number;
  top?: number;
};

export type GeometryStorage = Pick<Storage, "getItem" | "setItem">;

const STORAGE_KEY = "blinkling-floating-geometry-v1";
const DEFAULTS: Record<FloatingSize, { width: number; height: number }> = {
  compact: { width: 420, height: 520 },
  expanded: { width: 420, height: 680 },
};
const MIN_WIDTH = 320;
const MIN_HEIGHT = 360;
const MAX_DIMENSION = 32_768;
const MAX_POSITION = 1_000_000;

export type StoredGeometry = {
  version: 1;
  dimensions: Partial<
    Record<
      FloatingSize,
      Partial<Record<FloatingKind, { width: number; height: number }>>
    >
  >;
  popupPosition?: { left: number; top: number };
  popupChrome?: { width: number; height: number };
};

let memoryValue: string | null = null;
const fallbackStorage: GeometryStorage = {
  getItem(key) {
    try {
      return memoryValue ?? localStorage.getItem(key);
    } catch {
      return memoryValue;
    }
  },
  setItem(key, value) {
    memoryValue = value;
    try {
      localStorage.setItem(key, value);
    } catch {
      // Window preferences still work for this session if storage is blocked.
    }
  },
};

function defaultStorage(): GeometryStorage {
  return fallbackStorage;
}

export function exportFloatingGeometry(
  storage?: GeometryStorage,
): StoredGeometry {
  return readStored(storage ?? defaultStorage());
}

export function restoreFloatingGeometry(
  value: unknown,
  storage?: GeometryStorage,
): void {
  if (!isRecord(value) || value.version !== 1 || !isRecord(value.dimensions))
    return;
  const normalized = readStored({
    getItem: () => JSON.stringify(value),
    setItem: () => {},
  });
  // A missing config file must not replace preferences already in the browser.
  if (
    !Object.keys(normalized.dimensions).length &&
    !normalized.popupPosition &&
    !normalized.popupChrome
  )
    return;
  try {
    (storage ?? defaultStorage()).setItem(
      STORAGE_KEY,
      JSON.stringify(normalized),
    );
  } catch {
    // Persistence is best effort.
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function readStored(storage: GeometryStorage | undefined): StoredGeometry {
  const empty: StoredGeometry = { version: 1, dimensions: {} };
  try {
    const raw = storage?.getItem(STORAGE_KEY);
    if (!raw) return empty;
    const parsed: unknown = JSON.parse(raw);
    if (
      !isRecord(parsed) ||
      parsed.version !== 1 ||
      !isRecord(parsed.dimensions)
    )
      return empty;
    const dimensions: StoredGeometry["dimensions"] = {};
    for (const size of ["compact", "expanded"] as const) {
      const byKind = parsed.dimensions[size];
      if (!isRecord(byKind)) continue;
      const validKinds: Partial<
        Record<FloatingKind, { width: number; height: number }>
      > = {};
      for (const kind of ["pip", "popup"] as const) {
        const dimension = byKind[kind];
        if (
          isRecord(dimension) &&
          finite(dimension.width) &&
          finite(dimension.height) &&
          dimension.width > 0 &&
          dimension.height > 0 &&
          dimension.width <= MAX_DIMENSION &&
          dimension.height <= MAX_DIMENSION
        ) {
          validKinds[kind] = {
            width: dimension.width,
            height: dimension.height,
          };
        }
      }
      if (Object.keys(validKinds).length) dimensions[size] = validKinds;
    }
    const position = parsed.popupPosition;
    const chrome = parsed.popupChrome;
    return {
      version: 1,
      dimensions,
      ...(isRecord(position) &&
      finite(position.left) &&
      finite(position.top) &&
      Math.abs(position.left) <= MAX_POSITION &&
      Math.abs(position.top) <= MAX_POSITION
        ? { popupPosition: { left: position.left, top: position.top } }
        : {}),
      ...(isRecord(chrome) &&
      finite(chrome.width) &&
      finite(chrome.height) &&
      chrome.width >= 0 &&
      chrome.height >= 0 &&
      chrome.width <= MAX_DIMENSION &&
      chrome.height <= MAX_DIMENSION
        ? { popupChrome: { width: chrome.width, height: chrome.height } }
        : {}),
    };
  } catch {
    return empty;
  }
}

function validScreen(screen: ScreenBounds): boolean {
  return (
    finite(screen.left) &&
    finite(screen.top) &&
    finite(screen.width) &&
    finite(screen.height) &&
    screen.width > 0 &&
    screen.height > 0
  );
}

function clampSize(
  requested: number,
  available: number,
  minimum: number,
): number {
  if (!Number.isFinite(available) || available <= 0) return requested;
  return available >= minimum
    ? Math.min(available, Math.max(minimum, requested))
    : available;
}

export function readFloatingGeometry(
  size: FloatingSize,
  kind: FloatingKind,
  screen: ScreenBounds,
  storage?: GeometryStorage,
): FloatingGeometry {
  const stored = readStored(storage ?? defaultStorage());
  const dimension = stored.dimensions[size]?.[kind] ?? DEFAULTS[size];
  const screenValid = validScreen(screen);
  const chromeWidth = kind === "popup" ? (stored.popupChrome?.width ?? 0) : 0;
  const chromeHeight = kind === "popup" ? (stored.popupChrome?.height ?? 0) : 0;
  const availableWidth = screenValid
    ? Math.max(1, screen.width - chromeWidth)
    : Infinity;
  const availableHeight = screenValid
    ? Math.max(1, screen.height - chromeHeight)
    : Infinity;
  const width = screenValid
    ? clampSize(dimension.width, availableWidth, MIN_WIDTH)
    : dimension.width;
  const height = screenValid
    ? clampSize(dimension.height, availableHeight, MIN_HEIGHT)
    : dimension.height;
  if (kind !== "popup" || !stored.popupPosition || !screenValid)
    return { width, height };

  const outerWidth = width + chromeWidth;
  const outerHeight = height + chromeHeight;
  const maxLeft = screen.left + Math.max(0, screen.width - outerWidth);
  const maxTop = screen.top + Math.max(0, screen.height - outerHeight);
  return {
    width,
    height,
    left: Math.min(maxLeft, Math.max(screen.left, stored.popupPosition.left)),
    top: Math.min(maxTop, Math.max(screen.top, stored.popupPosition.top)),
  };
}

export function rememberFloatingGeometry(
  size: FloatingSize,
  kind: FloatingKind,
  metrics: WindowMetrics,
  storage?: GeometryStorage,
): void {
  if (
    !finite(metrics.innerWidth) ||
    !finite(metrics.innerHeight) ||
    !finite(metrics.outerWidth) ||
    !finite(metrics.outerHeight) ||
    metrics.innerWidth <= 0 ||
    metrics.innerHeight <= 0 ||
    metrics.outerWidth <= 0 ||
    metrics.outerHeight <= 0
  )
    return;
  const target = storage ?? defaultStorage();
  if (!target) return;
  const stored = readStored(target);
  const byKind = stored.dimensions[size] ?? {};
  byKind[kind] = { width: metrics.innerWidth, height: metrics.innerHeight };
  stored.dimensions[size] = byKind;
  if (kind === "popup" && finite(metrics.left) && finite(metrics.top)) {
    stored.popupPosition = { left: metrics.left, top: metrics.top };
    stored.popupChrome = {
      width: Math.max(0, metrics.outerWidth - metrics.innerWidth),
      height: Math.max(0, metrics.outerHeight - metrics.innerHeight),
    };
  }
  try {
    target.setItem(STORAGE_KEY, JSON.stringify(stored));
  } catch {
    // Storage may be disabled or full; geometry persistence is best effort.
  }
}
