export type GuideStep = { elementId: string; note: string; action?: string };
export type TranslationNode = { id: string; text: string };

/** Accept structured model output only when every reference belongs to the current page map. */
export function validateGuideSteps(
  value: unknown,
  knownElementIds: ReadonlySet<string>,
): GuideStep[] {
  if (
    !value ||
    typeof value !== "object" ||
    !Array.isArray((value as { steps?: unknown }).steps)
  )
    return [];
  const seen = new Set<string>();
  const steps: GuideStep[] = [];
  for (const item of (value as { steps: unknown[] }).steps.slice(0, 12)) {
    if (!item || typeof item !== "object") continue;
    const step = item as Record<string, unknown>;
    if (
      typeof step.elementId !== "string" ||
      !knownElementIds.has(step.elementId) ||
      seen.has(step.elementId)
    )
      continue;
    if (typeof step.note !== "string" || !step.note.trim()) continue;
    seen.add(step.elementId);
    steps.push({
      elementId: step.elementId,
      note: step.note.trim().slice(0, 360),
      ...(typeof step.action === "string"
        ? { action: step.action.trim().slice(0, 120) }
        : {}),
    });
  }
  return steps;
}

/** Accept complete translations for requested nodes and reject blank or oversized output. */
export function validateTranslationNodes(
  value: unknown,
  supplied: ReadonlyMap<string, string>,
): TranslationNode[] {
  if (
    !value ||
    typeof value !== "object" ||
    !Array.isArray((value as { nodes?: unknown }).nodes)
  )
    return [];
  const seen = new Set<string>();
  const translated: TranslationNode[] = [];
  for (const item of (value as { nodes: unknown[] }).nodes.slice(0, 160)) {
    if (!item || typeof item !== "object") continue;
    const node = item as Record<string, unknown>;
    if (
      typeof node.id !== "string" ||
      !supplied.has(node.id) ||
      seen.has(node.id) ||
      typeof node.text !== "string" ||
      !node.text.trim()
    )
      continue;
    if (
      node.text.length > 12_000 ||
      node.text.length > Math.max(1000, supplied.get(node.id)!.length * 8)
    )
      continue;
    seen.add(node.id);
    translated.push({ id: node.id, text: node.text });
  }
  return translated;
}
