/** What a click on Blink opens (N3.2): the full conversation when Blink is
 * waiting on a permission, otherwise the small composer next to it. */
export function routeClick({ permission = false } = {}) {
  return permission ? "chat" : "mini";
}
