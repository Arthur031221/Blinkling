import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { CaptureHistory } from "./history.js";
import { PanelServer } from "./panel.js";

const panels: PanelServer[] = [];
const directories: string[] = [];

async function setup(floatingGeometryPath?: string | null) {
  const panel = await new PanelServer(
    new CaptureHistory(),
    floatingGeometryPath === undefined ? {} : { floatingGeometryPath },
  ).start();
  panels.push(panel);
  const previous = process.env.BLINKLING_DISABLE_BROWSER_OPEN;
  process.env.BLINKLING_DISABLE_BROWSER_OPEN = "1";
  let launch: string;
  try {
    launch = await panel.openUrl();
  } finally {
    if (previous === undefined)
      delete process.env.BLINKLING_DISABLE_BROWSER_OPEN;
    else process.env.BLINKLING_DISABLE_BROWSER_OPEN = previous;
  }
  const token = /#([A-Za-z0-9_-]+)$/.exec(launch)![1]!;
  return { panel, token };
}

async function post(
  panel: PanelServer,
  path: string,
  body: unknown,
  options: { origin?: string; session?: string } = {},
) {
  return fetch(`${panel.origin}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: options.origin ?? panel.origin,
      ...(options.session
        ? { Authorization: `Bearer ${options.session}` }
        : {}),
    },
    body: JSON.stringify(body),
  });
}

async function createSession(panel: PanelServer, token: string) {
  const response = await post(panel, "/api/session", { token });
  expect(response.status).toBe(200);
  return response.json() as Promise<{
    session: string;
    floatingGeometry: unknown;
  }>;
}

afterEach(async () => {
  await Promise.all(panels.splice(0).map((panel) => panel.close()));
  await Promise.all(
    directories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe("floating geometry endpoint", () => {
  it("persists normalized geometry across panel instances and returns it in session creation", async () => {
    const directory = await mkdtemp(join(tmpdir(), "blinkling-panel-"));
    directories.push(directory);
    const path = join(directory, "config", "geometry.json");
    const first = await setup(path);
    const firstSession = await createSession(first.panel, first.token);
    const input = {
      version: 1,
      dimensions: {
        compact: { pip: { width: 410, height: 510, path: "/secret" } },
      },
      popupPosition: { left: 12, top: 34 },
      question: "private question",
      history: [{ answer: "private answer" }],
      key: "private key",
    };
    const saved = await post(
      first.panel,
      "/api/floating-geometry",
      { geometry: input },
      { session: firstSession.session },
    );
    expect(saved.status).toBe(200);
    expect(await saved.json()).toEqual({ ok: true, stored: true });
    const disk = await readFile(path, "utf8");
    expect(disk).toBe(
      JSON.stringify({
        version: 1,
        dimensions: { compact: { pip: { width: 410, height: 510 } } },
        popupPosition: { left: 12, top: 34 },
      }),
    );
    await first.panel.close();

    const second = await setup(path);
    const secondSession = await createSession(second.panel, second.token);
    expect(secondSession.floatingGeometry).toEqual({
      version: 1,
      dimensions: { compact: { pip: { width: 410, height: 510 } } },
      popupPosition: { left: 12, top: 34 },
    });
  });

  it("requires the exact origin and a live bearer session", async () => {
    const { panel, token } = await setup(null);
    const { session } = await createSession(panel, token);
    const geometry = { version: 1, dimensions: {} };
    expect(
      (await post(panel, "/api/floating-geometry", { geometry })).status,
    ).toBe(401);
    expect(
      (
        await post(
          panel,
          "/api/floating-geometry",
          { geometry },
          { session, origin: "http://evil.test" },
        )
      ).status,
    ).toBe(403);
    const accepted = await post(
      panel,
      "/api/floating-geometry",
      { geometry },
      { session },
    );
    expect(accepted.status).toBe(200);
    expect(await accepted.json()).toEqual({ ok: true, stored: false });
  });

  it("rejects malformed geometry with invalid_request", async () => {
    const { panel, token } = await setup(null);
    const { session } = await createSession(panel, token);
    const response = await post(
      panel,
      "/api/floating-geometry",
      {
        geometry: {
          version: 1,
          dimensions: { expanded: { popup: { width: 1, height: Infinity } } },
        },
      },
      { session },
    );
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ code: "invalid_request" });
  });

  it("disables default disk persistence in test mode", async () => {
    const previous = process.env.BLINKLING_TEST_MODE;
    process.env.BLINKLING_TEST_MODE = "1";
    const { panel, token } = await setup();
    if (previous === undefined) delete process.env.BLINKLING_TEST_MODE;
    else process.env.BLINKLING_TEST_MODE = previous;
    const { session } = await createSession(panel, token);
    await expect(
      (
        await post(
          panel,
          "/api/floating-geometry",
          {
            geometry: { version: 1, dimensions: {} },
          },
          { session },
        )
      ).json(),
    ).resolves.toEqual({ ok: true, stored: false });
  });
});
