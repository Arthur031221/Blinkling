// Explicit opt-in canary. Uses only the host's logged-in CLI, Haiku/low,
// disabled tools, one tiny screenshot, and two short turns. Never run in CI.
import { readFile, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { OwnedSession } from "../../session/index.mjs";
import { collectTurn } from "../../overlay/turn.mjs";
import { parseGuide, guidePrompt } from "../../overlay/schema.mjs";
import { PNG } from "pngjs";
const [input, output] = process.argv.slice(2);
if (!input || !output) throw Error("Pass a local PNG and a local report path");
const bytes = await readFile(input),
  png = PNG.sync.read(bytes);
const capture = {
  pixelWidth: png.width,
  pixelHeight: png.height,
  image: {
    id: randomUUID(),
    name: "Screen.png",
    mediaType: "image/png",
    data: bytes.toString("base64"),
  },
};
// Automated runs never create Remote Control sessions; the final check opts in with test.
process.env.GLIMPSELET_REMOTE ??= "0";
const transport = new OwnedSession(),
  listeners = new Set();
let admitted;
transport.on("fault", (error) => {
  throw error;
});
transport.on("event", (event) => {
  let normalized;
  if (event.type === "assistant")
    normalized = {
      type: "message",
      role: "assistant",
      content: event.message.content,
    };
  if (event.type === "result") normalized = { type: "done", turnId: admitted };
  if (normalized) for (const listener of listeners) listener(normalized);
});
const session = {
  subscribe: (f) => {
    listeners.add(f);
    return () => listeners.delete(f);
  },
  send: async (turn) => {
    admitted = turn.id;
    transport.send(turn);
  },
  stop: () => transport.stop(),
};
try {
  const remote = await transport.connect({
    cwd: process.cwd(),
    model: "haiku",
    effort: "low",
  });
  const raw = await collectTurn(session, {
    id: randomUUID(),
    text: guidePrompt(capture),
    attachments: [capture.image],
    source: "guide",
  });
  const guide = parseGuide(raw, capture);
  const explanation = await collectTurn(session, {
    id: randomUUID(),
    text: "Explain only, no tools. Describe this screen in two short sentences.",
    attachments: [capture.image],
    source: "auto-explain",
  });
  await writeFile(
    output,
    JSON.stringify(
      {
        model: "haiku",
        effort: "low",
        remoteConnected: !!remote.bridge_session_id,
        url: remote.session_url,
        image: { width: png.width, height: png.height, bytes: bytes.length },
        guide,
        explanation,
      },
      null,
      2,
    ),
  );
  console.log(
    "Remote-enabled image guide validated; second image explanation completed.",
  );
} finally {
  await transport.dispose();
}
