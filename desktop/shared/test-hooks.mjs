/** Test-only hooks hung on `globalThis.blinklingTest`. The shell assigns that
 * object late and only under E2E, and several modules (pick, privacy) hang a
 * hook on it. They all go through here, so one accessor serves every hook and
 * no module can replace another's. */
const hooks = new Map();
let held;

const attach = (object) => {
  if (object && typeof object === "object")
    for (const [name, api] of hooks) object[name] = api;
};
const accessor = {
  configurable: true,
  get: () => held,
  set(next) {
    held = next;
    attach(held);
  },
};

/** Hangs `api` on `blinklingTest[name]`, now or when the shell assigns the object.
 * Does nothing outside E2E unless a test object is already there. Returns the release. */
export function exposeTestHook(name, api, env = process.env) {
  const current = Object.getOwnPropertyDescriptor(globalThis, "blinklingTest");
  if (env.BLINKLING_E2E !== "1" && !current) return () => {};
  if (current?.get !== accessor.get) {
    // First hook, or the property was replaced from outside: start from what is there.
    hooks.clear();
    held = current ? globalThis.blinklingTest : undefined;
    Object.defineProperty(globalThis, "blinklingTest", accessor);
  }
  hooks.set(name, api);
  attach(held);
  return () => {
    if (hooks.get(name) !== api) return;
    hooks.delete(name);
    if (held?.[name] === api) delete held[name];
  };
}
