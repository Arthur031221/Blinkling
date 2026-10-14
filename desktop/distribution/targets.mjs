/** The four desktop builds Blinkling ships. `os` uses Node's platform names
 * (what the launcher matches on); `label` is the word in the asset name. */
export const TARGETS = [
  {
    os: "darwin",
    label: "mac",
    arch: "arm64",
    extension: "zip",
    archive: "zip",
    entry: "Blinkling.app/Contents/MacOS/Blinkling",
  },
  {
    os: "darwin",
    label: "mac",
    arch: "x64",
    extension: "zip",
    archive: "zip",
    entry: "Blinkling.app/Contents/MacOS/Blinkling",
  },
  {
    os: "win32",
    label: "win",
    arch: "x64",
    extension: "exe",
    archive: "file",
  },
  {
    os: "linux",
    label: "linux",
    arch: "x64",
    extension: "AppImage",
    archive: "file",
  },
];

export const assetName = (target, version) =>
  `Blinkling-${version}-${target.label}-${target.arch}.${target.extension}`;

/** Where the packager leaves the unpacked app for a target. */
export const packagedDirectory = (target) =>
  `Blinkling-${target.os}-${target.arch}`;
