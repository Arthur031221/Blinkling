import test from "node:test";
import assert from "node:assert/strict";
import { createPickController } from "./controller.mjs";
import { createPicker } from "./picker.mjs";
import { createGrouper } from "./group.mjs";
import { createLocatorStub, DISPLAY } from "./test/locator-stub.mjs";

const PNG = "iVBORw0KGgo=";

function setup(options = {}) {
  const log = {
    shown: [],
    hidden: 0,
    sent: [],
    flights: [],
    caught: 0,
    order: [],
    opened: [],
    grabs: 0,
    newChats: 0,
    errors: [],
  };
  let clock = 1_000_000;
  const stub = createLocatorStub(options.stub);
  const layer = {
    show: (display, cursor) => void log.shown.push({ display, cursor }),
    hide: () => void log.hidden++,
    send: (channel, value) => void log.sent.push([channel, value]),
    flight: async (items, to) =>
      void (log.flights.push({ items, to }), log.order.push("flight")),
  };
  const controller = createPickController({
    displays: () => [DISPLAY],
    cursor: () => ({ x: 200, y: 280 }),
    picker: (display) =>
      createPicker({
        locator: stub,
        guard: options.guard ?? { allowed: () => true },
        display,
      }),
    layer,
    settle: async () => {},
    grab:
      options.grab ??
      (async () => (
        log.grabs++,
        log.order.push("grab"),
        {
          image: { data: PNG },
          pixelWidth: 1280,
          pixelHeight: 800,
          region: DISPLAY.bounds,
        }
      )),
    crop:
      options.crop ??
      ((capture, bounds) => ({
        data: PNG,
        dataUrl: `data:image/png;base64,${PNG}`,
        width: bounds.width,
        height: bounds.height,
      })),
    grouper: createGrouper({
      clock: () => clock,
      uuid: (() => {
        let n = 0;
        return () => `chat-${++n}`;
      })(),
    }),
    newChat: async () => void log.newChats++,
    caught: () => void (log.caught++, log.order.push("caught")),
    pause: async (ms) => void log.order.push(`wait ${ms}`),
    mouthPoint: () => ({ x: 1280, y: 400 }),
    quick: {
      open: async (entries) =>
        void (log.opened.push(entries), log.order.push("card")),
      note: (code) => void log.order.push(`note ${code}`),
    },
    pickedWhileHeld: options.pickedWhileHeld,
    reduced: () => false,
    onError: (e) => log.errors.push(e),
  });
  return { controller, log, tick: (ms) => (clock += ms) };
}
const local = (x, y) => ({ x, y });
async function pickAt(controller, point) {
  await controller.input({ type: "down", ...point });
  await controller.input({ type: "up", ...point });
}

test("raising shows the layer on the display under the cursor, with the cursor in it", async () => {
  const { controller, log } = setup();
  await controller.raise();
  assert.equal(log.shown.length, 1);
  assert.equal(log.shown[0].display, DISPLAY);
  assert.deepEqual(log.shown[0].cursor, { x: 200, y: 280 });
});

test("moving outlines what a click would take", async () => {
  const { controller, log } = setup();
  await controller.raise();
  await controller.input({ type: "move", ...local(200, 280) });
  const outline = log.sent.filter(([c]) => c === "outline").at(-1)[1];
  assert.equal(outline.kind, "image");
  assert.deepEqual(outline.rect, { x: 140, y: 230, width: 200, height: 120 });
});

test("a click takes the thing under it and tells the layer to draw its effect", async () => {
  const { controller, log } = setup();
  await controller.raise();
  await pickAt(controller, local(200, 280));
  const taken = log.sent.find(([c]) => c === "taken")[1];
  assert.equal(taken.kind, "image");
  assert.equal(taken.effect.effect, "loop");
});

test("a click on a secure field shows the lock and takes nothing", async () => {
  const { controller, log } = setup();
  await controller.raise();
  await pickAt(controller, local(200, 530));
  assert.ok(log.sent.some(([c]) => c === "lock"));
  assert.ok(!log.sent.some(([c]) => c === "taken"));
});

test("dragging past 6 px takes an area", async () => {
  const { controller, log } = setup();
  await controller.raise();
  await controller.input({ type: "down", x: 10, y: 20 });
  await controller.input({ type: "move", x: 12, y: 22 });
  await controller.input({ type: "move", x: 200, y: 150 });
  await controller.input({ type: "up", x: 200, y: 150 });
  const taken = log.sent.find(([c]) => c === "taken")[1];
  assert.equal(taken.kind, "area");
  assert.deepEqual(taken.bounds, { x: 10, y: 20, width: 190, height: 130 });
});

test("the drag message carries the press point, so the layer can follow its own pointer", async () => {
  const { controller, log } = setup();
  await controller.raise();
  await controller.input({ type: "down", x: 10, y: 20 });
  await controller.input({ type: "move", x: 200, y: 150 });
  const drag = log.sent.filter(([c, v]) => c === "drag" && v.rect).at(-1)[1];
  assert.deepEqual(drag.from, { x: 10, y: 20 });
});

test("while an area is dragged the hover outline goes away, so the rubber band is the only box", async () => {
  const { controller, log } = setup();
  await controller.raise();
  assert.ok(
    log.sent.filter(([c]) => c === "outline").at(-1)[1].rect,
    "hovering outlines what is under the cursor",
  );
  await controller.input({ type: "down", x: 10, y: 20 });
  await controller.input({ type: "move", x: 200, y: 150 });
  const outlines = log.sent.filter(([c]) => c === "outline");
  assert.equal(outlines.at(-1)[1].rect, null);
  const before = log.sent.length;
  await controller.input({ type: "move", x: 210, y: 160 });
  assert.equal(
    log.sent.slice(before).filter(([c]) => c === "outline").length,
    0,
    "cleared once, not on every move",
  );
  await controller.input({ type: "up", x: 210, y: 160 });
  assert.equal(
    log.sent.filter(([c]) => c === "outline").at(-1)[1].rect,
    null,
    "the old outline does not come back under the area",
  );
});

test("a drag shorter than 6 px is a click", async () => {
  const { controller, log } = setup();
  await controller.raise();
  await controller.input({ type: "down", x: 200, y: 280 });
  await controller.input({ type: "move", x: 203, y: 281 });
  await controller.input({ type: "up", x: 203, y: 281 });
  assert.equal(log.sent.find(([c]) => c === "taken")[1].kind, "image");
});

test("release delivers: layer clears, the screen is grabbed once, thumbnails fly to Blink, then the card opens with every chip complete", async () => {
  const { controller, log } = setup();
  await controller.raise();
  await pickAt(controller, local(200, 280));
  await pickAt(controller, local(400, 280));
  await controller.drop("release");
  assert.equal(log.grabs, 1);
  assert.equal(log.flights.length, 1);
  assert.equal(log.flights[0].items.length, 2);
  assert.deepEqual(log.flights[0].to, { x: 1280, y: 400 });
  assert.equal(log.opened.length, 1);
  const [entries] = log.opened;
  assert.equal(entries.length, 2);
  for (const entry of entries)
    assert.equal(entry.pending, undefined, "nothing is half taken");
  assert.equal(entries[0].attachment.mediaType, "image/png");
  assert.equal(
    entries[0].thumb,
    log.flights[0].items[0].dataUrl,
    "the image chip shows the picture that flew",
  );
  assert.match(entries[0].thumb, /^data:image\/png;base64,/);
  assert.equal(entries[1].kind, "table");
  assert.equal(entries[1].attachment.mediaType, "text/plain");
  assert.equal(
    Buffer.from(entries[1].attachment.data, "base64").toString().split("\n")[0],
    "| Item | Price |",
  );
});

test("the card opens only after the grab and the flight, so Blink has the picture in its mouth first", async () => {
  const { controller, log } = setup();
  await controller.raise();
  await pickAt(controller, local(200, 280));
  await controller.drop("release");
  assert.deepEqual(log.order, ["grab", "caught", "wait 400", "flight", "card"]);
});

test("text arrives as a text attachment, not a picture of text", async () => {
  const { controller, log } = setup();
  await controller.raise();
  await pickAt(controller, local(160, 160));
  await controller.drop("release");
  const [entries] = log.opened;
  assert.equal(entries[0].attachment.mediaType, "text/plain");
  assert.equal(
    Buffer.from(entries[0].attachment.data, "base64").toString(),
    "Blink looks at your screen.",
  );
});

test("release with nothing taken just hides the layer", async () => {
  const { controller, log } = setup();
  await controller.raise();
  await controller.drop("release");
  assert.ok(log.hidden >= 1);
  assert.equal(log.opened.length, 0);
  assert.equal(log.grabs, 0);
});

test("any other way to drop the layer discards the pick", async () => {
  for (const reason of ["key", "wheel", "escape", "settings"]) {
    const { controller, log } = setup();
    await controller.raise();
    await pickAt(controller, local(200, 280));
    await controller.drop(reason);
    assert.equal(log.opened.length, 0, reason);
    assert.equal(log.grabs, 0, reason);
    assert.ok(log.hidden >= 1, reason);
  }
});

test("picks within 60 s share a chat, a later one starts a new chat", async () => {
  const { controller, log, tick } = setup();
  const once = async () => {
    await controller.raise();
    await pickAt(controller, local(200, 280));
    await controller.drop("release");
  };
  await once();
  assert.equal(log.newChats, 1, "the first pick starts a chat");
  tick(59_000);
  await once();
  assert.equal(log.newChats, 1);
  tick(65_000);
  await once();
  assert.equal(log.newChats, 2);
});

test("window captures within 60 s share a chat, a later one starts a new chat", async () => {
  const { controller, log, tick } = setup();
  const capture = (id) => ({
    id,
    kind: "window",
    display: DISPLAY,
    region: { x: 40, y: 165, width: 210, height: 150 },
    pixelWidth: 420,
    pixelHeight: 300,
    image: { id, name: "Window.png", mediaType: "image/png", data: PNG },
  });
  await controller.deliver(capture("w1"));
  assert.equal(log.newChats, 1, "the first capture starts a chat");
  tick(59_000);
  await controller.deliver(capture("w2"));
  assert.equal(log.newChats, 1, "59 s later it joins the same chat");
  tick(59_000);
  await controller.deliver(capture("w3"));
  assert.equal(log.newChats, 1, "the window slides with every capture");
  tick(61_000);
  await controller.deliver(capture("w4"));
  assert.equal(log.newChats, 2, "61 s later it starts a new chat");
  assert.equal(log.flights.length, 4);
});

test("a capture from the overlay or a hotkey goes through the same flight and card", async () => {
  const { controller, log } = setup();
  await controller.deliver({
    id: "c1",
    display: DISPLAY,
    region: { x: 10, y: 20, width: 300, height: 200 },
    pixelWidth: 300,
    pixelHeight: 200,
    image: {
      id: "img",
      name: "Selection.png",
      mediaType: "image/png",
      data: PNG,
    },
  });
  assert.equal(log.flights.length, 1);
  assert.deepEqual(log.flights[0].items[0].bounds, {
    x: 10,
    y: 20,
    width: 300,
    height: 200,
  });
  assert.equal(log.opened[0][0].attachment.data, PNG);
  assert.equal(log.opened[0][0].kind, "area");
  assert.equal(log.opened[0][0].thumb, `data:image/png;base64,${PNG}`);
});

test("a failed screen grab still delivers the text that was picked, and drops what has no pixels", async () => {
  const failing = setup({
    grab: async () => {
      throw new Error("no screen");
    },
  });
  await failing.controller.raise();
  await pickAt(failing.controller, local(160, 160));
  await pickAt(failing.controller, local(200, 280));
  await failing.controller.drop("release");
  const [entries] = failing.log.opened;
  assert.deepEqual(
    entries.map((e) => e.kind),
    ["text"],
  );
  assert.equal(failing.log.errors.length, 1);
});

test("on a second display the crop is taken relative to that display, not the desktop", async () => {
  const crops = [];
  const second = {
    id: "2",
    bounds: { x: 1280, y: 0, width: 1920, height: 1080 },
    scaleFactor: 1,
  };
  const { controller } = setup({
    crop: (shot, rect) => (
      crops.push(rect),
      { data: PNG, dataUrl: "d", width: rect.width, height: rect.height }
    ),
  });
  await controller.deliver([
    {
      source: "pick",
      display: second,
      kind: "image",
      bounds: { x: 1380, y: 120, width: 200, height: 100 },
    },
  ]);
  assert.deepEqual(crops, [{ x: 100, y: 120, width: 200, height: 100 }]);
});

test("Blink is told the moment the flight lands, before the card opens", async () => {
  const { controller, log } = setup();
  await controller.deliver({
    id: "c2",
    display: DISPLAY,
    region: { x: 10, y: 20, width: 300, height: 200 },
    pixelWidth: 300,
    pixelHeight: 200,
    image: {
      id: "img",
      name: "Selection.png",
      mediaType: "image/png",
      data: PNG,
    },
  });
  assert.equal(log.caught, 1);
  assert.deepEqual(log.order, ["caught", "wait 400", "flight", "card"]);
});

test("the key stays held after a capture: hovering and dragging keep working and each pick is announced", async () => {
  const { controller, log } = setup();
  await controller.raise();
  await pickAt(controller, local(200, 280));
  assert.equal(controller.isRaised(), true, "still raised after a pick");
  const outlines = log.sent.filter(([c]) => c === "outline").length;
  await controller.input({ type: "move", ...local(200, 280) });
  assert.ok(
    log.sent.filter(([c]) => c === "outline").length > outlines,
    "auto detect still outlines",
  );
  await controller.input({ type: "down", x: 10, y: 20 });
  await controller.input({ type: "move", x: 12, y: 22 });
  await controller.input({ type: "move", x: 200, y: 150 });
  assert.ok(log.sent.some(([c, v]) => c === "drag" && v.rect));
  await controller.input({ type: "up", x: 200, y: 150 });
  assert.equal(log.sent.filter(([c]) => c === "taken").length, 2);
  assert.equal(log.hidden, 0, "nothing is delivered before release");
  assert.equal(log.flights.length, 0);
  await controller.drop("release");
  assert.equal(log.flights.length, 1, "one flight for all captures");
  assert.equal(log.flights[0].items.length, 2);
});

test("a pick made while the key is held can say that more can follow", async () => {
  const lines = ["Keep holding"];
  const { controller, log } = setup({ pickedWhileHeld: () => lines.shift() });
  await controller.raise();
  await pickAt(controller, local(200, 280));
  await pickAt(controller, local(200, 280));
  const hints = log.sent.filter(([c]) => c === "hint").map(([, v]) => v.text);
  assert.deepEqual(hints, ["Keep holding"]);
});

test("a capture that came as the visible part tells the card once the picture is in", async () => {
  const { controller, log } = setup();
  const capture = (id, notice) => ({
    id,
    kind: "screen",
    display: DISPLAY,
    region: { x: 0, y: 0, width: 300, height: 200 },
    pixelWidth: 300,
    pixelHeight: 200,
    image: { id, name: "Visible part.png", mediaType: "image/png", data: PNG },
    notice,
  });
  await controller.deliver(capture("p1", "visible-part"));
  assert.ok(log.order.indexOf("note visible-part") > log.order.indexOf("card"));
  const count = log.order.filter((x) => x.startsWith("note")).length;
  await controller.deliver(capture("p2"));
  assert.equal(log.order.filter((x) => x.startsWith("note")).length, count);
});

test("a full page arrives as tiles: one flight from the browser's rectangle, one box with a chip per tile", async () => {
  const { controller, log } = setup();
  const tile = (id) => ({
    id,
    kind: "page",
    source: "page",
    display: DISPLAY,
    region: { x: 100, y: 50, width: 800, height: 600 },
    pixelWidth: 1600,
    pixelHeight: 1200,
    image: { id, name: "Page.png", mediaType: "image/png", data: PNG },
  });
  const first = tile("t1");
  await controller.deliver({ ...first, rest: [tile("t2"), tile("t3")] });
  assert.equal(log.flights.length, 1, "the tiles fly in once");
  assert.equal(log.caught, 1, "Blink eats once, not once per tile");
  assert.equal(log.flights[0].items.length, 1);
  assert.deepEqual(log.flights[0].items[0].bounds, {
    x: 100,
    y: 50,
    width: 800,
    height: 600,
  });
  assert.equal(log.flights[0].items[0].dataUrl, `data:image/png;base64,${PNG}`);
  assert.equal(log.opened.length, 1, "the box opens once");
  assert.deepEqual(
    log.opened[0].map((e) => e.id),
    ["t1", "t2", "t3"],
  );
});

test("a capture on a second display flies from its screen position", async () => {
  const { controller, log } = setup();
  const second = {
    ...DISPLAY,
    bounds: { x: 1280, y: 0, width: 1280, height: 800 },
  };
  await controller.deliver({
    id: "c",
    display: second,
    region: { x: 10, y: 20, width: 300, height: 200 },
    pixelWidth: 300,
    pixelHeight: 200,
    image: { id: "i", name: "S.png", mediaType: "image/png", data: PNG },
  });
  assert.deepEqual(log.flights[0].items[0].bounds, {
    x: 1290,
    y: 20,
    width: 300,
    height: 200,
  });
});
