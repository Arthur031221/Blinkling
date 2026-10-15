/** Whether the browser companion is connected to the desktop host: the only
 * condition for the 整頁 chip. Any failure means "no", quietly. */
export async function companionConnected(
  host,
  { fetchImpl = fetch, timeout = 400 } = {},
) {
  try {
    if (typeof host?.companionConnected === "function")
      return !!(await host.companionConnected());
    if (!host?.address) return false;
    const response = await fetchImpl(`${host.address.url}/status`, {
      headers: { Authorization: `Bearer ${host.address.token}` },
      redirect: "error",
      signal: AbortSignal.timeout(timeout),
    });
    return response.ok && (await response.json()).companion === true;
  } catch {
    return false;
  }
}
