import test from "node:test";
import assert from "node:assert/strict";
import { createRaiser } from "./raise.mjs";

const win = (id, destroyed = false) => ({
  isDestroyed: () => destroyed,
  getNativeWindowHandle: () => {
    const b = Buffer.alloc(4);
    b.writeUInt32LE(id);
    return b;
  },
});
const fake = () => {
  const raised = [];
  let ready;
  const client = { RaiseWindow: (id) => raised.push(id), on() {}, terminate() { this.ended = true; } };
  return { raised, client, connect: (cb) => ((ready = cb), client), open: (error) => ready(error) };
};

test("raising puts each live window on top of the X stack, in order", () => {
  const x = fake();
  const r = createRaiser({ platform: "linux", display: ":1", connect: x.connect });
  x.open(null);
  r.raise([win(10), win(11, true), win(12)]);
  assert.deepEqual(x.raised, [10, 12]);
});

test("nothing is raised before the connection is up or after it fails", () => {
  const x = fake();
  const r = createRaiser({ platform: "linux", display: ":1", connect: x.connect });
  r.raise([win(1)]);
  x.open(new Error("no display"));
  r.raise([win(1)]);
  assert.deepEqual(x.raised, []);
});

test("off Linux, or without a display, the raiser does nothing and never connects", () => {
  const never = () => assert.fail("connected");
  createRaiser({ platform: "darwin", display: ":1", connect: never }).raise([win(1)]);
  createRaiser({ platform: "linux", display: "", connect: never }).raise([win(1)]);
});

test("dispose closes the connection and stops raising", () => {
  const x = fake();
  const r = createRaiser({ platform: "linux", display: ":1", connect: x.connect });
  x.open(null);
  r.dispose();
  r.raise([win(3)]);
  assert.equal(x.client.ended, true);
  assert.deepEqual(x.raised, []);
});
