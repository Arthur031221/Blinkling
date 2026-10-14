import { OwnedSession } from "../../session/index.mjs";
import { attachmentContent } from "../attachments.mjs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

/** Real, logged-in Claude canary. No credentials, CLI tools or parent session reuse. */
process.env.GLIMPSELET_REMOTE ??= "0";

export async function liveSession(emit) {
  // Self-deleting "Glimpselet test" Remote Control session; never the user's kept one.
  process.env.GLIMPSELET_REMOTE ??= "test";
  const cwd = await mkdtemp(join(tmpdir(), "glimpselet-conversation-"));
  // Automated runs never create Remote Control sessions; the final check opts in with test.
  process.env.GLIMPSELET_REMOTE ??= "0";
  const owned = new OwnedSession();
  let sessionId = "",
    assistantId,
    turnId;
  owned.on("fault", () => emit({ type: "status", state: "retrying" }));
  owned.on("event", (event) => {
    if (event.type === "system" && event.subtype === "init")
      sessionId = event.session_id;
    if (event.type === "stream_event") {
      const e = event.event;
      if (e.type === "message_start") assistantId = e.message.id;
      if (e.type === "content_block_delta" && e.delta.type === "text_delta")
        emit({ type: "delta", id: assistantId, text: e.delta.text });
    }
    if (event.type === "assistant")
      emit({
        type: "message",
        id: event.message.id,
        role: "assistant",
        content: event.message.content,
      });
    if (event.type === "user" && event.uuid)
      emit({
        type: "message",
        id: event.uuid,
        role: "user",
        content: event.message.content,
      });
    if (event.type === "result") {
      emit({ type: "done", turnId });
      turnId = undefined;
    }
  });
  try {
    const remote = await owned.connect({ cwd, model: "haiku", effort: "low" });
    return {
      remoteUrl: remote.session_url,
      async select(value) {
        const applied = await owned.select(value);
        return {
          model: applied.model,
          effort: applied.effortLevel ?? applied.effort,
        };
      },
      send(turn) {
        turnId = turn.id;
        // Use bucket 2's file-content encoder at the real stream-json boundary.
        owned.child.stdin.write(
          `${JSON.stringify({
            type: "user",
            uuid: turn.id,
            session_id: sessionId,
            parent_tool_use_id: null,
            message: {
              role: "user",
              content: [
                ...attachmentContent(turn.attachments),
                { type: "text", text: turn.text },
              ],
            },
          })}\n`,
        );
      },
      stop: () => owned.stop(),
      async dispose() {
        await owned.dispose();
        await rm(cwd, { recursive: true, force: true });
      },
    };
  } catch (error) {
    await owned.dispose();
    await rm(cwd, { recursive: true, force: true });
    throw error;
  }
}
