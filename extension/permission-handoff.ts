/**
 * Prepare the browser UI before a reader permission request. This deliberately
 * never requests permission itself: that must remain in the user's submit
 * gesture in reader.ts.
 */
export async function prepareReaderPermissionHandoff(
  origins: string[],
  contains: (details: { origins: string[] }) => Promise<boolean>,
  handoff: () => Promise<unknown>,
): Promise<"granted" | "prepared"> {
  if (await contains({ origins })) return "granted";
  const response = (await handoff()) as { ok?: boolean } | undefined;
  if (!response?.ok) throw new Error("reader_handoff_unconfirmed");
  return "prepared";
}
