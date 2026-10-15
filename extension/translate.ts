/** Translates a page's visible text in place and puts it back. Runs in the page;
 * the service worker owns the batching and the call to Blink. */
export const TRANSLATED_ATTRIBUTE = "data-blinkling-translated";
const SKIPPED =
  "script,style,noscript,template,textarea,input,select,option,code,pre,svg,math,[contenteditable],[contenteditable] *";

export class PageTranslation {
  private nodes: Text[] = [];
  private readonly originals = new Map<
    Text,
    { original: string; written: string }
  >();
  constructor(private readonly doc: Document = document) {}

  /** The text nodes worth translating, in reading order. Replaces any earlier list. */
  collect(): string[] {
    const walker = this.doc.createTreeWalker(
      this.doc.body,
      NodeFilter.SHOW_TEXT,
    );
    const nodes: Text[] = [];
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const text = node as Text;
      const parent = text.parentElement;
      if (!parent || !(text.data ?? "").trim() || parent.closest(SKIPPED))
        continue;
      if (/^\s*[\d\s.,:;/\-–—+*()%$€£¥]*$/.test(text.data)) continue;
      nodes.push(text);
    }
    this.nodes = nodes;
    return nodes.map((node) => this.originals.get(node)?.original ?? node.data);
  }

  /** Writes translations over nodes starting at `from`; a node the page changed since is left alone. */
  apply(from: number, texts: string[]): number {
    let written = 0;
    texts.forEach((translated, offset) => {
      const node = this.nodes[from + offset];
      if (
        !node ||
        !node.isConnected ||
        typeof translated !== "string" ||
        !translated.trim()
      )
        return;
      const known = this.originals.get(node);
      if (known && node.data !== known.written) return;
      const original = known?.original ?? node.data;
      const lead = /^\s*/.exec(original)![0];
      const trail = /\s*$/.exec(original)![0];
      const data = `${lead}${translated.trim()}${trail}`;
      this.originals.set(node, { original, written: data });
      node.data = data;
      written++;
    });
    if (this.originals.size)
      this.doc.documentElement.setAttribute(TRANSLATED_ATTRIBUTE, "true");
    return written;
  }

  /** Puts every untouched translated node back to the page's own text. */
  restore(): void {
    for (const [node, { original, written }] of this.originals)
      if (node.isConnected && node.data === written) node.data = original;
    this.originals.clear();
    this.nodes = [];
    this.doc.documentElement.removeAttribute(TRANSLATED_ATTRIBUTE);
  }

  get active(): boolean {
    return this.originals.size > 0;
  }
}
