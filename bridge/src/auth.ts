import { randomBytes } from "node:crypto";

export class OneTimeTokens {
  private values = new Map<string, number>();
  constructor(
    private readonly ttlMs = 60_000,
    private readonly now = () => Date.now(),
  ) {}
  issue() {
    for (const [value, expiry] of this.values)
      if (expiry <= this.now()) this.values.delete(value);
    if (this.values.size >= 32)
      this.values.delete(this.values.keys().next().value!);
    const token = randomBytes(32).toString("base64url");
    this.values.set(token, this.now() + this.ttlMs);
    return token;
  }
  consume(token: string) {
    const expiry = this.values.get(token);
    this.values.delete(token);
    return expiry !== undefined && expiry > this.now();
  }
  clear() {
    this.values.clear();
  }
}
