import {
  validateAttachment,
  attachmentLimits,
  attachmentBytes,
} from "./index.mjs";
/** Main-process/session integration helper. Files stay content, never executable paths. */
export function attachmentContent(attachments) {
  if (
    !Array.isArray(attachments) ||
    attachments.length > attachmentLimits.count
  )
    throw Error("Too many attachments");
  let total = 0;
  return attachments.map((value) => {
    const a = validateAttachment(value);
    total += attachmentBytes(a);
    if (total > attachmentLimits.totalBytes)
      throw Error("Attachments exceed 32 MB");
    if (a.mediaType.startsWith("image/"))
      return {
        type: "image",
        source: { type: "base64", media_type: a.mediaType, data: a.data },
      };
    if (a.mediaType === "application/pdf") {
      const header = atob(a.data.slice(0, 8));
      if (!header.startsWith("%PDF-")) throw Error("Invalid PDF attachment");
      return {
        type: "document",
        title: a.name,
        source: { type: "base64", media_type: a.mediaType, data: a.data },
      };
    }
    const bytes = Uint8Array.from(atob(a.data), (c) => c.charCodeAt(0));
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    if (text.length > 200000)
      throw Error("Text attachment exceeds 200000 characters");
    return {
      type: "document",
      title: a.name,
      source: { type: "text", media_type: "text/plain", data: text },
    };
  });
}
