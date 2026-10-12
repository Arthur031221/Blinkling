export type NormalizedBox = readonly [number, number, number, number];

const MAX_SCREEN_EDGE = 1536;
const MAX_SCREEN_PIXELS = 1_800_000;

export function screenDimensions(
  width: number,
  height: number,
): {
  width: number;
  height: number;
} {
  if (
    !Number.isSafeInteger(width) ||
    !Number.isSafeInteger(height) ||
    width <= 0 ||
    height <= 0
  ) {
    throw new RangeError("Screen dimensions must be positive safe integers");
  }

  const scale = Math.min(
    1,
    MAX_SCREEN_EDGE / Math.max(width, height),
    Math.sqrt(MAX_SCREEN_PIXELS / (width * height)),
  );
  const scaledWidth = Math.min(
    width,
    MAX_SCREEN_EDGE,
    Math.floor(width * scale + Number.EPSILON * width * scale * 4),
  );
  const scaledHeight = Math.min(
    height,
    MAX_SCREEN_EDGE,
    Math.floor(height * scale + Number.EPSILON * height * scale * 4),
  );
  let outputWidth = Math.max(1, scaledWidth);
  let outputHeight = Math.max(1, scaledHeight);
  while (outputWidth * outputHeight > MAX_SCREEN_PIXELS) {
    if (outputWidth >= outputHeight) outputWidth--;
    else outputHeight--;
  }
  return {
    width: outputWidth,
    height: outputHeight,
  };
}

/** Crop and irreversibly cover the selected source pixels before any consumer sees them. */
export async function processScreenImage(
  source: string,
  crop: NormalizedBox | null,
  masks: readonly NormalizedBox[],
): Promise<string> {
  if (!source) return "";
  const image = new Image();
  image.src = source;
  await image.decode();
  const box = crop ?? [0, 0, 1, 1];
  const sx = Math.floor(box[0] * image.naturalWidth);
  const sy = Math.floor(box[1] * image.naturalHeight);
  const width = Math.max(
    1,
    Math.min(image.naturalWidth - sx, Math.floor(box[2] * image.naturalWidth)),
  );
  const height = Math.max(
    1,
    Math.min(
      image.naturalHeight - sy,
      Math.floor(box[3] * image.naturalHeight),
    ),
  );
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return "";
  context.drawImage(image, sx, sy, width, height, 0, 0, width, height);
  const clippedMasks: Array<readonly [number, number, number, number]> = [];
  for (const mask of masks) {
    const left = Math.max(sx, Math.floor(mask[0] * image.naturalWidth));
    const top = Math.max(sy, Math.floor(mask[1] * image.naturalHeight));
    const right = Math.min(
      sx + width,
      Math.ceil((mask[0] + mask[2]) * image.naturalWidth),
    );
    const bottom = Math.min(
      sy + height,
      Math.ceil((mask[1] + mask[3]) * image.naturalHeight),
    );
    if (right > left && bottom > top) {
      const clippedMask = [
        left - sx,
        top - sy,
        right - sx,
        bottom - sy,
      ] as const;
      clippedMasks.push(clippedMask);
      context.fillStyle = "#000";
      context.fillRect(left - sx, top - sy, right - left, bottom - top);
    }
  }

  const dimensions = screenDimensions(width, height);
  if (dimensions.width !== width || dimensions.height !== height) {
    const output = document.createElement("canvas");
    output.width = dimensions.width;
    output.height = dimensions.height;
    const outputContext = output.getContext("2d", { willReadFrequently: true });
    if (!outputContext) return "";
    outputContext.imageSmoothingEnabled = false;
    outputContext.drawImage(canvas, 0, 0, dimensions.width, dimensions.height);
    outputContext.fillStyle = "#000";
    for (const [left, top, right, bottom] of clippedMasks) {
      const scaledLeft = Math.floor((left * dimensions.width) / width);
      const scaledTop = Math.floor((top * dimensions.height) / height);
      const scaledRight = Math.ceil((right * dimensions.width) / width);
      const scaledBottom = Math.ceil((bottom * dimensions.height) / height);
      outputContext.fillRect(
        scaledLeft,
        scaledTop,
        scaledRight - scaledLeft,
        scaledBottom - scaledTop,
      );
    }
    return output.toDataURL("image/png");
  }
  return canvas.toDataURL("image/png");
}

export async function imageSignature(data: string): Promise<number[]> {
  const image = new Image();
  image.src = data;
  await image.decode();
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 16;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return [];
  context.drawImage(image, 0, 0, 16, 16);
  const rgba = context.getImageData(0, 0, 16, 16).data;
  return Array.from(rgba).filter((_, index) => index % 4 !== 3);
}

export function changedPixels(
  a: readonly number[],
  b: readonly number[],
): number {
  let changed = 0;
  for (let i = 0; i < Math.min(a.length, b.length); i += 3) {
    if (
      Math.max(
        Math.abs(a[i]! - b[i]!),
        Math.abs(a[i + 1]! - b[i + 1]!),
        Math.abs(a[i + 2]! - b[i + 2]!),
      ) > 22
    )
      changed++;
  }
  return changed;
}
