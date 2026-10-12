import { HISTORY_LIMIT, HISTORY_TTL_MS } from "./config.js";

export type Capture = {
  at: number;
  image: Buffer;
  width: number;
  height: number;
  source: string;
  signature: string;
  note: string;
};

export class CaptureHistory {
  private readonly entries: Capture[] = [];
  private readonly notes: {
    at: number;
    text: string;
    role: "user" | "assistant";
  }[] = [];
  constructor(
    private readonly limit = HISTORY_LIMIT,
    private readonly ttl = HISTORY_TTL_MS,
  ) {}

  add(capture: Capture): void {
    this.prune();
    this.entries.push(capture);
    while (this.entries.length > this.limit) this.entries.shift();
  }
  addNote(text: string, role: "user" | "assistant"): void {
    this.prune();
    this.notes.push({ at: Date.now(), text: text.slice(0, 2000), role });
    while (this.notes.length > 100) this.notes.shift();
  }
  latest(): Capture | undefined {
    this.prune();
    return this.entries.at(-1);
  }
  all(): Capture[] {
    this.prune();
    return [...this.entries];
  }
  allNotes(): typeof this.notes {
    this.prune();
    return [...this.notes];
  }
  clear(): void {
    this.entries.splice(0);
    this.notes.splice(0);
  }
  prune(now = Date.now()): void {
    while (this.entries.length && this.entries[0]!.at + this.ttl <= now)
      this.entries.shift();
    while (this.notes.length && this.notes[0]!.at + this.ttl <= now)
      this.notes.shift();
  }
}
