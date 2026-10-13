export function boundedHistory<T extends { pinned?: boolean; image?: string }>(
  entries: T[],
): T[] {
  const pinned = entries.filter((entry) => entry.pinned).slice(-8);
  const keep = new Set([
    ...pinned,
    ...entries.filter((entry) => !entry.pinned).slice(-(40 - pinned.length)),
  ]);
  const selected = entries.filter((entry) => keep.has(entry));
  const images = new Set(selected.filter((entry) => entry.image).slice(-8));
  return selected.map((entry) =>
    entry.image && !images.has(entry) ? { ...entry, image: undefined } : entry,
  );
}
