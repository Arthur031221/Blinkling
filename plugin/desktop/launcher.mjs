import { createHash } from "node:crypto";
/** Release builder embeds the release manifest with the plugin, never trusts a
 * checksum downloaded beside an untrusted binary. Extraction/launch is pending.
 */
export function selectBuild(
  manifest,
  platform = process.platform,
  arch = process.arch,
) {
  const build = manifest.builds.find(
    (b) => b.platform === platform && b.arch === arch,
  );
  if (!build)
    throw new Error(`Unsupported desktop target: ${platform}/${arch}`);
  const url = new URL(build.url);
  if (
    url.protocol !== "https:" ||
    url.hostname !== "github.com" ||
    !url.pathname.startsWith("/Arthur031221/Glimpselet/releases/download/")
  )
    throw new Error("Invalid release origin");
  if (!/^[a-f0-9]{64}$/.test(build.sha256))
    throw new Error("Invalid release digest");
  return build;
}
export function verifyArchive(bytes, build) {
  if (createHash("sha256").update(bytes).digest("hex") !== build.sha256)
    throw new Error("Desktop archive checksum mismatch");
}
export async function launchDesktop() {
  throw new Error(
    "Desktop release launcher is not implemented; no v3 release is published yet",
  );
}
