import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";

// The Pages site is static: the showcase, the privacy policy and their assets.
await rm("dist", { recursive: true, force: true });
await mkdir("dist/assets", { recursive: true });
await cp("public/privacy.html", "dist/privacy.html");
for (const name of ["Inter.ttf", "Fraunces.ttf", "logo.svg"]) {
  await cp(`public/assets/${name}`, `dist/assets/${name}`);
}
await cp("demo/index.html", "dist/index.html");
await cp("demo/demo.css", "dist/demo.css");
await mkdir("dist/demo-assets", { recursive: true });
for (const name of ["demo", "arxiv"]) {
  await cp(`assets/${name}.gif`, `dist/demo-assets/${name}.gif`);
}

// The install guide, with the animated wordmark it shows as its title.
await cp("site/install", "dist/install", { recursive: true });
for (const name of ["wordmark-light", "wordmark-dark"]) {
  await cp(`assets/${name}.svg`, `dist/install/${name}.svg`);
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
      `Install from ${links.join(" or ")}, then run /blinkling:blinkling.`,
    ),
  );
}
console.log("Built the Pages showcase, install guide and privacy policy.");
