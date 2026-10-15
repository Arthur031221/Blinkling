import { test } from "node:test";
import assert from "node:assert/strict";
import { companionConnected } from "./companion.mjs";

const address = { url: "http://127.0.0.1:4000", token: "secret" };
const reply =
  (body, ok = true) =>
  async () => ({
    ok,
    json: async () => body,
  });

test("the host's own answer wins when it has one", async () => {
  assert.equal(
    await companionConnected({ companionConnected: () => true }),
    true,
  );
  assert.equal(
    await companionConnected({ companionConnected: async () => false }),
    false,
  );
});

test("otherwise the local status endpoint says whether a companion is connected", async () => {
  const seen = [];
  const fetchImpl = async (url, options) => {
    seen.push([url, options.headers.Authorization]);
    return { ok: true, json: async () => ({ companion: true }) };
  };
  assert.equal(await companionConnected({ address }, { fetchImpl }), true);
  assert.deepEqual(seen, [["http://127.0.0.1:4000/status", "Bearer secret"]]);
  assert.equal(
    await companionConnected(
      { address },
      { fetchImpl: reply({ companion: false }) },
    ),
    false,
  );
});

test("an unreachable, refusing or confused host means no companion, never an error", async () => {
  const refused = async () => {
    throw new Error("ECONNREFUSED");
  };
  assert.equal(
    await companionConnected({ address }, { fetchImpl: refused }),
    false,
  );
  assert.equal(
    await companionConnected({ address }, { fetchImpl: reply({}, false) }),
    false,
  );
  assert.equal(
    await companionConnected(
      { address },
      { fetchImpl: reply({ companion: "yes" }) },
    ),
    false,
  );
  assert.equal(await companionConnected({}), false);
  assert.equal(await companionConnected(undefined), false);
});

test("a host that never answers is given up on", async () => {
  const hang = (url, { signal }) =>
    new Promise((_, reject) =>
      signal.addEventListener("abort", () => reject(signal.reason)),
    );
  assert.equal(
    await companionConnected({ address }, { fetchImpl: hang, timeout: 20 }),
    false,
  );
});

test("the real desktop host reports a companion once the extension's bridge has registered", async () => {
  const { mkdtemp, rm } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const { createServer } = await import("node:http");
  const { startDesktopHost } = await import("../../plugin/desktop/host.mjs");
  const { discoverDesktop } = await import("../../plugin/desktop/client.mjs");
  const directory = await mkdtemp(join(tmpdir(), "blinkling-companion-"));
  const descriptor = join(directory, "desktop.json");
  const token = "b".repeat(64);
  const bridge = createServer((req, res) => {
    const ok = req.headers.authorization === `Bearer ${token}`;
    res.writeHead(ok ? 200 : 403, { "content-type": "application/json" });
    res.end(JSON.stringify({ companion: ok }));
  });
  await new Promise((resolve) => bridge.listen(0, "127.0.0.1", resolve));
  const host = await startDesktopHost({
    directory,
    descriptor,
    session: { subscribe: () => () => undefined },
  });
  try {
    assert.equal(await companionConnected(host), false);
    const { client } = await discoverDesktop(descriptor);
    await client.rpc("companion", {
      url: `http://127.0.0.1:${bridge.address().port}/desktop-companion`,
      token,
    });
    assert.equal(await companionConnected(host), true);
    // The bridge going away must take the chip away with it; a registration
    // made once is not a connection.
    await new Promise((resolve) => bridge.close(resolve));
    assert.equal(await companionConnected(host), false);
  } finally {
    await host.close();
    bridge.close();
    await rm(directory, { recursive: true });
  }
});
