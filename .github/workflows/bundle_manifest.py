"""Compare the desktop manifest embedded in bin/blinkling.cjs with the pinned file."""

import json
from pathlib import Path
import re
import sys

MARKER = "// plugin/desktop/manifest.json\nvar manifest_default = "


def embedded_manifest(bundle_text):
    """Read the manifest esbuild inlined into the bundle as a JavaScript object."""
    start = bundle_text.find(MARKER)
    if start < 0:
        raise SystemExit("The bundle does not embed plugin/desktop/manifest.json")
    start += len(MARKER)
    end = bundle_text.find("\n};\n", start)
    if end < 0:
        raise SystemExit("The embedded desktop manifest is not closed")
    literal = bundle_text[start : end + 2]
    as_json = re.sub(r"^(\s*)([A-Za-z_$][\w$]*):", r'\1"\2":', literal, flags=re.M)
    try:
        return json.loads(as_json)
    except json.JSONDecodeError as error:
        raise SystemExit(f"Cannot read the embedded desktop manifest: {error}")


def check_bundle_manifest(bundle, manifest):
    """Fail when the shipped launcher would pin other builds than the release did."""
    embedded = embedded_manifest(Path(bundle).read_text())
    pinned = json.loads(Path(manifest).read_text())
    if embedded != pinned:
        raise SystemExit(
            "bin/blinkling.cjs embeds a stale desktop manifest: "
            f"{len(embedded.get('builds', []))} builds against {len(pinned.get('builds', []))} pinned. "
            "Run node scripts/build-plugin.mjs after pinning and commit bin."
        )


if __name__ == "__main__":
    if len(sys.argv) != 3:
        raise SystemExit("usage: bundle_manifest.py <bin/blinkling.cjs> <plugin/desktop/manifest.json>")
    check_bundle_manifest(*sys.argv[1:])
    print("The bundled launcher embeds the pinned desktop manifest.")
