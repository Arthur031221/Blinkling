import test from "node:test";
import assert from "node:assert/strict";
import { createProgress } from "./progress.mjs";

const setup = () => {
  const now = { t: 0 };
  const queue = [];
  const timers = {
    setTimeout: (fn, ms) => {
      const job = { fn, at: now.t + ms };
      queue.push(job);
      return job;
    },
    clearTimeout: (job) => {
      const i = queue.indexOf(job);
      if (i >= 0) queue.splice(i, 1);
    },
  };
  const said = [];
  const progress = createProgress({
    slow: 400,
    say: (key) => said.push(["say", key, now.t]),
    take: () => said.push(["take", now.t]),
    timers,
  });
  const wait = (ms) => {
    const end = now.t + ms;
    for (;;) {
      queue.sort((a, b) => a.at - b.at);
      const next = queue[0];
      if (!next || next.at > end) break;
      queue.shift();
      now.t = next.at;
      next.fn();
    }
    now.t = end;
  };
  return { progress, said, wait };
};

test("a capture with no selection says it is working once it has taken longer than a moment", () => {
  const { progress, said, wait } = setup();
  progress.begin();
  wait(399);
  assert.deepEqual(said, []);
  wait(2);
  assert.deepEqual(said, [["say", "working", 400]]);
});

test("the reader's own time choosing a region is never reported as slow", () => {
  const { progress, said, wait } = setup();
  progress.begin();
  progress.stage("select");
  wait(30000);
  assert.deepEqual(said, [], "a slow selection says nothing");
  progress.stage("selected");
  wait(399);
  assert.deepEqual(said, []);
  wait(2);
  assert.deepEqual(said, [["say", "working", 30400]]);
});

test("a whole page read says so at once, and what was said is taken back before the eat", () => {
  const { progress, said, wait } = setup();
  progress.begin();
  progress.stage("select");
  progress.stage("selected");
  progress.stage("page");
  assert.deepEqual(said, [["say", "page", 0]]);
  wait(5000);
  assert.equal(said.length, 1, "the slow clock does not say it again");
  progress.delivered();
  assert.deepEqual(said.at(-1), ["take", 5000]);
});

test("a picture that arrives before anything was said takes nothing back and stops the clock", () => {
  const { progress, said, wait } = setup();
  progress.begin();
  wait(100);
  progress.delivered();
  wait(1000);
  assert.deepEqual(said, []);
  assert.equal(progress.spoke, false);
});

test("a new capture starts without what the last one said", () => {
  const { progress, said, wait } = setup();
  progress.begin();
  wait(500);
  progress.end();
  progress.begin();
  assert.equal(progress.spoke, false);
  wait(500);
  assert.equal(said.filter((s) => s[0] === "say").length, 2);
});
