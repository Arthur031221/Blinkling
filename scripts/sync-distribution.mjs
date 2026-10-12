import { readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const README_LOCALES = [
  { file: "README.md", locale: "en", heading: /^##\s+Install\s*$/im },
  {
    file: "README.de.md",
    locale: "de",
    heading: /^##\s+Installation\s*$/im,
  },
  {
    file: "README.es.md",
    locale: "es",
    heading: /^##\s+Instalación\s*$/im,
  },
  {
    file: "README.fr.md",
    locale: "fr",
    heading: /^##\s+Installation\s*$/im,
  },
  {
    file: "README.ja.md",
    locale: "ja",
    heading: /^##\s+インストール\s*$/im,
  },
  { file: "README.ko.md", locale: "ko", heading: /^##\s+설치\s*$/im },
  {
    file: "README.pt-BR.md",
    locale: "pt-BR",
    heading: /^##\s+Instalação\s*$/im,
  },
  { file: "README.zh-CN.md", locale: "zh-CN", heading: /^##\s+安装\s*$/im },
  { file: "README.zh-TW.md", locale: "zh-TW", heading: /^##\s+安裝\s*$/im },
];

const LINK_LABELS = {
  en: {
    chrome: "Install from the Chrome Web Store",
    edge: "Install from Microsoft Edge Add-ons",
  },
  de: {
    chrome: "Im Chrome Web Store installieren",
    edge: "Bei Microsoft Edge-Add-ons installieren",
  },
  es: {
    chrome: "Instalar desde Chrome Web Store",
    edge: "Instalar desde Microsoft Edge Add-ons",
  },
  fr: {
    chrome: "Installer depuis le Chrome Web Store",
    edge: "Installer depuis Microsoft Edge Add-ons",
  },
  ja: {
    chrome: "Chrome ウェブストアからインストール",
    edge: "Microsoft Edge アドオンからインストール",
  },
  ko: {
    chrome: "Chrome 웹 스토어에서 설치",
    edge: "Microsoft Edge 추가 기능에서 설치",
  },
  "pt-BR": {
    chrome: "Instalar pela Chrome Web Store",
    edge: "Instalar pelos Complementos do Microsoft Edge",
  },
  "zh-CN": {
    chrome: "从 Chrome 网上应用店安装",
    edge: "从 Microsoft Edge 加载项安装",
  },
  "zh-TW": {
    chrome: "從 Chrome 線上應用程式商店安裝",
    edge: "從 Microsoft Edge Add-ons 安裝",
  },
};

const BLOCK_START = "<!-- glimpselet-store-install:start -->";
const BLOCK_END = "<!-- glimpselet-store-install:end -->";
const WARNING_MARKER =
  /(?:developer mode|entwicklermodus|mode développeur|modo de desarrollador|デベロッパーモード|개발자 모드|modo de desenvolvedor|开发者模式|開發人員模式)/i;
const ALLOWED_HOSTS = {
  chromeWebStoreUrl: new Set([
    "chromewebstore.google.com",
    "chrome.google.com",
  ]),
  edgeAddonsUrl: new Set(["microsoftedge.microsoft.com"]),
};

function approvedStoreUrl(value, key) {
  if (value === "") return "";
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new TypeError(`${key} must be an approved HTTPS store URL`);
  }
  if (
    parsed.protocol !== "https:" ||
    !ALLOWED_HOSTS[key].has(parsed.hostname) ||
    parsed.username ||
    parsed.password
  ) {
    throw new TypeError(`${key} must be an approved HTTPS store URL`);
  }
  return parsed.href;
}

function storeLinks(config, locale) {
  const links = [];
  if (config.chromeWebStoreUrl)
    links.push(`[${LINK_LABELS[locale].chrome}](${config.chromeWebStoreUrl})`);
  if (config.edgeAddonsUrl)
    links.push(`[${LINK_LABELS[locale].edge}](${config.edgeAddonsUrl})`);
  return links;
}

function updateReadme(source, locale, config) {
  const links = storeLinks(config, locale);
  const block = links.length
    ? `${BLOCK_START}\n${links.map((link) => `- ${link}`).join("\n")}\n${BLOCK_END}`
    : "";
  if (
    block &&
    source.includes(block) &&
    !source
      .split(/(?<=\n)/)
      .some(
        (line) => line.trimStart().startsWith(">") && WARNING_MARKER.test(line),
      )
  ) {
    return source;
  }
  let content = source.replace(
    new RegExp(`${BLOCK_START}[\\s\\S]*?${BLOCK_END}`, "g"),
    "",
  );

  if (links.length) {
    const heading = README_LOCALES.find(
      (entry) => entry.locale === locale,
    ).heading;
    const match = heading.exec(content);
    if (!match) throw new Error(`Could not find the ${locale} Install heading`);
    const afterHeading = match.index + match[0].length;
    const followingContent = content
      .slice(afterHeading)
      .replace(/^(?:\r?\n)+/, "");
    content = `${content.slice(0, afterHeading)}\n\n${block}\n\n${followingContent}`;
    content = content
      .split(/(?<=\n)/)
      .filter(
        (line) =>
          !(line.trimStart().startsWith(">") && WARNING_MARKER.test(line)),
      )
      .join("");
  }
  return content;
}

export async function syncDistribution({
  root = process.cwd(),
  configPath = join(root, "config/distribution.json"),
} = {}) {
  const rawConfig = JSON.parse(await readFile(configPath, "utf8"));
  const config = {
    chromeWebStoreUrl: approvedStoreUrl(
      rawConfig.chromeWebStoreUrl ?? "",
      "chromeWebStoreUrl",
    ),
    edgeAddonsUrl: approvedStoreUrl(
      rawConfig.edgeAddonsUrl ?? "",
      "edgeAddonsUrl",
    ),
  };

  // An empty distribution config is deliberately a byte-for-byte no-op.
  if (!config.chromeWebStoreUrl && !config.edgeAddonsUrl) return;

  for (const { file, locale } of README_LOCALES) {
    const path = join(root, file);
    const source = await readFile(path, "utf8");
    const updated = updateReadme(source, locale, config);
    if (updated !== source) await writeFile(path, updated);
  }
}

if (
  process.argv[1] &&
  fileURLToPath(import.meta.url) === resolve(process.argv[1])
) {
  await syncDistribution();
}
