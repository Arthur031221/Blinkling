/**
 * A small listbox popover in Blink's own style, replacing native <select>.
 * Items are keyed by id so a repeated selection can never add a duplicate row,
 * and there is no blank entry: before a selection exists the trigger only
 * names what it will choose.
 */
export function createPicker(doc, { label, items = [], onChoose, signal }) {
  const make = (tag, cls) => {
    const n = doc.createElement(tag);
    if (cls) n.className = cls;
    return n;
  };
  const root = make("div", "gl-picker"),
    trigger = make("button", "gl-picker-trigger"),
    value = make("span", "gl-picker-value"),
    menu = make("div", "gl-picker-menu"),
    rows = new Map();
  let current = "",
    focused = -1,
    open = false;
  trigger.type = "button";
  trigger.setAttribute("aria-haspopup", "listbox");
  trigger.setAttribute("aria-expanded", "false");
  trigger.append(value);
  menu.setAttribute("role", "listbox");
  menu.setAttribute("aria-label", label);
  menu.hidden = true;
  root.append(trigger, menu);

  const options = () => [...rows.values()].map((r) => r.node);
  const text = (id) => rows.get(id)?.item.label ?? label;
  function paint() {
    value.textContent = text(current);
    value.dataset.empty = String(!rows.has(current));
    trigger.setAttribute(
      "aria-label",
      rows.has(current) ? `${label}：${text(current)}` : label,
    );
    for (const [id, row] of rows) {
      row.node.setAttribute("aria-selected", String(id === current));
      row.node.textContent = row.item.label;
    }
  }
  function focus(index) {
    const list = options();
    if (!list.length) return;
    focused = (index + list.length) % list.length;
    list.forEach((n, i) => (n.tabIndex = i === focused ? 0 : -1));
    list[focused].focus({ preventScroll: true });
  }
  function show() {
    if (trigger.disabled || open) return;
    open = true;
    menu.hidden = false;
    trigger.setAttribute("aria-expanded", "true");
    root.dataset.open = "true";
    focus(Math.max(0, [...rows.keys()].indexOf(current)));
  }
  function hide(restore = true) {
    if (!open) return;
    open = false;
    menu.hidden = true;
    trigger.setAttribute("aria-expanded", "false");
    delete root.dataset.open;
    if (restore) trigger.focus({ preventScroll: true });
  }
  function choose(id) {
    hide();
    if (id !== current) onChoose?.(id);
  }
  function add(item) {
    const existing = rows.get(item.id);
    if (existing) {
      existing.item = { ...existing.item, ...item };
      paint();
      return;
    }
    const node = make("div", "gl-picker-option");
    node.setAttribute("role", "option");
    node.tabIndex = -1;
    node.dataset.value = item.id;
    node.addEventListener("click", () => choose(item.id), { signal });
    rows.set(item.id, { item, node });
    menu.append(node);
    paint();
  }
  for (const item of items) add(item);

  trigger.addEventListener("click", () => (open ? hide() : show()), { signal });
  trigger.addEventListener(
    "keydown",
    (e) => {
      if (["ArrowDown", "ArrowUp"].includes(e.key)) {
        e.preventDefault();
        show();
      }
    },
    { signal },
  );
  menu.addEventListener(
    "keydown",
    (e) => {
      const move = { ArrowDown: 1, ArrowUp: -1 }[e.key];
      if (move) focus(focused + move);
      else if (e.key === "Home") focus(0);
      else if (e.key === "End") focus(rows.size - 1);
      else if (e.key === "Enter" || e.key === " ")
        choose([...rows.keys()][focused]);
      else if (e.key === "Escape") {
        // The card also closes on Escape; this one only dismisses the list.
        e.stopPropagation();
        hide();
      } else if (e.key === "Tab") hide(false);
      else return;
      e.preventDefault();
    },
    { signal },
  );
  doc.addEventListener(
    "pointerdown",
    (e) => {
      if (open && !root.contains(e.target)) hide(false);
    },
    { signal, capture: true },
  );
  return {
    element: root,
    trigger,
    add,
    /** Select an id; unknown ids are appended exactly once. */
    set(id, itemLabel) {
      if (!id) current = "";
      else {
        current = id;
        add({ id, label: itemLabel ?? rows.get(id)?.item.label ?? id });
      }
      paint();
    },
    relabel(id, itemLabel) {
      const row = rows.get(id);
      if (row) {
        row.item = { ...row.item, label: itemLabel };
        paint();
      }
    },
    has: (id) => rows.has(id),
    get value() {
      return current;
    },
    get labels() {
      return [...rows.values()].map((r) => r.item.label);
    },
    setDisabled(disabled) {
      trigger.disabled = disabled;
      if (disabled) hide(false);
    },
    close: () => hide(false),
  };
}
