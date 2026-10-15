import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { WORDMARK_CSS, wordmarkSvg } from "../../assets/brand/wordmark.mjs";

// The Pages site is static: the showcase, the privacy policy and their assets.
await rm("dist", { recursive: true, force: true });
await mkdir("dist/assets", { recursive: true });
await cp("public/privacy.html", "dist/privacy.html");
for (const name of ["Inter.ttf", "Fraunces.ttf", "logo.svg"]) {
  await cp(`public/assets/${name}`, `dist/assets/${name}`);
}
// The showcase header draws the name with the shared Wordmark component: its
// inline SVG replaces the placeholder and its stylesheet is a file, because the
// page allows no inline styles.
const showcase = await readFile("demo/index.html", "utf8");
if (!showcase.includes("<!--wordmark-->")) {
  throw new Error("demo/index.html lost its <!--wordmark--> placeholder");
}
await writeFile(
  "dist/index.html",
  showcase.replace("<!--wordmark-->", wordmarkSvg({ id: "showcase" })),
);
await writeFile("dist/wordmark.css", `${WORDMARK_CSS}\n`);
await cp("demo/demo.css", "dist/demo.css");
await mkdir("dist/demo-assets", { recursive: true });
for (const name of ["pick", "ask"]) {
  await cp(`assets/${name}.gif`, `dist/demo-assets/${name}.gif`);
}

// The install guide, with the animated wordmark files it shows as its title.
await cp("site/install", "dist/install", { recursive: true });
for (const name of ["wordmark-light", "wordmark-dark"]) {
  await cp(`assets/brand/${name}.svg`, `dist/install/${name}.svg`);
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
