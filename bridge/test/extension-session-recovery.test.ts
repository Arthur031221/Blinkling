// @vitest-environment node
import { mkdtemp, mkdir, rm, stat, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  getSessionInfo,
  getSessionMessages,
} from "@anthropic-ai/claude-agent-sdk";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ExtensionSessions,
  ExtensionThread,
} from "../src/extension-sessions.js";

const previousConfigDir = process.env.CLAUDE_CONFIG_DIR;
let root = "";
let project = "";
let config = "";

beforeEach(async () => {
  root = path.resolve(
    await mkdtemp(path.join(tmpdir(), "blinkling-session-recovery-")),
  );
  project = path.join(root, "project");
  config = path.join(root, "claude-config");
  await mkdir(project);
  process.env.CLAUDE_CONFIG_DIR = config;
});

afterEach(async () => {
  if (previousConfigDir === undefined) delete process.env.CLAUDE_CONFIG_DIR;
  else process.env.CLAUDE_CONFIG_DIR = previousConfigDir;
  await rm(root, { recursive: true, force: true });
});

function transcriptPath(sessionId: string, inProject = project): string {
  const projectKey = path.resolve(inProject).replace(/[^a-zA-Z0-9]/g, "-");
  return path.join(config, "projects", projectKey, `${sessionId}.jsonl`);
}

async function writeTranscript(
  sessionId: string,
  lines: unknown[],
  inProject = project,
): Promise<string> {
  const file = transcriptPath(sessionId, inProject);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(
    file,
    lines.map((line) => JSON.stringify(line)).join("\n") + "\n",
  );
  return file;
}

function unstartedThread(id: string): ExtensionThread {
  const thread = new ExtensionThread(project);
  thread.id = id;
  return thread;
}

function userMessage(sessionId: string, content: string) {
  return {
    type: "user",
    parentUuid: null,
    isSidechain: false,
    cwd: project,
    sessionId,
    uuid: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    timestamp: "2026-10-13T00:00:00.000Z",
    message: { role: "user", content },
  };
}

describe("extension thread cancellation recovery", () => {
  it.each([
    ["the first ordinary user message", "Where is export?"],
    ["a summaryless blank user message", ""],
  ])(
    "resumes from %s using real SDK conversation evidence",
    async (_name, content) => {
      const id = "ecdc8ce5-71fd-4625-8a7c-a22d9afc84d3";
      await writeTranscript(id, [userMessage(id, content)]);

      const thread = unstartedThread(id);
      await thread.reconcile();

      if (content === "")
        expect(await getSessionInfo(id, { dir: project })).toBeUndefined();

      expect(thread.options).toEqual({
        id,
        project,
        resume: true,
        fork: false,
      });
    },
  );

  it("leaves an absent UUID available for its original creation attempt", async () => {
    const id = "17187c59-6d68-4625-8a7c-a22d9afc84d4";
    const thread = unstartedThread(id);

    await thread.reconcile();

    expect(thread.options).toEqual({ id, project, resume: false, fork: false });
    await expect(stat(transcriptPath(id))).rejects.toMatchObject({
      code: "ENOENT",
    });
  });

  it("does not treat zero-byte, initialization-only, or title-only files as conversations", async () => {
    const zeroId = "e3a3a74c-455a-4a08-8a7c-a22d9afc84d5";
    const initializationId = "5ba69fd3-6cd0-49f7-a7c7-a22d9afc84d6";
    const titleOnlyId = "27a6a5b6-330e-4fd8-8a7c-a22d9afc84d7";
    const zeroFile = transcriptPath(zeroId);
    await mkdir(path.dirname(zeroFile), { recursive: true });
    await writeFile(zeroFile, "");
    await writeTranscript(initializationId, [
      {
        type: "file-history-snapshot",
        messageId: "2c58eea8-92f5-4c0d-9cb3-00e0ed0b4706",
        snapshot: { trackedFileBackups: {} },
        isSnapshotUpdate: false,
      },
    ]);
    await writeTranscript(titleOnlyId, [
      {
        type: "custom-title",
        customTitle: "Interrupted setup",
        sessionId: titleOnlyId,
        uuid: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        timestamp: "2026-10-13T00:00:00.000Z",
      },
    ]);

    expect(await getSessionInfo(titleOnlyId, { dir: project })).toBeDefined();
    expect(
      await getSessionMessages(titleOnlyId, { dir: project, limit: 1 }),
    ).toHaveLength(0);

    for (const id of [zeroId, initializationId, titleOnlyId]) {
      const thread = unstartedThread(id);
      await thread.reconcile();
      expect(thread.options).toEqual({
        id,
        project,
        resume: false,
        fork: false,
      });
    }
    expect(await stat(zeroFile)).toMatchObject({
      size: 0,
    });
  });

  it("scopes SDK message evidence to the thread project", async () => {
    const id = "56854b8d-db05-4918-8a7c-a22d9afc84d8";
    const otherProject = path.join(root, "other-project");
    await mkdir(otherProject);
    await writeTranscript(
      id,
      [userMessage(id, "A different project")],
      otherProject,
    );

    const thread = unstartedThread(id);
    await thread.reconcile();

    expect(thread.options.resume).toBe(false);
  });

  it("reconciles the exact owned UUID even when it is outside the recent 20", async () => {
    const ids = Array.from(
      { length: 24 },
      (_, index) =>
        `00000000-0000-4000-8000-${index.toString(16).padStart(12, "0")}`,
    );
    const target = ids[0]!;
    for (const [index, id] of ids.entries()) {
      const file = await writeTranscript(id, [
        userMessage(id, `prompt ${index}`),
      ]);
      const age = ids.length - index;
      const mtime = new Date(Date.now() - age * 60_000);
      await utimes(file, mtime, mtime);
    }

    const sessions = new ExtensionSessions(project);
    expect((await sessions.recent()).map(({ id }) => id)).not.toContain(target);

    const thread = unstartedThread(target);
    await thread.reconcile();

    expect(thread.id).toBe(target);
    expect(thread.options).toEqual({
      id: target,
      project,
      resume: true,
      fork: false,
    });
  });

  it("automatically resumes the latest saved session only in the current project", async () => {
    const older = "e3a3a74c-455a-4a08-8a7c-a22d9afc84d5";
    const latest = "5ba69fd3-6cd0-49f7-a7c7-a22d9afc84d6";
    const foreign = "27a6a5b6-330e-4fd8-8a7c-a22d9afc84d7";
    const otherProject = path.join(root, "other-project");
    await mkdir(otherProject);
    for (const [id, dir, age] of [
      [older, project, 120_000],
      [latest, project, 60_000],
      [foreign, otherProject, 0],
    ] as const) {
      const file = await writeTranscript(
        id,
        [userMessage(id, `prompt ${id}`)],
        dir,
      );
      const modified = new Date(Date.now() - age);
      await utimes(file, modified, modified);
    }
    const sessions = new ExtensionSessions(project);
    expect((await sessions.recent()).map(({ id }) => id)).toEqual([
      latest,
      older,
    ]);
    expect((await sessions.latest()).options).toEqual({
      id: latest,
      project,
      resume: true,
      fork: false,
    });
    await rm(transcriptPath(latest));
    await rm(transcriptPath(older));
    const fresh = sessions.create();
    expect(await sessions.latest(fresh)).toBe(fresh);
    expect(fresh.options.resume).toBe(false);
  });

  it("skips lookup for started threads and propagates lookup errors", async () => {
    const lookup = vi.fn(async () => {
      throw new Error("session lookup failed");
    });
    const started = new ExtensionThread(
      project,
      "ecdc8ce5-71fd-4625-8a7c-a22d9afc84d3",
      false,
      lookup,
    );
    await started.reconcile();
    expect(lookup).not.toHaveBeenCalled();

    const unstarted = new ExtensionThread(project, undefined, false, lookup);
    await expect(unstarted.reconcile()).rejects.toThrow(
      "session lookup failed",
    );
    expect(unstarted.started).toBe(false);
  });
});
