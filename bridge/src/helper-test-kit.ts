import { createHmac } from "node:crypto";
import { once } from "node:events";
import { WebSocket } from "ws";

/** The helper's side of the handshake, as the extension performs it. */
export async function connectHelper(
  origin: string,
  secret: string,
  extensionId = "a".repeat(32),
): Promise<WebSocket> {
  const socket = new WebSocket(`${origin.replace("http:", "ws:")}/extension`, {
    origin: `chrome-extension://${extensionId}`,
  });
  const proof = (role: string, first: string, second: string) =>
    createHmac("sha256", secret)
      .update(`${role}:${first}:${second}`)
      .digest("hex");
  const nonce = "c".repeat(32);
  let challenge = "";
  const ready = new Promise<void>((resolve, reject) => {
    socket.on("message", (raw) => {
      const message = JSON.parse(raw.toString());
      if (message.type === "challenge") {
        challenge = message.nonce;
        socket.send(
          JSON.stringify({
            type: "hello",
            nonce,
            proof: proof("client", challenge, nonce),
          }),
        );
      }
      if (message.type === "ready") {
        if (message.proof === proof("server", nonce, challenge)) resolve();
        else reject(new Error("The bridge did not prove the secret"));
      }
    });
    socket.once("close", () => reject(new Error("closed")));
  });
  ready.catch(() => {});
  await once(socket, "open");
  await ready;
  return socket;
}
