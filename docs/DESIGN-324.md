# Design for round 324 (written before the build)

Source: reports/glimpse-v3/r3/mac-323/feedback.md and recheck-323.md. These are the design-heavy points.

## Pickers and chips in every live chat (picker_buttons)

The CSS rule that hid the pickers in a terminal's chat is removed. A terminal session's own model cannot be changed from outside, so the selection belongs to Blink: one selection shared by every chat, held by Blink's own session. It decides the model and effort of everything Blink itself runs (a fallback answer, Auto explain, Guide, the picked-text translate) and the costume. A terminal's chat shows the same pickers. The quick-ask chips are shown in every live chat whenever the box is not busy, not only after a capture; with nothing attached a chip sends its literal words.

## Chat list (live_sessions_only, multi_session)

- A chat is listed only while its Claude Code session is live. A session that ended leaves the list and its chat object is dropped (history stays on disk, it is never offered).
- Blink's own chat is listed only when no session chat is live. One live chat means no switcher. Two or more mean one tab per live session, in the order they opened.
- A session that links for the first time gets a new chat at once and the card follows it. That chat is the capture target: a capture, a pick or a menu action lands in the chat of the most recently opened live session, whichever tab the reader looked at before.
- If the chat on screen ends, the card moves to the most recent live session, else to Blink's own chat.
- A dropped channel event (F4) answers in that session's own chat with a bridge of its own, never in Blink's shared chat.

## Answer actions (answer_actions)

Under every finished answer: copy the whole answer (Markdown source), retry (sends the question before it again as a new turn), read aloud (speechSynthesis in the UI language, toggles to stop), and the relative time ("6 hours ago", `Intl.RelativeTimeFormat`, refreshed each minute). Under every user message: relative time, a delivered tick (the session took it), copy, edit (puts its text and pictures back in the box, nothing is deleted from the session). Branch and pin are not built: a chat is one Claude Code session, which has neither. All copying goes through the main process clipboard, because the page clipboard is refused in a window that does not hold focus (the cause of the dead code copy button).

## Model scenes and the costume setting (costume_v2)

Setting "Costume effects" (default on). Off: no scene, no outfit.

On: a change of model plays that model's scene once (about 2.8 s), then Blink keeps only the signature piece for as long as the model is chosen (also after a restart, with no scene). The scene is a pose plus drawings that sit behind, in front of and on the body. The rig is not stretched: arms and legs rotate, the body moves as a unit.

| Model  | Scene                                                                                                                                              | Signature piece kept                                                      |
| ------ | -------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| Opus   | A glass phone booth drops in around Blink, the door shuts, a flash and a spin hide it, the booth lifts away, Blink strikes a hero pose in the cape | the crown                                                                 |
| Sonnet | A wooden chest slides in, Blink digs in it (leans, arms down inside), glasses fly up, Blink catches and puts them on, closes the lid               | round glasses                                                             |
| Haiku  | A gust: wind lines, a scarf flies in, wraps the lower body in two turns and snaps tight, a paper plane loops once round Blink                      | the scarf (round the belly base, below the mouth) and a small paper plane |
| Fable  | A big storybook opens in front of Blink, glowing, stars pour out, a pointed hat rises out of it and lands on Blink's head                          | the storyteller's hat with stars                                          |

Nothing covers the eyes or the mouth. The Haiku scarf is a band at y 140 to 156 that follows the body outline, so it hugs the body. All props are inside the window shape on Windows (F2).

## Effort shows (effort_shows)

One show, played once, on an effort change, with the worn piece kept on. The model scene ends with a flourish whose size follows the current effort.

| Effort | Show                                                                                                                        | Props                         | Energy       |
| ------ | --------------------------------------------------------------------------------------------------------------------------- | ----------------------------- | ------------ |
| low    | Tea break: eyes close, Blink sips from a small cup, steam curls                                                             | cup, steam                    | calm, 2.2 s  |
| medium | Juggling: three balls arc between the hands in a steady rhythm                                                              | three balls                   | light, 2.6 s |
| high   | Weight lift: dumbbell comes up from the ground, Blink lifts it twice, sweat drops, feet apart                               | dumbbell                      | strong, 3 s  |
| xhigh  | Guitar solo: an electric guitar, head bangs, lightning flickers, music notes burst                                          | guitar, bolts, notes          | loud, 3.4 s  |
| max    | Rocket launch: a rocket pack lights, shaking, flame, shock rings spread, fireworks burst in four places, a star ring orbits | pack, flame, rings, fireworks | peak, 4 s    |

Reduced motion: no show and no scene; the piece appears, and one still frame of the show's pose holds for a moment.

## Guide (guide_clicks, guide_reopen, guide_steps)

- The overlay window counts as part of Blinkling whenever it takes the mouse; a click on a mark, label, step panel, stick or button is never a background click. A background click anywhere else closes everything (also while the guide still looks and while the overview shows).
- The finished guide of the screen is kept in memory until the content changes or a new guide runs. The card shows "Show the guide again" without an AI run.
- A guide opens on step 1 with "Step N of M" and a choice "Show all steps". Left and right arrows and Back and Next move.

## Card size (card_resize)

The card has eight resize handles (four edges, four corners). Minimum 320 x 240, maximum 90 percent of the work area. The size is saved per user and the tail and follow logic use the real size.

## Changes after review

- Retry is labelled "Ask again" and says the earlier answer stays in the session. In a terminal chat it is off while the session is busy. The delivered tick shows at once in Blink's own chat (no bridge), and in a terminal chat when the session took the message.
- An effort change during a model scene queues the show after the scene. Turning costume effects off removes the piece at once; turning it on shows the piece with no scene.
- Every show has a stated bounding box that is tested against the window shape (F2). High gets a wide stance and a ground shake so it does not read like juggling.
- card_bottom: a Blink low on the screen lets the card reach the bottom of the work area (tail still at the mouth). The 520 cap is lifted when the reader resized the card. One coordinate space (global) is used by placement. A unit table covers Dock bottom, Dock left, Dock hidden, a display at (-1440, -300) with scale 2, and a Blink low on the edge.
- The saved card size is a fraction of the work area, clamped again on load and when the displays change.
- Resize handles are part of the hit regions, scaled by the scale factor.
- Read aloud waits for `voiceschanged`, falls back to the default voice, and shows a message when no voice exists.
