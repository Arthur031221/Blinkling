// Preloaded into start.mjs by the install smoke: answers the release URLs from
// a local directory so the real launcher can be exercised without publishing.
import { readFile } from "node:fs/promises";
import { join } from "node:path";

const directory = process.env.BLINKLING_SMOKE_ASSETS;
const real = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const url = new URL(typeof input === "string" ? input : input.url);
  if (
    directory &&
    url.protocol === "https:" &&
    url.hostname === "github.com" &&
    url.pathname.includes("/releases/download/")
  ) {
    const bytes = await readFile(
      join(directory, decodeURIComponent(url.pathname.split("/").pop())),
    );
    return new Response(bytes, {
      status: 200,
      headers: { "content-length": String(bytes.length) },
    });
  }
  return real(input, init);
};
