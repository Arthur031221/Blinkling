// Prints the Accessibility tree of the window at a screen point as one JSON
// object, the same shape ax-linux.py prints (points, "p" is the parent index):
//   { frame: {name,x,y,width,height}, nodes: [{p,role,name,text,x,y,w,h,secure}] }
// A secure text field is printed with no name and no text: its role is checked
// before AXValue is read, so its value never leaves this script.
//
// usage: osascript -l JavaScript ax-macos.js X Y TITLE [MAX_NODES] [BUDGET_MS]
ObjC.import("ApplicationServices");
ObjC.import("Foundation");

function attribute(element, name) {
  const out = Ref();
  const status = $.AXUIElementCopyAttributeValue(element, $(name), out);
  return status === 0 ? out[0] : null;
}
function string(value) {
  if (value === null || value === undefined) return "";
  const text = ObjC.unwrap(ObjC.castRefToObject(value));
  return typeof text === "string" ? text : "";
}
// AXValue structs have no direct JavaScript bridge; their description reads
// "{value = x:1.0 y:2.0 ...}" or "{value = w:3.0 h:4.0 ...}".
function numbers(value) {
  if (value === null) return null;
  const text = String($.CFCopyDescription(value).toString());
  const found = text.match(/-?\d+(\.\d+)?/g);
  return found ? found.slice(0, 2).map(Number) : null;
}
function children(element) {
  const list = attribute(element, "AXChildren");
  if (list === null) return [];
  const array = ObjC.castRefToObject(list);
  const out = [];
  for (let i = 0; i < Number(array.count); i++)
    out.push(array.objectAtIndex(i));
  return out;
}

function run(argv) {
  const x = Number(argv[0]);
  const y = Number(argv[1]);
  const max = Number(argv[3] || 800);
  const budget = Number(argv[4] || 900);
  const started = Date.now();
  const hitRef = Ref();
  const system = $.AXUIElementCreateSystemWide();
  if ($.AXUIElementCopyElementAtPosition(system, x, y, hitRef) !== 0)
    return JSON.stringify({ frame: null, nodes: [] });
  let top = hitRef[0];
  for (let i = 0; i < 40; i++) {
    if (string(attribute(top, "AXRole")) === "AXWindow") break;
    const up = attribute(top, "AXParent");
    if (up === null) break;
    top = up;
  }
  const origin = numbers(attribute(top, "AXPosition")) || [0, 0];
  const size = numbers(attribute(top, "AXSize")) || [0, 0];
  const nodes = [];
  const queue = [[top, -1, 0]];
  while (queue.length && nodes.length < max && Date.now() - started < budget) {
    const [element, parent, depth] = queue.shift();
    const role = string(attribute(element, "AXRole"));
    const subrole = string(attribute(element, "AXSubrole"));
    const secure =
      subrole === "AXSecureTextField" || role === "AXSecureTextField";
    const position = numbers(attribute(element, "AXPosition"));
    const extent = numbers(attribute(element, "AXSize"));
    let index = parent;
    if (position && extent && extent[0] > 0 && extent[1] > 0) {
      index = nodes.length;
      nodes.push({
        p: parent,
        role: role,
        name: secure
          ? ""
          : string(attribute(element, "AXTitle")) ||
            string(attribute(element, "AXDescription")),
        text: secure
          ? ""
          : string(attribute(element, "AXValue")).slice(0, 4000),
        x: position[0],
        y: position[1],
        w: extent[0],
        h: extent[1],
        secure: secure,
      });
    }
    if (depth < 40)
      for (const child of children(element))
        queue.push([child, index, depth + 1]);
  }
  return JSON.stringify({
    frame: {
      name: string(attribute(top, "AXTitle")),
      x: origin[0],
      y: origin[1],
      width: size[0],
      height: size[1],
    },
    nodes: nodes,
  });
}
