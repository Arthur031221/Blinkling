import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { steadyPresence } from "./steady-presence";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

it("stays online across a reconnect shorter than the grace period", () => {
  const show = vi.fn();
  const presence = steadyPresence(show, 5000);
  presence.up();
  presence.down();
  vi.advanceTimersByTime(3000);
  presence.up();
  vi.advanceTimersByTime(60_000);
  expect(show.mock.calls).toEqual([[true], [true]]);
});

it("repeated short drops never flip the state", () => {
  const show = vi.fn();
  const presence = steadyPresence(show, 5000);
  presence.up();
  for (let i = 0; i < 20; i++) {
    presence.down();
    vi.advanceTimersByTime(2000);
    presence.up();
  }
  expect(show).not.toHaveBeenCalledWith(false);
});

it("goes offline once, after the grace period, and back online at once", () => {
  const show = vi.fn();
  const presence = steadyPresence(show, 5000);
  presence.up();
  presence.down();
  presence.down();
  vi.advanceTimersByTime(4999);
  expect(show).not.toHaveBeenCalledWith(false);
  vi.advanceTimersByTime(1);
  expect(show.mock.calls.filter(([online]) => !online)).toHaveLength(1);
  presence.up();
  expect(show).toHaveBeenLastCalledWith(true);
});

it("a definite answer is shown without waiting, and disposing stops a pending flip", () => {
  const show = vi.fn();
  const presence = steadyPresence(show, 5000);
  presence.set(false);
  expect(show).toHaveBeenLastCalledWith(false);
  presence.up();
  presence.down();
  presence.dispose();
  vi.advanceTimersByTime(10_000);
  expect(show).toHaveBeenLastCalledWith(true);
});
