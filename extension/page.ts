import { collectElements } from "./elements";
import { contextTextNode, restorableTextNode } from "./page-text";
import { hasSensitiveContent } from "./privacy";

/**
 * Injected on demand into the tab the user is looking at (never on page load).
 * It answers the background's questions: page structure, the text nodes to
 * translate and the writes that put the translation in place.
 */
const scope = globalThis as typeof globalThis & {
  blinklingPageReady?: boolean;
};
if (!scope.blinklingPageReady) {
  scope.blinklingPageReady = true;
  const originals = new Map<
    string,
    { node: Text; text: string; lastWritten?: string }
  >();
  const nodeIds = new WeakMap<Text, string>();
  let nextTextId = 1;
  function textNodeId(node: Text): string {
    let id = nodeIds.get(node);
    if (!id) {
      id = `t${nextTextId++}`;
      nodeIds.set(node, id);
    }
    return id;
  }

  chrome.runtime.onMessage.addListener(
    (
      message: Record<string, unknown>,
      _sender: unknown,
      respond: (value: unknown) => void,
    ) => {
      if (message.type === "blinkling:elements") {
        const near = message.near as { x?: unknown; y?: unknown } | undefined;
        const page = collectElements(document, {
          near:
            near && Number.isFinite(near.x) && Number.isFinite(near.y)
              ? { x: Number(near.x), y: Number(near.y) }
              : undefined,
        });
        respond({
          ...page,
          title: document.title,
          url: location.href,
          innerWidth: window.innerWidth,
          innerHeight: window.innerHeight,
          devicePixelRatio: window.devicePixelRatio,
        });
        return;
      }
      if (message.type === "blinkling:text-nodes") {
        if (hasSensitiveContent(document, true)) {
          respond({ error: "password_page" });
          return;
        }
        const nodes: Array<{ id: string; text: string }> = [];
        const cursor = Math.max(0, Math.floor(Number(message.cursor) || 0));
        const walker = document.createTreeWalker(
          document.body,
          NodeFilter.SHOW_TEXT,
        );
        let node: Node | null;
        let size = 0;
        let index = 0;
        let hasMore = false;
        while ((node = walker.nextNode())) {
          if (!(node instanceof Text)) continue;
          const retainedId = nodeIds.get(node);
          let original = retainedId ? originals.get(retainedId) : undefined;
          const retainedEmpty =
            original?.node === node &&
            original.lastWritten === "" &&
            node.nodeValue === "";
          if (!contextTextNode(node, retainedEmpty)) continue;
          if (index < cursor) {
            index++;
            continue;
          }
          let id = retainedId ?? textNodeId(node);
          if (
            original &&
            node.nodeValue !== (original.lastWritten ?? original.text)
          ) {
            originals.delete(id);
            nodeIds.delete(node);
            id = textNodeId(node);
            original = undefined;
          }
          const sourceText = original?.text ?? node.nodeValue!;
          if (sourceText.length > 12_000) {
            respond({ error: "translation_incomplete" });
            return;
          }
          if (nodes.length >= 160 || size + sourceText.length > 24_000) {
            hasMore = true;
            break;
          }
          if (!original) originals.set(id, { node, text: sourceText });
          nodes.push({ id, text: sourceText });
          size += sourceText.length;
          index++;
        }
        respond({ nodes, ...(hasMore ? { nextCursor: index } : {}) });
        return;
      }
      if (
        message.type === "blinkling:translate" &&
        Array.isArray(message.nodes)
      ) {
        if (hasSensitiveContent(document, true)) {
          respond({ error: "password_page" });
          return;
        }
        let applied = 0;
        let changed = 0;
        let rejected = 0;
        const skipped = { disconnected: 0, sourceChanged: 0, ineligible: 0 };
        for (const entry of (
          message.nodes as Array<{ id?: string; text?: string }>
        ).slice(0, 160)) {
          if (
            !entry ||
            typeof entry.id !== "string" ||
            typeof entry.text !== "string"
          ) {
            rejected++;
            continue;
          }
          const original = originals.get(entry.id);
          if (!original || entry.text.length > 12_000) {
            rejected++;
            continue;
          }
          if (!original.node.isConnected) {
            skipped.disconnected++;
            continue;
          }
          if (
            !contextTextNode(
              original.node,
              original.lastWritten === "" && original.node.nodeValue === "",
            )
          ) {
            skipped.ineligible++;
            continue;
          }
          if (
            original.node.nodeValue !== (original.lastWritten ?? original.text)
          ) {
            originals.delete(entry.id);
            nodeIds.delete(original.node);
            skipped.sourceChanged++;
            continue;
          }
          if (original.node.nodeValue !== entry.text) {
            original.node.nodeValue = entry.text;
            original.lastWritten = entry.text;
            changed++;
            original.node.parentElement?.setAttribute(
              "data-blinkling-translated",
              "true",
            );
          }
          applied++;
        }
        respond({ applied, changed, skipped, rejected });
        return;
      }
      if (message.type === "blinkling:restore") {
        let restored = 0;
        for (const [id, entry] of originals) {
          if (
            entry.node.isConnected &&
            restorableTextNode(entry.node) &&
            entry.lastWritten !== undefined &&
            entry.node.nodeValue === entry.lastWritten
          ) {
            entry.node.nodeValue = entry.text;
            entry.node.parentElement?.removeAttribute(
              "data-blinkling-translated",
            );
            restored++;
          }
          originals.delete(id);
          nodeIds.delete(entry.node);
        }
        respond({ restored });
        return;
      }
    },
  );
}
