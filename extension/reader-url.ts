export function parseReaderPdfUrl(value: string): URL | undefined {
  try {
    const parsed = new URL(value);
    if (
      !/^https?:$/.test(parsed.protocol) ||
      !parsed.hostname ||
      parsed.username ||
      parsed.password
    )
      return undefined;
    return parsed;
  } catch {
    return undefined;
  }
}

export function isReaderPdfCandidate(value: string): boolean {
  const parsed = parseReaderPdfUrl(value);
  return Boolean(
    parsed &&
      (/\.pdf$/i.test(parsed.pathname) ||
        (parsed.hostname === "arxiv.org" &&
          /^\/pdf\/[^/]+\/?$/.test(parsed.pathname))),
  );
}
