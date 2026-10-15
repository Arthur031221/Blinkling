import { describe, expect, it } from "vitest";
import { trustSender } from "./trust";

const ok = { id: "me", tab: {}, url: "http://127.0.0.1:43827/install" };

describe("who may hand over the trust secret", () => {
  it("accepts the bridge's setup page on its own port", () => {
    expect(trustSender(ok, 43827, "me")).toBe(true);
    expect(
      trustSender(
        { ...ok, url: "http://localhost:43836/install" },
        43836,
        "me",
      ),
    ).toBe(true);
  });
  it("rejects other pages, ports, origins and senders", () => {
    expect(trustSender(ok, 43828, "me")).toBe(false);
    expect(
      trustSender({ ...ok, url: "http://127.0.0.1:3000/install" }, 3000, "me"),
    ).toBe(false);
    expect(
      trustSender({ ...ok, url: "http://127.0.0.1:43827/other" }, 43827, "me"),
    ).toBe(false);
    expect(
      trustSender(
        { ...ok, url: "https://127.0.0.1:43827/install" },
        43827,
        "me",
      ),
    ).toBe(false);
    expect(
      trustSender(
        { ...ok, url: "http://evil.example:43827/install" },
        43827,
        "me",
      ),
    ).toBe(false);
    expect(trustSender({ ...ok, id: "other" }, 43827, "me")).toBe(false);
    expect(trustSender({ id: "me", url: ok.url }, 43827, "me")).toBe(false);
    expect(trustSender({ ...ok, url: "not a url" }, 43827, "me")).toBe(false);
  });
});
