const supportedTypes = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
]);

export async function attachmentToPng(file: File): Promise<string> {
  if (!supportedTypes.has(file.type)) throw new Error("image_format");
  if (file.size > 20_000_000) throw new Error("image_limit");
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error("image_decode");
  }
  try {
    if (
      !bitmap.width ||
      !bitmap.height ||
      bitmap.width * bitmap.height > 90_000_000
    )
      throw new Error("image_limit");
    const canvas = document.createElement("canvas");
    let scale = Math.min(1, 2048 / Math.max(bitmap.width, bitmap.height));
    while (true) {
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      const context = canvas.getContext("2d");
      if (!context) throw new Error("image_decode");
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      const image = canvas.toDataURL("image/png");
      if (
        image.startsWith("data:image/png;base64,") &&
        image.length <= 5_000_000
      )
        return image;
      if (canvas.width === 1 && canvas.height === 1)
        throw new Error("image_limit");
      scale /= 2;
    }
  } finally {
    bitmap.close();
  }
}
