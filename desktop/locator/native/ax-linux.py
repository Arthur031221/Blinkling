#!/usr/bin/env python3
"""Prints the AT-SPI tree of the window at a screen point as one JSON object:

  {"frame": {"name", "x", "y", "width", "height"},
   "nodes": [{"p": parent index or -1, "role", "name", "text", "x", "y", "w", "h",
              "secure"}]}

Coordinates are screen pixels. A password field is printed with no name and no
text: its value is never read here, so it can never travel any further.

usage: ax-linux.py X Y TITLE [MAX_NODES] [BUDGET_MS]
"""
import json
import sys
import time

import gi

gi.require_version("Atspi", "2.0")
from gi.repository import Atspi  # noqa: E402

FRAMES = {"frame", "window", "dialog", "alert", "file chooser", "document frame"}
SECURE = {"password text"}
MAX_TEXT = 4000


def extents(node):
    try:
        component = node.get_component_iface()
        if component is None:
            return None
        box = component.get_extents(Atspi.CoordType.SCREEN)
        return box.x, box.y, box.width, box.height
    except Exception:
        return None


def safe(call, default=""):
    try:
        value = call()
        return default if value is None else value
    except Exception:
        return default


def pick_frame(x, y, title):
    desktop = Atspi.get_desktop(0)
    found = []
    for a in range(desktop.get_child_count()):
        app = safe(lambda: desktop.get_child_at_index(a), None)
        if app is None:
            continue
        for f in range(safe(app.get_child_count, 0)):
            frame = safe(lambda: app.get_child_at_index(f), None)
            if frame is None or safe(frame.get_role_name).lower() not in FRAMES:
                continue
            box = extents(frame)
            if not box or box[2] <= 0 or box[3] <= 0:
                continue
            if box[0] <= x < box[0] + box[2] and box[1] <= y < box[1] + box[3]:
                found.append((frame, box))
    for frame, box in found:
        if safe(frame.get_name) == title:
            return frame, box
    return found[0] if found else (None, None)


def text_of(node, role):
    if role in SECURE:
        return ""
    try:
        iface = node.get_text_iface()
        if iface is None:
            return ""
        count = Atspi.Text.get_character_count(iface)
        return Atspi.Text.get_text(iface, 0, min(count, MAX_TEXT)) or ""
    except Exception:
        return ""


def main():
    x, y, title = int(sys.argv[1]), int(sys.argv[2]), sys.argv[3]
    limit = int(sys.argv[4]) if len(sys.argv) > 4 else 800
    budget = (int(sys.argv[5]) if len(sys.argv) > 5 else 900) / 1000
    started = time.monotonic()
    frame, box = pick_frame(x, y, title)
    if frame is None:
        print(json.dumps({"frame": None, "nodes": []}))
        return
    nodes = []
    queue = [(frame, -1, 0)]
    while queue and len(nodes) < limit and time.monotonic() - started < budget:
        node, parent, depth = queue.pop(0)
        role = safe(node.get_role_name).lower()
        secure = role in SECURE
        shown = safe(lambda: node.get_state_set().contains(Atspi.StateType.SHOWING), True)
        if not shown:
            continue
        rect = extents(node)
        index = len(nodes)
        if rect and rect[2] > 0 and rect[3] > 0:
            nodes.append(
                {
                    "p": parent,
                    "role": role,
                    "name": "" if secure else safe(node.get_name),
                    "text": text_of(node, role),
                    "x": rect[0],
                    "y": rect[1],
                    "w": rect[2],
                    "h": rect[3],
                    "secure": secure,
                }
            )
        else:
            index = parent
        if depth < 40:
            for c in range(safe(node.get_child_count, 0)):
                child = safe(lambda: node.get_child_at_index(c), None)
                if child is not None:
                    queue.append((child, index, depth + 1))
    print(
        json.dumps(
            {
                "frame": {
                    "name": safe(frame.get_name),
                    "x": box[0],
                    "y": box[1],
                    "width": box[2],
                    "height": box[3],
                },
                "nodes": nodes,
            }
        )
    )


main()
