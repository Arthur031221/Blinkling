const fs = process.getBuiltinModule("node:fs");
const args = process.argv.slice(2);
const prompt = args[args.indexOf("-p") + 1] || "";
const record = process.env.GLIMPSELET_MOCK_RECORD;
if (record)
  fs.appendFileSync(
    record,
    JSON.stringify({ args, cwd: process.cwd() }) + "\n",
  );
let answer;
if (prompt.includes('"nodes"')) {
  const match = prompt.match(/\[\{\s*"id"\s*:\s*"t[\s\S]*?\]\s*(?:\n|$)/);
  let nodes = [];
  try {
    nodes = JSON.parse(match?.[0]?.trim() || "[]");
  } catch {
    nodes = [];
  }
  answer = JSON.stringify({
    nodes: nodes.map((n) => ({ id: n.id, text: "Translated: " + n.text })),
  });
} else if (prompt.includes('"steps"')) {
  const matches = [
    ...prompt.matchAll(
      /"id":"(g\d+)","role":"(?:button|paragraph)","text":"([^"\n]+)"/g,
    ),
  ];
  answer = JSON.stringify({
    steps: matches.slice(0, 2).map((m) => ({
      elementId: m[1],
      note: "Choose " + m[2],
      action: "Click when ready",
    })),
  });
} else if (prompt.includes('"what"')) {
  answer = JSON.stringify({
    what: "A research notebook page.",
    points: [
      "Notes retain sources.",
      "Exports share your work.",
      "Review citations.",
    ],
    questions: [
      "Where is export?",
      "What should I review?",
      "Explain the Japanese paragraph.",
    ],
  });
} else if (prompt.includes('"questions"')) {
  answer = JSON.stringify({
    questions: [
      "Where is export?",
      "What should I review?",
      "Explain the Japanese paragraph.",
    ],
  });
} else {
  answer =
    "Your notebook can be exported with the Export notebook button. The Japanese paragraph explains how to use research notes.";
}
const sessionId = args.includes("--fork-session")
  ? "a88b5348-a13b-42fd-9685-000000000002"
  : args[args.indexOf("--session-id") + 1] ||
    args[args.indexOf("--resume") + 1];
const lines = [
  {
    type: "stream_event",
    event: { delta: { type: "text_delta", text: answer.slice(0, 32) } },
  },
  {
    type: "stream_event",
    event: { delta: { type: "text_delta", text: answer.slice(32) } },
  },
  {
    type: "result",
    result: answer,
    session_id: sessionId,
    usage: { input_tokens: 100, output_tokens: 30 },
    total_cost_usd: 0.0005,
  },
];
let i = 0;
function emit() {
  process.stdout.write(JSON.stringify(lines[i++]) + "\n");
  if (i < lines.length) setTimeout(emit, 40);
}
if (prompt.includes("slow request")) setTimeout(emit, 2000);
else if (prompt.includes('"questions"') && prompt.includes("reader.html"))
  setTimeout(emit, 1500);
else emit();
