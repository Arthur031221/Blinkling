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

export function readerUrlOriginPattern(parsed: URL): string {
  return `${parsed.protocol}//${parsed.host}/*`;
}
