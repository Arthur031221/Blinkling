"""Check the files users download and the kits submitted to both stores."""

from hashlib import sha256
from io import BytesIO
import json
from pathlib import Path, PurePosixPath
import re
import struct
from zipfile import ZipFile

ROOT = Path(__file__).resolve().parents[2]


def require(condition, message):
    if not condition:
        raise SystemExit(message)


def read_json(path):
    return json.loads((ROOT / path).read_text())


def check_png(data, size, name):
    require(data[:8] == b"\x89PNG\r\n\x1a\n", f"Not a PNG: {name}")
    width, height, depth, color = struct.unpack(">IIBB", data[16:26])
    require((width, height) == size, f"Wrong image dimensions: {name}")
    require(depth == 8 and color == 2, f"Expected opaque RGB PNG: {name}")


version = read_json("package.json")["version"]
require(re.fullmatch(r"\d+\.\d+\.\d+", version), "Invalid release version")
lock = read_json("package-lock.json")
for name, actual in {
    "bridge": read_json("bridge/package.json")["version"],
    "plugin": read_json(".claude-plugin/plugin.json")["version"],
    "extension": read_json("extension/manifest.json")["version"],
    "lock": lock["version"],
    "root lock package": lock["packages"][""]["version"],
    "bridge lock package": lock["packages"]["bridge"]["version"],
}.items():
    require(actual == version, f"Version mismatch in {name}: {actual} != {version}")
require((ROOT / f"docs/releases/v{version}.md").is_file(), "Missing release notes")
require(f"## {version} - " in (ROOT / "CHANGELOG.md").read_text(), "Missing changelog entry")

recordings = read_json("assets/recordings.json")
require(recordings["version"] == version, "Demo recordings use another extension version")
require({item["asset"] for item in recordings["recordings"]} == {"assets/demo.gif", "assets/arxiv.gif"}, "Missing real demo recording")
for item in recordings["recordings"]:
    data = (ROOT / item["asset"]).read_bytes()
    require(data[:6] in [b"GIF87a", b"GIF89a"], f"Not a GIF: {item['asset']}")
    require(sha256(data).hexdigest() == item["sha256"], f"Demo checksum mismatch: {item['asset']}")
    require(item["url"].startswith("https://") and item["requestCount"] >= 2, f"Incomplete public-site recording: {item['asset']}")

readmes = sorted(ROOT.glob("README*.md"))
require(len(readmes) == 9, "Expected nine localized READMEs")
for path in readmes:
    content = path.read_text()
    require(content.splitlines()[-1] == "Assisted by Claude/Codex.", f"Wrong final line: {path.name}")
    first_screen = content.split("\n## ", 1)[0]
    for image in ["assets/logo.svg", "assets/demo.gif"]:
        require(image in first_screen, f"Missing first-screen image: {path.name}: {image}")
    require("assets/arxiv.gif" in content, f"Missing paper demo: {path.name}")
    for target in re.findall(r"\]\(([^\s)]+)\)", content):
        if not re.match(r"https?://|#", target):
            require((path.parent / target.split("#", 1)[0]).exists(), f"Broken README link: {path.name}: {target}")

images = {f"{name}.png": (1280, 800) for name in ["floating", "guide", "crop", "translation"]}
images["promo.png"] = (440, 280)
for name, size in images.items():
    check_png((ROOT / "assets/store" / name).read_bytes(), size, name)

extension_path = ROOT / "release/glimpselet-extension.zip"
with ZipFile(extension_path) as archive:
    require(archive.testzip() is None, "Corrupt extension ZIP")
    names = archive.namelist()
    require(len(names) == len(set(names)), "Duplicate extension ZIP entries")
    built = {str(path.relative_to(ROOT / "dist-extension")) for path in (ROOT / "dist-extension").rglob("*") if path.is_file()}
    require(set(names) == built, "Extension ZIP differs from the build")
    for name in names:
        parts = PurePosixPath(name).parts
        require(not name.startswith("/") and ".." not in parts, f"Unsafe ZIP path: {name}")
        require(not any(part.startswith(".") for part in parts), f"Hidden development file: {name}")
        require(not name.endswith((".map", ".ts", ".tsx")) and "node_modules" not in parts, f"Development file: {name}")
        require(archive.read(name) == (ROOT / "dist-extension" / name).read_bytes(), f"Stale ZIP file: {name}")
    manifest = json.loads(archive.read("manifest.json"))
    require(manifest == read_json("extension/manifest.json"), "Packaged manifest differs from source")
    require(manifest["version"] == version, "Packaged extension version mismatch")
    scripts = [manifest["background"]["service_worker"]]
    scripts += [script for item in manifest.get("content_scripts", []) for script in item.get("js", [])]
    scripts += list(manifest["icons"].values())
    scripts += ["panel.html", "reader.html", "pdf.worker.js", "pdf.worker.min.mjs"]
    require(set(scripts) <= set(names), "A bundled entry point is missing")

common = {
    "glimpselet-extension.zip": extension_path,
    "listing.md": ROOT / "docs/STORE-LISTING.md",
    "permissions.md": ROOT / "docs/STORE.md",
    "privacy.html": ROOT / "public/privacy.html",
    **{f"assets/{name}": ROOT / "assets/store" / name for name in images},
}
artifacts = [extension_path]
for store in ["chrome", "edge"]:
    kit = ROOT / f"release/glimpselet-{store}-store.zip"
    with ZipFile(kit) as archive:
        require(archive.testzip() is None, f"Corrupt {store} kit")
        require(set(archive.namelist()) == set(common) and len(archive.namelist()) == len(common), f"Incomplete {store} kit")
        for name, path in common.items():
            require(archive.read(name) == path.read_bytes(), f"Stale {store} kit file: {name}")
        with ZipFile(BytesIO(archive.read("glimpselet-extension.zip"))) as inner:
            require(json.loads(inner.read("manifest.json"))["version"] == version, f"Wrong nested {store} extension version")
    artifacts.append(kit)
expected = "".join(f"{sha256(path.read_bytes()).hexdigest()}  {path.name}\n" for path in artifacts)
require((ROOT / "release/SHA256SUMS").read_text() == expected, "Release checksums do not match")
print(f"Release {version}: versions, nine READMEs, listing images and all three ZIPs passed.")
