import { Worker } from "node:worker_threads";
import { deflateSync, crc32 } from "node:zlib";

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
function chunk(type, data) {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, "latin1");
  data.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}
/** A PNG of BGRA pixels, the order Electron's `toBitmap` returns them in. The
 * screen is opaque, so alpha is dropped (RGB, 8 bits) and each row is stored
 * with the Sub filter, which keeps flat areas small at the low deflate level
 * that keeps this fast. Runs for a second or more on a very large screen,
 * which is why `createPngEncoder` puts it on another thread. */
export function encodePng(bitmap, width, height) {
  if (!(width > 0 && height > 0) || bitmap.length !== width * height * 4)
    throw new Error("The bitmap does not match its size");
  const stride = width * 3;
  const raw = Buffer.allocUnsafe((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    const out = y * (stride + 1);
    raw[out] = 1;
    let from = y * width * 4,
      to = out + 1,
      r = 0,
      g = 0,
      b = 0;
    for (let x = 0; x < width; x++, from += 4) {
      const pr = bitmap[from + 2],
        pg = bitmap[from + 1],
        pb = bitmap[from];
      raw[to++] = (pr - r) & 255;
      raw[to++] = (pg - g) & 255;
      raw[to++] = (pb - b) & 255;
      r = pr;
      g = pg;
      b = pb;
    }
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 2;
  return Buffer.concat([
    SIGNATURE,
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(raw, { level: 3 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}
/** Width and height as the PNG itself states them. */
export function pngSize(png) {
  return { width: png.readUInt32BE(16), height: png.readUInt32BE(20) };
}
/** `encode({ bitmap, width, height })` resolves to the PNG as base64, made on a
 * worker thread so the main thread keeps running its timers and its windows
 * while a big screen is compressed. Without a worker it encodes in place. */
export function createPngEncoder({
  create = () => new Worker(new URL("./png-worker.mjs", import.meta.url)),
} = {}) {
  let worker,
    next = 0;
  const waiting = new Map();
  const fail = (error) => {
    for (const { reject } of waiting.values()) reject(error);
    waiting.clear();
    worker = undefined;
  };
  const start = () => {
    worker = create();
    worker.unref?.();
    worker.on("message", ({ id, data, error }) => {
      const job = waiting.get(id);
      waiting.delete(id);
      if (error) job?.reject(new Error(error));
      else job?.resolve(data);
    });
    worker.on("error", fail);
    worker.on("exit", () => fail(new Error("The PNG worker ended")));
    return worker;
  };
  return {
    async encode({ bitmap, width, height }) {
      let thread;
      try {
        thread = worker ?? start();
      } catch {
        return encodePng(bitmap, width, height).toString("base64");
      }
      const id = ++next;
      return new Promise((resolve, reject) => {
        waiting.set(id, { resolve, reject });
        const copy = bitmap.buffer.slice(
          bitmap.byteOffset,
          bitmap.byteOffset + bitmap.length,
        );
        thread.postMessage({ id, width, height, bitmap: copy }, [copy]);
      }).catch(() => encodePng(bitmap, width, height).toString("base64"));
    },
    dispose() {
      worker?.terminate();
      worker = undefined;
    },
  };
}
