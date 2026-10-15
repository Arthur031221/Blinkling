import { test } from "node:test";
import assert from "node:assert/strict";
import { createGuard } from "./guard.mjs";
import { classify, PASSWORD_MANAGERS } from "./rules.mjs";

const win = (over = {}) => ({
  id: "1",
  title: "Example",
  app: "firefox",
  bounds: { x: 0, y: 0, width: 800, height: 600 },
  private: false,
  passwordManager: false,
  ...over,
});
const focus = (window, secure = false) => ({ secure, window });

test("an ordinary window is allowed", () => {
  assert.deepEqual(classify(focus(win())), { ok: true });
  assert.deepEqual(classify(focus(null)), { ok: true });
  assert.deepEqual(classify(undefined), { ok: true });
});
test("a focused password or secure field blocks with reason secure", () => {
  assert.deepEqual(classify(focus(win(), true)), {
    ok: false,
    reason: "secure",
  });
  assert.deepEqual(classify(focus(null, true)), {
    ok: false,
    reason: "secure",
  });
});
test("each of seven password managers blocks by app name", () => {
  const apps = [
    "1Password",
    "Bitwarden",
    "KeePassXC",
    "LastPass",
    "Dashlane",
    "Keeper Password Manager",
    "Proton Pass",
  ];
  assert.ok(PASSWORD_MANAGERS.length >= apps.length);
  for (const app of apps)
    assert.deepEqual(
      classify(focus(win({ app, title: "Vault" }))),
      { ok: false, reason: "password-manager" },
      app,
    );
});
test("a password manager is recognised by its process name and by the companion flag", () => {
  for (const app of [
    "1password",
    "bitwarden.exe",
    "keepassxc",
    "ProtonPass",
    "com.agilebits.onepassword7",
  ])
    assert.equal(classify(focus(win({ app }))).reason, "password-manager", app);
  assert.equal(
    classify(
      focus(win({ app: "chrome", title: "Anything", passwordManager: true })),
    ).reason,
    "password-manager",
  );
});
test("a browser tab merely mentioning a password manager is not a password manager", () => {
  const verdict = classify(
    focus(
      win({
        app: "Google Chrome",
        title: "Why I switched to Bitwarden - Blog",
      }),
    ),
  );
  assert.deepEqual(verdict, { ok: true });
});
test("private windows block in Chrome, Edge, Firefox, Safari and by the companion flag", () => {
  const titles = [
    ["Google Chrome", "New Tab - Google Chrome (Incognito)"],
    ["chrome", "Inbox - Incognito"],
    ["msedge", "Bing - InPrivate - Microsoft Edge"],
    ["Microsoft Edge", "InPrivate"],
    ["firefox", "Mozilla Firefox Private Browsing"],
    ["Firefox", "Search — Mozilla Firefox Private Browsing"],
    ["Safari", "Apple — Private"],
    ["Safari", "蘋果 — 私密"],
    ["Google Chrome", "新分頁 - Google Chrome (無痕)"],
    ["Google Chrome", "新标签页 - Google Chrome（无痕模式）"],
    ["Google Chrome", "新しいタブ - Google Chrome（シークレット）"],
    ["Google Chrome", "새 탭 - Google Chrome (시크릿)"],
    ["Google Chrome", "Neuer Tab - Google Chrome (Inkognito)"],
    ["Google Chrome", "Nueva pestaña - Google Chrome (Incógnito)"],
    ["Firefox", "Nouvel onglet — Navigation privée Mozilla Firefox"],
    ["Google Chrome", "Nova guia - Google Chrome (Anônima)"],
  ];
  for (const [app, title] of titles)
    assert.deepEqual(
      classify(focus(win({ app, title }))),
      { ok: false, reason: "private" },
      title,
    );
  assert.equal(
    classify(focus(win({ app: "chrome", title: "Anything", private: true })))
      .reason,
    "private",
  );
});
test("a document called Private in a non-browser app is not a private window", () => {
  assert.deepEqual(
    classify(focus(win({ app: "Notes", title: "Private thoughts" }))),
    { ok: true },
  );
  assert.deepEqual(
    classify(focus(win({ app: "Code", title: "incognito.mjs" }))),
    { ok: true },
  );
});
test("the reason precedence is secure, then password manager, then private", () => {
  assert.equal(
    classify(focus(win({ app: "1Password", private: true }), true)).reason,
    "secure",
  );
  assert.equal(
    classify(focus(win({ app: "1Password", private: true }))).reason,
    "password-manager",
  );
});

test("the guard answers synchronously for a synchronous locator and asynchronously for a promise", async () => {
  const sync = createGuard({
    locator: { focus: () => focus(win({ private: true })) },
  });
  assert.deepEqual(sync.allowed(), { ok: false, reason: "private" });
  sync.dispose();
  const slow = createGuard({
    locator: { focus: async () => focus(win(), true) },
  });
  assert.deepEqual(await slow.allowed(), { ok: false, reason: "secure" });
  slow.dispose();
});
test("a locator that fails blocks automatic capture but not an explicit one", async () => {
  const guard = createGuard({
    locator: {
      focus: () => {
        throw new Error("no accessibility");
      },
    },
  });
  assert.deepEqual(await guard.allowed({ automatic: true }), {
    ok: false,
    reason: "secure",
  });
  assert.deepEqual(await guard.allowed(), { ok: true });
  guard.dispose();
});
test("no locator at all is an ordinary window", async () => {
  const guard = createGuard({});
  assert.deepEqual(await guard.allowed({ automatic: true }), { ok: true });
  guard.dispose();
});
test("lock changes are reported once per change, and a lock rechecks itself until it clears", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout", "setInterval"] });
  let current = focus(win(), true);
  const changes = [];
  const guard = createGuard({
    locator: { focus: () => current },
    onChange: (change) => changes.push(change),
    recheckMs: 1000,
  });
  guard.allowed();
  guard.allowed();
  assert.deepEqual(changes, [{ lock: true, reason: "secure" }]);
  t.mock.timers.tick(1000);
  assert.equal(changes.length, 1, "still locked");
  current = focus(win());
  t.mock.timers.tick(1000);
  assert.deepEqual(changes.at(-1), { lock: false });
  assert.equal(changes.length, 2);
  current = focus(win({ private: true }));
  guard.allowed();
  assert.deepEqual(changes.at(-1), { lock: true, reason: "private" });
  current = focus(win({ app: "1Password" }));
  guard.allowed();
  assert.deepEqual(changes.at(-1), { lock: true, reason: "password-manager" });
  guard.dispose();
  const count = changes.length;
  current = focus(win());
  t.mock.timers.tick(5000);
  assert.equal(changes.length, count, "a disposed guard is silent");
});
