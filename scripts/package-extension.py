"""Package the locally built extension without extra parent folders."""
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile
import hashlib

root = Path(__file__).resolve().parents[1]
source = root / "dist-extension"
output = root / "release" / "blinkling-extension.zip"
output.parent.mkdir(exist_ok=True)
if not (source / "manifest.json").is_file():
    raise SystemExit("Run npm run build:extension first")
with ZipFile(output, "w", ZIP_DEFLATED, compresslevel=9) as archive:
    for path in sorted(source.rglob("*")):
        if path.is_file():
            archive.write(path, path.relative_to(source))
print(f"Packaged {output.name}, {output.stat().st_size} bytes, sha256 {hashlib.sha256(output.read_bytes()).hexdigest()}")
