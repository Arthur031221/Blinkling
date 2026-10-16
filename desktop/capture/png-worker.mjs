import { parentPort } from "node:worker_threads";
import { encodePng } from "./png.mjs";

parentPort.on("message", ({ id, bitmap, width, height }) => {
  try {
    parentPort.postMessage({
      id,
      data: encodePng(Buffer.from(bitmap), width, height).toString("base64"),
    });
  } catch (error) {
    parentPort.postMessage({ id, error: error.message });
  }
});
