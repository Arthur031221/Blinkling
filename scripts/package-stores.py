"""Create the two store submission kits from a tested local extension."""
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile
import hashlib

root = Path(__file__).resolve().parents[1]
release = root / "release"
extension = release / "glimpselet-extension.zip"
if not extension.is_file():
    raise SystemExit("Run npm run package:extension first")
files = {
    "glimpselet-extension.zip": extension,
    "listing.md": root / "docs/STORE-LISTING.md",
    "permissions.md": root / "docs/STORE.md",
    "privacy.html": root / "public/privacy.html",
}
for path in sorted((root / "assets/store").glob("*.png")):
    files[f"assets/{path.name}"] = path
if len(files) < 9:
    raise SystemExit("Store screenshots and the promo tile are required")
for store in ("chrome", "edge"):
    output = release / f"glimpselet-{store}-store.zip"
    with ZipFile(output, "w", ZIP_DEFLATED, compresslevel=9) as archive:
        for name, path in files.items():
            archive.write(path, name)
    print(f"Packaged {output.name}: {output.stat().st_size} bytes")
artifacts = [extension] + [release / f"glimpselet-{s}-store.zip" for s in ("chrome", "edge")]
(release / "SHA256SUMS").write_text("".join(
    f"{hashlib.sha256(path.read_bytes()).hexdigest()}  {path.name}\n" for path in artifacts
))
