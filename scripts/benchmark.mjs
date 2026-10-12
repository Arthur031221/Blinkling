import { chromium } from "@playwright/test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { mkdir, writeFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";

if (!process.argv.includes("--live")) {
  throw new Error(
    "This benchmark makes 20 real model requests. Pass --live to run it.",
  );
}
const tasks = [
  [
    "Japanese error",
    "接続がタイムアウトしました。もう一度お試しください。\nエラーコード: GL-472",
    "Translate this error into English and include its exact code.",
    ["GL-472", "time.*out"],
  ],
  [
    "Traditional Chinese dialog",
    "儲存失敗\n磁碟空間不足，請釋放至少 256 MB 後重試。",
    "In English, why did saving fail and how much space must be freed?",
    ["256", "(space|disk)"],
  ],
  [
    "Simplified Chinese dialog",
    "上传失败\n文件超过 15 MB 限制，请压缩后重试。",
    "In English, what is the upload limit shown?",
    ["15", "MB"],
  ],
  [
    "Spanish notice",
    "Su sesión ha caducado. Inicie sesión de nuevo.\nReferencia: ES-204",
    "Translate the notice into English, preserving the reference.",
    ["ES-204", "expir"],
  ],
  [
    "German notice",
    "Datei nicht gefunden: bericht.csv\nBitte prüfen Sie den Dateipfad.",
    "Which exact filename was not found?",
    ["bericht\\.csv"],
  ],
  [
    "Build log",
    "$ npm run build\nerror TS2322: Type 'string' is not assignable to type 'number'.\nsrc/settings.ts:18:5",
    "Which file and line has the error, and what is its error code?",
    ["settings\\.ts", "18", "TS2322"],
  ],
  [
    "Missing file",
    "Error: ENOENT: no such file or directory, open '/app/config.json'\n    at loadConfig (src/config.ts:31:9)",
    "Name the missing file and the error code.",
    ["config\\.json", "ENOENT"],
  ],
  [
    "HTTP log",
    "GET /api/users 200 24ms\nPOST /api/export 413 9ms\nGET /health 200 1ms",
    "Which request failed and what HTTP status did it return?",
    ["/api/export", "413"],
  ],
  [
    "Test summary",
    "PASS auth.test.ts (8 tests)\nFAIL crop.test.ts (1 failed, 5 passed)\nTest Files: 1 failed | 1 passed\nTests: 1 failed | 13 passed",
    "Which test file failed and how many individual tests passed?",
    ["crop\\.test\\.ts", "13"],
  ],
  [
    "Dependency warning",
    "npm ERR! ERESOLVE unable to resolve dependency tree\nFound: react@19.1.1\npeer react@^18.0.0 from older-widget@2.0.0",
    "Which package wants React 18 and what error code appears?",
    ["older-widget", "ERESOLVE"],
  ],
  [
    "Weekly visits",
    "WEEKLY VISITS\nMonday 120\nTuesday 240\nWednesday 180\nThursday 300\nFriday 210",
    "Which day has the most visits and how many?",
    ["Thursday", "300"],
  ],
  [
    "Support queue",
    "SUPPORT QUEUE\nNew 12\nInvestigating 7\nWaiting for customer 9\nResolved 42",
    "How many tickets are waiting for the customer?",
    ["9"],
  ],
  [
    "GPU memory",
    "GPU MEMORY\nDevice 0: 12.5 / 24 GB\nDevice 1: 21.0 / 24 GB\nDevice 2: 8.0 / 24 GB",
    "Which device uses the most memory and how many GB?",
    ["(Device|GPU).*1", "21"],
  ],
  [
    "Order receipt",
    "ORDER GL-1082\nSubtotal $80.00\nShipping $5.00\nTax $6.40\nTotal $91.40",
    "What is the total and the order number?",
    ["91\\.40", "GL-1082"],
  ],
  [
    "Chart legend",
    "EXPERIMENT RESULTS\nBaseline: 71.2%\nSmall model: 76.8%\nLarge model: 83.1%",
    "Name the best model and its accuracy.",
    ["Large", "83\\.1"],
  ],
  [
    "Environment setting",
    "DATABASE_URL=postgres://localhost/demo\nPORT=8088\nLOG_LEVEL=warn\nPUBLIC_ORIGIN=http://localhost:8088",
    "What port is configured and what is the log level?",
    ["8088", "warn"],
  ],
  [
    "Code array",
    "const stages = [\n  { name: 'decode', ms: 12 },\n  { name: 'normalize', ms: 4 },\n  { name: 'infer', ms: 87 },\n];",
    "Which stage takes the longest and how many milliseconds?",
    ["infer", "87"],
  ],
  [
    "Mobile form",
    "CREATE ACCOUNT\nEmail: alex@example.test\nPassword: [hidden]\nError: Password must be at least 12 characters.\n[Create account]",
    "What exact minimum password length is required?",
    ["12"],
  ],
  [
    "Calendar card",
    "DESIGN REVIEW\nWednesday, October 14\n14:30 to 15:15\nRoom C, second floor",
    "When does the meeting start and in which room?",
    ["14:30", "(Room|room).*C"],
  ],
  [
    "French status",
    "Échec de synchronisation\nDernière synchronisation: 08:42\nRéessayez dans 30 secondes.",
    "In English, how long should the user wait before retrying?",
    ["30", "second"],
  ],
];
const escape = (value) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
const client = new Client({ name: "glimpselet-benchmark", version: "1.0.0" });
const transport = new StdioClientTransport({
  command: process.execPath,
  args: ["bin/glimpselet.cjs"],
  stderr: "pipe",
  env: { ...process.env, GLIMPSELET_DISABLE_BROWSER_OPEN: "1" },
});
const results = [];
try {
  await client.connect(transport);
  const opened = await client.callTool({ name: "panel_open", arguments: {} });
  const address = opened.content
    .find((item) => item.type === "text")
    .text.match(/http:\/\/127\.0\.0\.1:\d+\/#([A-Za-z0-9_-]+)/)[0];
  const url = new URL(address);
  const origin = url.origin;
  const response = await fetch(`${origin}/api/session`, {
    method: "POST",
    headers: { Origin: origin, "Content-Type": "application/json" },
    body: JSON.stringify({ token: url.hash.slice(1) }),
  });
  const { session } = await response.json();
  if (!session) throw new Error("Could not create benchmark session");
  for (const [title, content, question, expected] of tasks) {
    await page.setContent(
      `<html><meta charset="utf-8"><style>body{margin:0;background:#efece6;color:#242321;font-family:Arial,sans-serif;padding:52px}h1{font-size:22px;letter-spacing:.04em;color:#82654f}pre{white-space:pre-wrap;line-height:1.7;font-size:24px;background:#fffdf9;border:1px solid #d9d2c8;border-radius:18px;padding:30px;box-shadow:0 8px 24px #352c2012}footer{font-size:13px;color:#766e63}</style><h1>${escape(title)}</h1><pre>${escape(content)}</pre><footer>Glimpselet local benchmark fixture. No real account data.</footer></html>`,
    );
    const image = (await page.screenshot()).toString("base64");
    const started = performance.now();
    const answerResponse = await fetch(`${origin}/api/ask`, {
      method: "POST",
      headers: {
        Origin: origin,
        Authorization: `Bearer ${session}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        image: `data:image/png;base64,${image}`,
        question,
        model: "haiku",
        backend: "cli",
        mode: "ask",
      }),
    });
    const stream = await answerResponse.text();
    if (!answerResponse.ok)
      throw new Error(`Task ${title}: HTTP ${answerResponse.status}`);
    const events = [...stream.matchAll(/event: ([^\n]+)\ndata: ([^\n]+)/g)].map(
      (match) => ({ type: match[1], data: JSON.parse(match[2]) }),
    );
    const done = events.find((event) => event.type === "done");
    if (!done)
      throw new Error(
        `Task ${title}: ${events.find((event) => event.type === "error")?.data?.message ?? "incomplete response"}`,
      );
    const answer = done.data.entry.answer;
    const passed = expected.every((pattern) =>
      new RegExp(pattern, "i").test(answer),
    );
    results.push({
      title,
      content,
      question,
      expected,
      answer,
      passed,
      durationMs: Math.round(performance.now() - started),
      usage: done.data.entry.usage,
    });
    console.log(
      `${results.length}/${tasks.length} ${passed ? "PASS" : "FAIL"} ${title} ${results.at(-1).durationMs}ms`,
    );
  }
  const durations = results.map((r) => r.durationMs).sort((a, b) => a - b);
  const report = {
    runAt: new Date().toISOString(),
    method:
      "Twenty local synthetic screen fixtures rendered in Chromium at 960 by 540. Real bundled plugin HTTP requests through installed CLI Haiku. Regex checks validate required facts, followed by author review. Sequential warm local session, no baseline or human speed claim. These results do not measure arbitrary screen accuracy.",
    node: process.version,
    model: "haiku",
    count: results.length,
    passed: results.filter((r) => r.passed).length,
    medianMs: Math.round((durations[9] + durations[10]) / 2),
    p95Ms: durations[18],
    results,
  };
  await mkdir("assets", { recursive: true });
  await writeFile(
    "assets/benchmark.json",
    JSON.stringify(report, null, 2) + "\n",
  );
  console.log(
    `RESULT ${report.passed}/${report.count} median=${report.medianMs}ms p95=${report.p95Ms}ms`,
  );
  if (report.passed !== report.count) process.exitCode = 1;
} finally {
  await client.close();
  await browser.close();
}
