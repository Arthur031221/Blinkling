/** Feature buckets register their implementation here. Shell passes the active
 * display and all owned surfaces, so every capture can exclude the whole UI. */
const handlers = new Map();
export function registerAction(action, handler) {
  handlers.set(action, handler);
  return () => {
    if (handlers.get(action) === handler) handlers.delete(action);
  };
}
export async function dispatchAction(action, context) {
  const handler = handlers.get(action);
  if (!handler)
    return { ok: false, reason: `${action}: service not installed` };
  return (await handler(context)) ?? { ok: true };
}
