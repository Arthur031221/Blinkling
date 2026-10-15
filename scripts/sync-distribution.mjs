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

const STORE_PAIR_STEP = {
  en: "Open the store link above and add Blinkling. It connects to Blink on its own; click its toolbar button to see the status.",
  de: "Öffne den Store-Link oben und füge Blinkling hinzu. Es verbindet sich von selbst mit Blink; ein Klick auf die Schaltfläche in der Symbolleiste zeigt den Status.",
  es: "Abre el enlace de la tienda de arriba y añade Blinkling. Se conecta solo con Blink; pulsa su botón de la barra de herramientas para ver el estado.",
  fr: "Ouvrez le lien de la boutique ci-dessus et ajoutez Blinkling. Il se connecte tout seul à Blink ; cliquez sur son bouton dans la barre d'outils pour voir l'état.",
  ja: "上のストアリンクを開いて Blinkling を追加します。Blink には自動で接続され、ツールバーのボタンを押すと状況を確認できます。",
  ko: "위 스토어 링크에서 Blinkling을 추가합니다. Blink에 자동으로 연결되며, 도구 모음 버튼을 누르면 상태를 볼 수 있습니다.",
  "pt-BR":
    "Abra o link da loja acima e adicione o Blinkling. Ele se conecta sozinho ao Blink; clique no botão da barra de ferramentas para ver o estado.",
  "zh-CN":
    "打开上方商店链接并添加 Blinkling。它会自动连接 Blink，点击工具栏按钮即可查看状态。",
  "zh-TW":
    "開啟上方商店連結並加入 Blinkling。它會自動連線到 Blink，點工具列按鈕即可查看狀態。",
};
const UNPACKED_LIMIT =
  /developer banner|Entwicklermodus-Hinweis|Updates erfolgen manuell|bannière de développement|aviso de desarrollador|開発者向け|開發者提示|开发者提示|개발자 배너|aviso de desenvolvedor|atualizações.*manuais|mises à jour.*manuelles/i;

const BLOCK_START = "<!-- blinkling-store-install:start -->";
const BLOCK_END = "<!-- blinkling-store-install:end -->";
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
    // Keep the developer instructions only in the Advanced source section.
    content = content.replace(
      /^3\.[\s\S]*?(?=^###\s)/m,
      `3. ${STORE_PAIR_STEP[locale]}\n\n`,
    );
    const advanced = /^###\s.+$/m.exec(content);
    if (!advanced)
      throw new Error(`Could not find the ${locale} Advanced heading`);
    const followingSection = /^##\s.+$/m.exec(
      content.slice(advanced.index + advanced[0].length),
    );
    const end = followingSection
      ? advanced.index + advanced[0].length + followingSection.index
      : content.length;
    const removeLimits = (text) =>
      text
        .split(/(?<=[.!?。])\s+(?=\S)|(?<=。)(?=\S)/)
        .filter((sentence) => !UNPACKED_LIMIT.test(sentence))
        .join(" ");
    // Limits are prose paragraphs; preserve Markdown newlines around them.
    const strip = (text) =>
      text
        .split("\n")
        .map((line) => (UNPACKED_LIMIT.test(line) ? removeLimits(line) : line))
        .join("\n");
    content =
      strip(content.slice(0, advanced.index)) +
      content.slice(advanced.index, end) +
      strip(content.slice(end));
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
