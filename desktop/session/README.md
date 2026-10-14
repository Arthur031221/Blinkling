# Desktop session bridge

`DesktopSessionBridge` (also exported as `SessionBridge`) implements
`desktop/shared/contracts.ts` in Electron's main process. Blink explains what it
sees; its owned Claude session cannot click, type, control apps, or edit files.

```js
import { app } from "electron";
import { SessionBridge } from "./session/index.mjs";

const session = new SessionBridge({
  userDataDir: app.getPath("userData"),
  cwd: projectDirectory,
});
const unsubscribe = session.subscribe(publishSessionEvent);
await session.connect(originSessionId);
// Route all five Turn.source values through this same instance.
await session.send(turn);
// Await acknowledgement before displaying the effective model and effort.
const applied = await session.select({ model: "sonnet", effort: "medium" });
await session.stop();
// On app shutdown, await disposal before quitting Electron.
unsubscribe();
await session.dispose();
```

The main/shell and conversation buckets own this service wiring and its UI.
`status` events drive the connection dot; they never become assistant answers.
`message` events upsert by ID, and `delta` events extend that same assistant ID.
Remote browser/phone user events use the same normalization path. New subscribers
receive the saved history, selection and identity. Existing subscribers do not
receive unchanged messages again on reconnect. A `done` event ends a local turn,
including cancellation or recovery of a completed/interrupted turn.

## Ownership and compatibility

The adapter automatically starts a session named **Blinkling**, with Haiku/low
as its initial selection. Claude Code 2.1.296 has no already-authorized way for
this plugin to push into an interactive parent. `originSessionId` therefore
does not resume/fork that parent or demand extra user flags. The owned child
alone clears `CLAUDECODE`; inherited hooks, MCP servers and tools are disabled.
Images contain actual base64 bytes, never a local file path.

The CLI performs authentication and Remote Control transport. Production code
never reads OAuth credentials or calls private remote endpoints. The implemented
SDK controls are not a stable public API: `protocol.mjs` contains the verified
version table and rejects every unverified version instead of silently offering
local-only replies. See `docs/V3-ARCHITECTURE.md` for the researched alternatives.
Before extending the table, run the paid canary against the proposed CLI version.

## Durability and recovery

`<userData>/session/state.json` stores the local/remote IDs, URL, confirmed
selection, original project directory, event cursor, messages and UUID outbox.
Private atomic writes and a process-owned writer lock protect it. A restart
resumes the same local ID and reattaches the same remote ID. A live writer or
corrupt state blocks startup; neither silently creates another conversation.
Claude does not create a resumable transcript before the first turn. An empty
session restarts with the same reserved UUID and reattaches its remote ID, rather
than attempting `--resume` on a nonexistent transcript.

Automatic retries use exponential backoff with jitter, capped at 30 seconds.
Transcript reconciliation reads only the owned session's local JSONL, including
parent links through metadata records. Replayed UUIDs and stable message IDs
prevent duplicated answers. An admitted turn found on disk is never paid for
again. Offline turns remain queued until Remote Control connects.
Streaming deltas reach subscribers immediately; their durable snapshots are
coalesced to avoid rewriting image history for every token, and shutdown flushes
the final snapshot.

There is an unavoidable uncertainty window between the durable dispatch fence
and the CLI acknowledging a user frame. If neither a receipt nor transcript
establishes admission, recovery keeps that turn `uncertain`, polls the transcript,
and holds later turns. It never guesses by resending a potentially paid prompt.
Stop cancels an uncertain/queued turn and permits a new explicit question.
An accepted turn interrupted by process loss remains in history and is not
automatically submitted again.

Picker changes wait for earlier turns, apply both controls, read the effective
settings, and commit only on acknowledgement. Unsupported or silently substituted
values restore the last confirmed selection. Stop interrupts immediately without
waiting behind a picker. Disposal rejects pending controls and terminates the
owned child and descendants, including a version probe interrupted by shutdown.

## Verification

```sh
export PATH="$HOME/.local/node24/bin:$PATH"
npm run desktop:check
xvfb-run -a -s '-screen 0 1280x800x24 +extension Composite' \
  dbus-run-session -- bash desktop/session/e2e/electron-linux.sh
node desktop/session/canary.mjs /absolute/private/report/directory
```

The ordinary unit suite uses controlled transports and actual child processes;
it never spends Claude quota. The Electron suite uses the existing isolated
preload, actual process loss and compositor screenshots at 100/150/200 percent
in both themes. Test fixtures live under `e2e/`, excluded from desktop packaging.

`BLINKLING_REMOTE=0` makes the transport skip the `remote_control` request, so
nothing appears in the account's Remote Control list (the default, unset, stays
on for real users). Every npm test script, Playwright config and CI workflow sets
it. The one final live check per job (the canary, `composer/e2e/live.config.mjs`,
or the remote observer in `e2e/integrated.spec.mjs`) uses
`BLINKLING_REMOTE=test`: the session is named "Blinkling test" and is not kept
on exit. Never delete sessions from the account holder's own list.

The opt-in canary uses six tiny paid turns: five image-bearing producer sources
and one post-restart question. It checks live controls, automatic process-loss
recovery and full adapter restart. An optional third CLI argument points to a
test-only observer module exporting `observe(identity, turns)`; a supplied
server event transcript must contain every UUID once and the original image
bytes. Without an observer, the report explicitly records that server evidence
was not verified. Human browser and phone messages remain manual acceptance:
send each while the session is connected and verify its arrival in Blink.

## Remote Control switch

`BLINKLING_REMOTE` controls the `remote_control` request:

- unset or `1` (default for users): the named, kept "Blinkling" session.
- `0`: no request at all. The owned session and its stream-json pipe work as
  usual, there is just no remote URL (`identity.remoteId` stays null and an
  earlier identity is kept for when it is switched back on).
- `test`: the session is named "Blinkling test" with `keep_session_on_exit`
  false, so it disappears on exit.

Every automated test, e2e run and tester run sets `0` (BLINKLING_E2E runs
default to it). The canary is the one live check per job and uses `test`.

Assisted by Claude/Codex.

## BLINKLING_REMOTE

| Value        | Effect                                                                                                       |
| ------------ | ------------------------------------------------------------------------------------------------------------ |
| unset or `1` | Default for users: the session is registered in Remote Control as "Blinkling" and is kept on exit.           |
| `0`          | No `remote_control` request. The owned session answers locally and creates nothing in the account.           |
| `test`       | The single disposable final check: named "Blinkling test", `keep_session_on_exit` false, gone when it exits. |

Every automated test, e2e run and CI job sets `0` (`desktop/test-env.mjs`, the
Playwright configs and the workflows). `BLINKLING_LIVE=1` runs also default to
off. Only `runCanary` forces `test`, once per job.
