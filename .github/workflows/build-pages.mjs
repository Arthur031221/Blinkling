import { cp, mkdir, readFile, writeFile } from "node:fs/promises";

// Preserve the interactive fixture and put the v2 showcase at the Pages root.
await cp("dist/index.html", "dist/try.html");
await cp("demo/index.html", "dist/index.html");
await cp("demo/demo.css", "dist/demo.css");
await mkdir("dist/demo-assets", { recursive: true });
for (const name of ["floating", "guide"]) {
  await cp(`assets/store/${name}.png`, `dist/demo-assets/${name}.png`);
}
for (const name of ["guide", "crop"]) {
  await cp(`assets/${name}.gif`, `dist/demo-assets/${name}.gif`);
}

// The same approved store URLs switch the site and plugin installation flows.
const distribution = JSON.parse(
  await readFile("config/distribution.json", "utf8"),
);
const links = [];
for (const [key, host, label] of [
  ["chromeWebStoreUrl", "chromewebstore.google.com", "Chrome Web Store"],
  ["edgeAddonsUrl", "microsoftedge.microsoft.com", "Microsoft Edge Add-ons"],
]) {
  if (!distribution[key]) continue;
  const url = new URL(distribution[key]);
  if (
    url.protocol !== "https:" ||
    url.hostname !== host ||
    url.username ||
    url.password
  ) {
    throw new Error(`${key} must be an approved HTTPS store URL`);
  }
  const href = url.href.replaceAll("&", "&amp;").replaceAll('"', "&quot;");
  links.push(`<a href="${href}">${label}</a>`);
}
if (links.length) {
  const html = await readFile("dist/index.html", "utf8");
  await writeFile(
    "dist/index.html",
    html.replace(
      /Store listings are not available yet\.[\s\S]*?Updates are manual\./,
      `Install from ${links.join(" or ")}, then return to the welcome guide to pair.`,
    ),
  );
}
console.log(
  "Built the v2 Pages showcase, prerecorded chat and privacy policy.",
);
