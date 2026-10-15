import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  IntentStore,
  PermissionRecovery,
  permissionLabels,
} from "./permission.mjs";
const intent = () => ({
  kind: "capture",
  displayId: "2",
  createdAt: Date.now(),
  restarts: 0,
  version: "3.0.0",
});
test("first grant automatically resumes pending capture and closes exact-switch guide", async () => {
  let status = "not-determined",
    prompted = 0,
    closed = 0,
    saved;
  const p = new PermissionRecovery({
    status: () => status,
    request: async () => {
      prompted++;
      status = "denied";
    },
    showGuide: async () => ({ close: () => closed++ }),
    store: {
      write: async (v) => (saved = v),
      clear: async () => (saved = null),
    },
    restart: () => assert.fail(),
    wait: async () => {
      status = "granted";
    },
  });
  assert.equal(await p.capture(async () => "pixels", intent()), "pixels");
  assert.equal(prompted, 1);
  assert.equal(closed, 1);
  assert.equal(saved, null);
  assert.equal(permissionLabels("13.7").section, "Screen Recording");
  assert.equal(
    permissionLabels("14.6").section,
    "Screen & System Audio Recording",
  );
  assert.equal(permissionLabels("12.7").control, "checkbox");
});
test("upgrade consent invalidation retains intent and restarts at most once across processes", async () => {
  const dir = await mkdtemp(join(tmpdir(), "glimpse-capture-"));
  try {
    const store = new IntentStore(join(dir, "intent.json"));
    let status = "denied",
      restartCount = 0;
    const deps = {
      status: () => status,
      request: () => assert.fail("must not re-prompt denied access"),
      showGuide: async () => ({ close() {} }),
      store,
      restart: async () => restartCount++,
      wait: async () => {
        status = "granted";
      },
    };
    const first = new PermissionRecovery(deps);
    const unavailable = () =>
      Promise.reject(
        Object.assign(Error("OS restart required"), {
          code: "CAPTURE_UNAVAILABLE",
        }),
      );
    await assert.rejects(first.capture(unavailable, intent()), {
      code: "CAPTURE_RESTARTING",
    });
    const resumed = await store.read();
    assert.equal(resumed.kind, "capture");
    assert.equal(resumed.restarts, 1);
    const second = new PermissionRecovery(deps);
    await assert.rejects(second.capture(unavailable, resumed), {
      code: "CAPTURE_UNAVAILABLE",
    });
    assert.equal(restartCount, 1);
    assert.equal(await second.capture(async () => "pixels", resumed), "pixels");
    assert.equal(await store.read(), null);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
test("cancel permission wait closes guide and does not run capture", async () => {
  const abort = new AbortController();
  let closed = false;
  const p = new PermissionRecovery({
    status: () => "denied",
    showGuide: async () => ({ close: () => (closed = true) }),
    store: { write: async () => {} },
    wait: async () => abort.abort(),
  });
  await assert.rejects(
    p.capture(() => assert.fail(), intent(), abort.signal),
    { name: "AbortError" },
  );
  assert.equal(closed, true);
});
test("a fresh macOS grant restarts before stale black thumbnails and resumes the saved action", async () => {
  let status = "denied",
    saved,
    restarts = 0,
    captures = 0;
  const deps = {
    status: () => status,
    store: {
      write: async (v) => (saved = v),
      clear: async () => (saved = null),
    },
    showGuide: async () => ({ close() {} }),
    wait: async () => (status = "granted"),
    restart: async () => restarts++,
    restartAfterGrant: true,
  };
  await assert.rejects(
    new PermissionRecovery(deps).capture(() => {
      captures++;
    }, intent()),
    { code: "CAPTURE_RESTARTING" },
  );
  assert.equal(captures, 0);
  assert.equal(saved.kind, "capture");
  assert.equal(saved.restarts, 1);
  assert.equal(
    await new PermissionRecovery(deps).capture(async () => {
      captures++;
      return "pixels";
    }, saved),
    "pixels",
  );
  assert.equal(restarts, 1);
  assert.equal(captures, 1);
  assert.equal(saved, null);
});

test("a pending selection saved by an older version still resumes as a capture", async () => {
  const dir = await mkdtemp(join(tmpdir(), "intent-"));
  try {
    const path = join(dir, "intent.json");
    const store = new IntentStore(path);
    await store.write({ ...intent(), kind: "region" });
    assert.equal((await store.read()).kind, "capture");
    await store.write({ ...intent(), kind: "page" });
    assert.equal(await store.read(), null);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
