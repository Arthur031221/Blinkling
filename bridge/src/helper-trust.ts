import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { chmodSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { runtimeDirectory } from "../../plugin/desktop/paths.mjs";

const CODE_LIFETIME_MS = 30 * 60_000;
const SECRET = /^[0-9a-f]{64}$/;

export const helperTrustPath = () => join(runtimeDirectory(), "helper.json");

/**
 * The one long-lived secret shared by this computer's bridge and the companion
 * extension. It lives in a user-only file so a restarted bridge still trusts a
 * helper that was set up before, and it is proven by a mutual HMAC challenge,
 * never sent over the socket. The install page receives it once through a
 * link code that is carried in the URL fragment and never typed or shown.
 */
export class HelperTrust {
  private value?: string;
  private readonly codes = new Map<
    string,
    { expires: number; used: boolean }
  >();

  constructor(
    private readonly file: string | null = helperTrustPath(),
    private readonly now: () => number = Date.now,
  ) {}

  /** The secret, created on first use. */
  secret(): string {
    if (this.value) return this.value;
    if (this.file) {
      try {
        const stored = JSON.parse(readFileSync(this.file, "utf8")).secret;
        if (typeof stored === "string" && SECRET.test(stored))
          return (this.value = stored);
      } catch {
        /* Missing or damaged: make a new one. */
      }
    }
    this.value = randomBytes(32).toString("hex");
    if (this.file) {
      mkdirSync(dirname(this.file), { recursive: true, mode: 0o700 });
      writeFileSync(this.file, JSON.stringify({ secret: this.value }), {
        mode: 0o600,
      });
      chmodSync(this.file, 0o600);
    }
    return this.value;
  }

  /** A single-use link code for one install page. */
  issueCode(): string {
    this.prune();
    const code = randomBytes(8).toString("hex").toUpperCase();
    this.codes.set(code, {
      expires: this.now() + CODE_LIFETIME_MS,
      used: false,
    });
    return code;
  }

  /** True while the page that was opened with this code may still ask. */
  codeKnown(code: string): boolean {
    this.prune();
    return this.codes.has(code);
  }

  /** The secret, handed over once per code. */
  redeem(code: string): string | undefined {
    this.prune();
    const entry = this.codes.get(code);
    if (!entry || entry.used) return undefined;
    entry.used = true;
    return this.secret();
  }

  proof(role: "client" | "server", first: string, second: string): string {
    return createHmac("sha256", this.secret())
      .update(`${role}:${first}:${second}`)
      .digest("hex");
  }

  verify(proof: unknown, expected: string): boolean {
    if (typeof proof !== "string" || proof.length !== expected.length)
      return false;
    return timingSafeEqual(Buffer.from(proof), Buffer.from(expected));
  }

  private prune(): void {
    for (const [code, entry] of this.codes)
      if (entry.expires <= this.now()) this.codes.delete(code);
  }
}
