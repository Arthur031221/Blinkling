import { describe, it, expect, vi } from "vitest";
import { LiveChannel } from "./live-channel.js";
import type { ProviderRequest } from "./provider-request.js";
const request = (controller = new AbortController()): ProviderRequest => ({
  question: "Where is Export?",
  model: "sonnet",
  backend: "cli",
  kind: "ask",
  context: [],
  signal: controller.signal,
  onText: vi.fn(),
  image: Buffer.from("image"),
});
describe("running session channel", () => {
  it("requires a nonce delivered through the channel, then streams scoped replies", async () => {
    const push = vi.fn().mockResolvedValue(undefined);
    const channel = new LiveChannel(push);
    await channel.probe();
    expect(() => channel.confirm("wrong")).toThrow();
    channel.confirm(push.mock.calls[0][0].params.meta.nonce);
    const input = request();
    const answer = channel.ask(input);
    const id = push.mock.calls[1][0].params.meta.request_id;
    expect(channel.context(id)).toEqual(input.image);
    expect(() => channel.reply("other", "leak", true)).toThrow();
    channel.reply(id, "Export ", false);
    channel.reply(id, "is on the right.", true);
    expect(input.onText).toHaveBeenNthCalledWith(1, "Export ");
    expect(await answer).toEqual({ answer: "Export is on the right." });
    expect(() => channel.context(id)).toThrow();
  });
  it("discards late replies after stop without starting a second provider", async () => {
    const push = vi.fn().mockResolvedValue(undefined);
    const channel = new LiveChannel(push);
    await channel.probe();
    channel.confirm(push.mock.calls[0][0].params.meta.nonce);
    const controller = new AbortController();
    const answer = channel.ask(request(controller));
    const id = push.mock.calls[1][0].params.meta.request_id;
    controller.abort();
    await expect(answer).rejects.toThrow("terminal may still be working");
    expect(() => channel.reply(id, "late", true)).toThrow();
  });
  it("cannot use ordinary tool setup as proof of live delivery", async () => {
    const channel = new LiveChannel(async () => {});
    await expect(channel.ask(request())).rejects.toThrow("not connected");
    expect(() => channel.confirm("anything")).toThrow();
  });
});
