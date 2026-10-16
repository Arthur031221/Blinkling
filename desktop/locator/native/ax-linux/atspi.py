#!/usr/bin/env python3
"""AT-SPI helper for the Blinkling element locator (Linux).

Reads one JSON request per line on stdin and answers one JSON line on stdout:
    {"id": 1, "cmd": "tree",      "window": {...}}  -> {"id": 1, "ok": true, "result": {...}}
    {"id": 2, "cmd": "focus"}
    {"id": 3, "cmd": "selection", "window": {...}}
    {"id": 4, "cmd": "ping"}
"window" is {"app", "title", "pid", "bounds": {x, y, width, height}} in screen
pixels. Coordinates in answers are screen pixels. Password fields are reported
with "secure": true and never with a name or text.
"""
import json
import sys

import gi

gi.require_version("Atspi", "2.0")
from gi.repository import Atspi  # noqa: E402

MAX_NODES = 600
MAX_DEPTH = 40
MAX_TEXT = 4000
WINDOW_ROLES = {"frame", "dialog", "window", "alert", "file chooser"}
SECURE_ROLES = {"password text"}

Atspi.init()


def screen_rect(node):
    try:
        component = node.get_component_iface()
        if component is None:
            return None
        e = component.get_extents(Atspi.CoordType.SCREEN)
    except Exception:
        return None
    if e.width <= 0 or e.height <= 0 or e.x < -100000 or e.y < -100000:
        return None
    return {"x": e.x, "y": e.y, "width": e.width, "height": e.height}


def has_state(node, state):
    try:
        return node.get_state_set().contains(state)
    except Exception:
        return False


def is_secure(node):
    try:
        return node.get_role_name() in SECURE_ROLES
    except Exception:
        return False


EMBEDDED = "\ufffc"
EMBEDDED_DEPTH = 3


def text_of(node, depth=0):
    """The text of a node. Where a link or another inline object sits in it the
    accessibility bus puts a placeholder; the object's own words stand there."""
    try:
        if node.get_text_iface() is None:
            return ""
        count = Atspi.Text.get_character_count(node)
        text = Atspi.Text.get_text(node, 0, min(count, MAX_TEXT)) or ""
    except Exception:
        return ""
    if EMBEDDED not in text or depth >= EMBEDDED_DEPTH:
        return text.replace(EMBEDDED, "")
    out = []
    for offset, char in enumerate(text):
        out.append(embedded_text(node, offset, depth) if char == EMBEDDED else char)
        if sum(map(len, out)) >= MAX_TEXT:
            break
    return "".join(out)[:MAX_TEXT]


def embedded_text(node, offset, depth):
    """The words of the object a placeholder at this offset stands for."""
    try:
        if node.get_hypertext_iface() is None:
            return ""
        index = Atspi.Hypertext.get_link_index(node, offset)
        if index < 0:
            return ""
        inner = Atspi.Hyperlink.get_object(Atspi.Hypertext.get_link(node, index), 0)
        if inner is None or inner.get_role_name() in SECURE_ROLES:
            return ""
        return text_of(inner, depth + 1) or (inner.get_name() or "")
    except Exception:
        return ""


def application_windows():
    desktop = Atspi.get_desktop(0)
    for a in range(desktop.get_child_count()):
        try:
            app = desktop.get_child_at_index(a)
            pid = app.get_process_id()
            for w in range(app.get_child_count()):
                win = app.get_child_at_index(w)
                if win is not None and win.get_role_name() in WINDOW_ROLES:
                    yield app, pid, win
        except Exception:
            continue


def near(a, b, tolerance=12):
    return all(abs(a[k] - b[k]) <= tolerance for k in ("x", "y", "width", "height"))


def find_window(spec):
    """The top-level accessible that is the given operating-system window."""
    want = spec.get("bounds")
    best, best_score = None, 0
    for app, pid, win in application_windows():
        score = 0
        rect = screen_rect(win)
        if want and rect and near(rect, want):
            score += 4
        elif want and rect and near(rect, want, 80):
            score += 1
        if spec.get("pid") and pid == spec["pid"]:
            score += 2
        if spec.get("title") and (win.get_name() or "") == spec["title"]:
            score += 2
        if score > best_score:
            best, best_score = win, score
    return best if best_score >= 3 else None


def walk(root):
    """Showing descendants of root as flat nodes with parent indexes."""
    nodes = []
    stack = [(root, -1, 0)]
    while stack and len(nodes) < MAX_NODES:
        node, parent, depth = stack.pop()
        try:
            if not has_state(node, Atspi.StateType.SHOWING) and depth > 0:
                continue
            rect = screen_rect(node)
            role = node.get_role_name()
            index = parent
            if rect is not None:
                secure = role in SECURE_ROLES
                entry = {
                    "i": len(nodes),
                    "p": parent,
                    "role": role,
                    "secure": secure,
                    "name": "" if secure else (node.get_name() or "")[:MAX_TEXT],
                    "text": "" if secure else text_of(node),
                    "bounds": rect,
                }
                index = entry["i"]
                nodes.append(entry)
            if depth < MAX_DEPTH:
                children = [
                    node.get_child_at_index(i) for i in range(node.get_child_count())
                ]
                for child in reversed(children):
                    if child is not None:
                        stack.append((child, index, depth + 1))
        except Exception:
            continue
    return nodes


def tree(spec):
    win = find_window(spec)
    if win is None:
        return {"found": False, "nodes": []}
    return {"found": True, "nodes": walk(win)}


def focus(_spec=None):
    for app, _pid, win in application_windows():
        if not has_state(win, Atspi.StateType.ACTIVE):
            continue
        secure = False
        stack = [(win, 0)]
        seen = 0
        while stack and seen < MAX_NODES:
            node, depth = stack.pop()
            seen += 1
            try:
                if has_state(node, Atspi.StateType.FOCUSED):
                    secure = is_secure(node)
                    break
                if depth < MAX_DEPTH and has_state(node, Atspi.StateType.SHOWING):
                    for i in range(node.get_child_count()):
                        child = node.get_child_at_index(i)
                        if child is not None:
                            stack.append((child, depth + 1))
            except Exception:
                continue
        return {
            "found": True,
            "secure": secure,
            "app": app.get_name() or "",
            "title": win.get_name() or "",
        }
    return {"found": False, "secure": False, "app": "", "title": ""}


def selection(spec):
    win = find_window(spec)
    if win is None:
        return {"found": False}
    stack = [(win, 0)]
    seen = 0
    while stack and seen < MAX_NODES:
        node, depth = stack.pop()
        seen += 1
        try:
            if is_secure(node) or not has_state(node, Atspi.StateType.SHOWING):
                continue
            if node.get_text_iface() is not None and Atspi.Text.get_n_selections(node):
                span = Atspi.Text.get_selection(node, 0)
                text = Atspi.Text.get_text(node, span.start_offset, span.end_offset)
                if text:
                    e = Atspi.Text.get_range_extents(
                        node, span.start_offset, span.end_offset, Atspi.CoordType.SCREEN
                    )
                    return {
                        "found": True,
                        "text": text[:MAX_TEXT],
                        "bounds": {
                            "x": e.x,
                            "y": e.y,
                            "width": e.width,
                            "height": e.height,
                        },
                    }
            if depth < MAX_DEPTH:
                for i in range(node.get_child_count()):
                    child = node.get_child_at_index(i)
                    if child is not None:
                        stack.append((child, depth + 1))
        except Exception:
            continue
    return {"found": False}


COMMANDS = {
    "ping": lambda _spec: {"pong": True},
    "tree": tree,
    "focus": focus,
    "selection": selection,
}


def main():
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        request = {}
        try:
            request = json.loads(line)
            result = COMMANDS[request["cmd"]](request.get("window") or {})
            reply = {"id": request.get("id"), "ok": True, "result": result}
        except Exception as error:  # a bad request must not end the helper
            reply = {"id": request.get("id"), "ok": False, "error": str(error)}
        sys.stdout.write(json.dumps(reply) + "\n")
        sys.stdout.flush()


if __name__ == "__main__":
    main()
