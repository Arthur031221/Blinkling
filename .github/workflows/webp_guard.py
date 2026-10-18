"""Read the size and frame rate of an animated WebP from its RIFF chunks."""

import struct

MIN_WIDTH = 1280
MIN_FPS = 24
MAX_FPS = 30.5


def webp_stats(data):
    """Return (canvas width, canvas height, frames, frames per second)."""
    if data[:4] != b"RIFF" or data[8:12] != b"WEBP":
        raise ValueError("not a WebP")
    width = height = frames = total_ms = 0
    at = 12
    while at + 8 <= len(data):
        kind = data[at : at + 4]
        size = struct.unpack("<I", data[at + 4 : at + 8])[0]
        body = data[at + 8 : at + 8 + size]
        if kind == b"VP8X" and len(body) >= 10:
            width = int.from_bytes(body[4:7], "little") + 1
            height = int.from_bytes(body[7:10], "little") + 1
        elif kind == b"ANMF" and len(body) >= 15:
            frames += 1
            total_ms += int.from_bytes(body[12:15], "little")
        at += 8 + size + (size & 1)
    fps = frames * 1000 / total_ms if total_ms else 0
    return width, height, frames, fps


def webp_problem(data, name):
    """The reason a README demo is too small or at the wrong rate, or None."""
    try:
        width, _height, frames, fps = webp_stats(data)
    except ValueError:
        return f"Not a WebP: {name}"
    if width < MIN_WIDTH:
        return f"README demo is {width} px wide, under {MIN_WIDTH}: {name}"
    if frames < 2 or not MIN_FPS <= fps <= MAX_FPS:
        return f"README demo runs at {fps:.1f} fps, not {MIN_FPS} to 30: {name}"
    return None
