export class SlidingWindowLimiter {
  private readonly times: number[] = [];
  constructor(
    private readonly maximum: number,
    private readonly windowMs: number,
  ) {}
  take(now = Date.now(), maximum = this.maximum): boolean {
    while (this.times.length && this.times[0]! <= now - this.windowMs)
      this.times.shift();
    if (this.times.length >= Math.min(this.maximum, maximum)) return false;
    this.times.push(now);
    return true;
  }
  clear(): void {
    this.times.splice(0);
  }
  get size(): number {
    return this.times.length;
  }
}
