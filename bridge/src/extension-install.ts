import { welcomeLocales } from "./welcome-locales.js";
import { cp, lstat, mkdir, readFile, readdir } from "node:fs/promises";
import { deflateRaw } from "node:zlib";
import { homedir, hostname, userInfo } from "node:os";
import { dirname, join, relative, resolve, sep } from "node:path";
import { execFile } from "node:child_process";
import { readFileSync } from "node:fs";

export type DistributionConfig = {
  chromeWebStoreUrl: string;
  edgeAddonsUrl: string;
};
export const DEFAULT_DISTRIBUTION: DistributionConfig = {
  chromeWebStoreUrl: "",
  edgeAddonsUrl: "",
};
export function loadDistributionConfig(
  file = process.env.GLIMPSELET_DISTRIBUTION_CONFIG ||
    join(process.cwd(), "config", "distribution.json"),
): DistributionConfig {
  try {
    const value = JSON.parse(
      readFileSync(file, "utf8"),
    ) as Partial<DistributionConfig>;
    return {
      chromeWebStoreUrl:
        typeof value.chromeWebStoreUrl === "string"
          ? value.chromeWebStoreUrl
          : "",
      edgeAddonsUrl:
        typeof value.edgeAddonsUrl === "string" ? value.edgeAddonsUrl : "",
    };
  } catch {
    return DEFAULT_DISTRIBUTION;
  }
}

export function distributionMode(
  config: DistributionConfig = DEFAULT_DISTRIBUTION,
): "store" | "unpacked" {
  return config.chromeWebStoreUrl.trim() || config.edgeAddonsUrl.trim()
    ? "store"
    : "unpacked";
}

export function selectedStoreUrl(
  config: DistributionConfig = DEFAULT_DISTRIBUTION,
  browser = "chrome",
): string | undefined {
  const value = (
    browser === "edge" ? config.edgeAddonsUrl : config.chromeWebStoreUrl
  ).trim();
  const valid =
    browser === "edge"
      ? /^https:\/\/microsoftedge\.microsoft\.com\/addons\/detail\/[\w-]+(?:\/[\w-]+)?\/?$/
      : /^https:\/\/chromewebstore\.google\.com\/detail\/[\w/-]+$/;
  return valid.test(value) ? value : undefined;
}

export const extensionFolder = () => join(homedir(), "Glimpselet-extension");

export const extensionSourceFolder = () =>
  resolve(
    process.env.GLIMPSELET_EXTENSION_DIR ||
      `${dirname(resolve(process.argv[1] ?? process.cwd()))}/extension`,
  );

const deflate = (input: Buffer) =>
  new Promise<Buffer>((resolveDeflate, reject) =>
    deflateRaw(input, (error, output) =>
      error ? reject(error) : resolveDeflate(output),
    ),
  );

const crcTable = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let value = n;
    for (let bit = 0; bit < 8; bit++)
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    table[n] = value >>> 0;
  }
  return table;
})();

const crc32 = (data: Buffer) => {
  let crc = 0xffffffff;
  for (const byte of data) crc = crcTable[(crc ^ byte) & 0xff]! ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
};

/** Build an extension-only ZIP without invoking an external archiver. */
export async function createExtensionZip(source: string): Promise<Buffer> {
  const root = resolve(source);
  const entries: {
    name: string;
    data: Buffer;
    compressed: Buffer;
    crc: number;
  }[] = [];
  const visit = async (directory: string): Promise<void> => {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      const info = await lstat(path);
      if (info.isSymbolicLink())
        throw new Error("Extension archives cannot contain symbolic links.");
      if (info.isDirectory()) {
        await visit(path);
        continue;
      }
      if (!info.isFile()) continue;
      const name = relative(root, path).split(sep).join("/");
      if (
        !name ||
        name.startsWith("/") ||
        name
          .split("/")
          .some((part) => !part || part === "." || part === "..") ||
        name.includes("\\") ||
        name.includes(":")
      )
        throw new Error("Extension archive contains an unsafe path.");
      const data = await readFile(path);
      entries.push({
        name,
        data,
        compressed: await deflate(data),
        crc: crc32(data),
      });
    }
  };
  await visit(root);
  if (!entries.some((entry) => entry.name === "manifest.json"))
    throw new Error("Extension archive is missing manifest.json.");

  const local: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;
  for (const entry of entries) {
    const name = Buffer.from(entry.name, "utf8");
    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50, 0);
    header.writeUInt16LE(20, 4);
    header.writeUInt16LE(0x0800, 6);
    header.writeUInt16LE(8, 8);
    header.writeUInt32LE(entry.crc, 14);
    header.writeUInt32LE(entry.compressed.length, 18);
    header.writeUInt32LE(entry.data.length, 22);
    header.writeUInt16LE(name.length, 26);
    local.push(header, name, entry.compressed);

    const directory = Buffer.alloc(46);
    directory.writeUInt32LE(0x02014b50, 0);
    directory.writeUInt16LE(0x0314, 4);
    directory.writeUInt16LE(20, 6);
    directory.writeUInt16LE(0x0800, 8);
    directory.writeUInt16LE(8, 10);
    directory.writeUInt32LE(entry.crc, 16);
    directory.writeUInt32LE(entry.compressed.length, 20);
    directory.writeUInt32LE(entry.data.length, 24);
    directory.writeUInt16LE(name.length, 28);
    directory.writeUInt32LE((0o100644 << 16) >>> 0, 38);
    directory.writeUInt32LE(offset, 42);
    central.push(directory, name);
    offset += header.length + name.length + entry.compressed.length;
  }
  const centralSize = central.reduce((sum, part) => sum + part.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...local, ...central, end]);
}

export async function installExtension(
  source: string,
  destination = extensionFolder(),
): Promise<string> {
  await readFile(join(source, "manifest.json"));
  await mkdir(destination, { recursive: true, mode: 0o700 });
  await cp(source, destination, { recursive: true, force: true });
  return destination;
}

export function tunnelCommand(
  port: number,
  env: NodeJS.ProcessEnv = process.env,
): string | undefined {
  if (!env.SSH_CONNECTION) return undefined;
  const connection = env.SSH_CONNECTION.trim().split(/\s+/);
  const host = env.GLIMPSELET_SSH_HOST || connection[2] || hostname();
  const rawSshPort = env.GLIMPSELET_SSH_PORT || connection[3] || "22";
  if (!/^\d{1,5}$/.test(rawSshPort)) return undefined;
  const sshPort = Number(rawSshPort);
  if (sshPort < 1 || sshPort > 65535) return undefined;
  const user = env.GLIMPSELET_SSH_USER || userInfo().username;
  if (!/^[\w.:-]+$/.test(host) || !/^[\w.-]+$/.test(user)) return undefined;
  const address = host.includes(":") ? `[${host}]` : host;
  const portOption = sshPort === 22 ? "" : `-p ${sshPort} `;
  return `ssh -N ${portOption}-L ${port}:127.0.0.1:${port} ${user}@${address}`;
}

export function folderRevealCommand(
  folder: string,
  platform = process.platform,
): [string, string[]] {
  if (platform === "darwin") return ["open", ["-R", folder]];
  if (platform === "win32") return ["explorer.exe", [folder]];
  return ["xdg-open", [folder]];
}

export function revealExtensionFolder(): Promise<void> {
  const [command, args] = folderRevealCommand(extensionFolder());
  return new Promise((resolveReveal, reject) =>
    execFile(command, args, { timeout: 5000, windowsHide: true }, (error) =>
      error ? reject(error) : resolveReveal(),
    ),
  );
}

export function openInstallSurface(url: string, folder?: string): void {
  if (
    process.env.GLIMPSELET_DISABLE_BROWSER_OPEN === "1" ||
    process.env.SSH_CONNECTION
  )
    return;
  const config = loadDistributionConfig();
  const storeUrl = selectedStoreUrl(
    config,
    process.env.GLIMPSELET_BROWSER === "msedge" ? "edge" : "chrome",
  );
  url = storeUrl || url;
  if (storeUrl) folder = undefined;
  const ignore = () => {};
  const run = (command: string, args: string[]) =>
    execFile(command, args, { timeout: 3000, windowsHide: true }, ignore);
  if (folder) {
    if (process.platform === "darwin") run("open", [folder]);
    else if (process.platform === "win32") run("explorer.exe", [folder]);
    else run("xdg-open", [folder]);
  }
  if (process.platform === "darwin") {
    run("open", ["-a", "Google Chrome", "chrome://extensions", url]);
  } else if (process.platform === "win32") {
    run("cmd", ["/c", "start", "", "msedge", "edge://extensions", url]);
  } else {
    run(process.env.GLIMPSELET_BROWSER || "google-chrome", [
      "chrome://extensions",
      url,
    ]);
  }
}

const escapeHtml = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );

export function installGuide(
  folder: string,
  config: DistributionConfig = loadDistributionConfig(),
): string {
  const store = selectedStoreUrl(
    config,
    process.env.GLIMPSELET_BROWSER === "msedge" ? "edge" : "chrome",
  );
  const manager =
    process.env.GLIMPSELET_BROWSER === "msedge"
      ? "edge://extensions"
      : "chrome://extensions";
  const text = (key: keyof typeof welcomeLocales.en) =>
    `<span data-i18n="${key}"></span>`;
  const installation = store
    ? `<a class="button primary" href="${escapeHtml(store)}">${text("store")}</a>`
    : `<div id="install-local"><code class="path">${escapeHtml(folder)}</code><button class="button" id="reveal">${text("reveal")}</button></div><div id="install-remote" hidden><a class="button" id="download" href="/install/extension.zip">${text("download")}</a><p>${text("remoteFolder")}</p></div><div class="manager"><label for="manager">${text("manager")}</label><div class="row"><input id="manager" class="manager-address" value="${manager}" readonly><button class="button" id="copy-manager">${text("copy")}</button></div><small>${text("paste")}</small></div><div class="install-images">${["01-extensions-before", "02-developer-mode", "03-select-extension-folder"].map((name, i) => `<figure><img src="/assets/install/${name}.png" alt="" loading="lazy"><figcaption>${i + 1}. ${text((["click1", "click2", "click3"] as const)[i]!)}</figcaption></figure>`).join("")}</div>`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Welcome to Glimpselet</title>
<style>
:root{color-scheme:light dark;--paper:#faf7f0;--ink:#302a23;--muted:#766d62;--line:#e6ddd0;--card:#fffdf9;--accent:#bd6849}*{box-sizing:border-box}[hidden]{display:none!important}body{margin:0;background:var(--paper);color:var(--ink);font:16px/1.5 system-ui,sans-serif}main{max-width:850px;margin:auto;padding:30px 22px 45px}header{display:flex;align-items:center;gap:20px;margin-bottom:24px}.blink{width:82px;height:102px;object-fit:contain;animation:hello .5s ease-out}h1{font:clamp(27px,5vw,38px)/1.2 Georgia,serif;margin:0;flex:1}h2{font:23px/1.3 Georgia,serif;margin:0 0 16px}.number{display:inline-grid;place-items:center;width:30px;height:30px;margin-right:10px;border-radius:50%;background:#bd68491a;color:var(--accent);font:600 16px system-ui}section{margin:14px 0;padding:22px;border:1px solid var(--line);border-radius:18px;background:var(--card)}.button,select{border:1px solid var(--line);border-radius:999px;padding:10px 15px;background:var(--card);color:var(--ink);font:600 14px system-ui;cursor:pointer;text-decoration:none}.primary{background:var(--accent);color:#fff;border-color:var(--accent)}button:disabled{opacity:.45;cursor:default}button:hover:enabled,a.button:hover{filter:brightness(.96)}:focus-visible{outline:3px solid var(--accent);outline-offset:3px}.path{display:block;margin:0 0 12px;overflow-wrap:anywhere}.manager{margin-top:16px}.row{display:flex;gap:8px;align-items:center;flex-wrap:wrap}input{min-width:0;border:1px solid var(--line);border-radius:8px;padding:9px;background:var(--paper);color:var(--ink);font:14px system-ui}small,p{color:var(--muted)}small{font-size:13px}.install-images{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;margin:20px 0}figure{margin:0}figure img{width:100%;border:1px solid var(--line);border-radius:8px}figcaption{font-size:13px;margin-top:6px}#connection{margin:0}.connected{color:#397858!important;animation:hello .3s ease-out}#try-note,#folder-note,#manager-note{margin-left:8px;font-size:14px}#reconnect{margin-top:10px}@keyframes hello{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}@media(max-width:600px){main{padding:18px 14px}header{gap:10px;flex-wrap:wrap}.blink{width:60px;height:75px}header select{margin-left:auto}section{padding:18px}.install-images{gap:8px}}@media(prefers-color-scheme:dark){:root{--paper:#24221f;--ink:#f4eee5;--muted:#b4a99b;--line:#4a4137;--card:#302d29}.connected{color:#b9e3c5!important}}@media(prefers-reduced-motion:reduce){*{animation:none!important}}
</style></head><body><main><header><img class="blink" src="/assets/logo.svg" alt="Blink"><h1>${text("title")}</h1><select id="language" aria-label="Language">${Object.entries(
    {
      en: "English",
      "zh-TW": "繁體中文",
      "zh-CN": "简体中文",
      ja: "日本語",
      ko: "한국어",
      es: "Español",
      fr: "Français",
      de: "Deutsch",
      "pt-BR": "Português",
    },
  )
    .map(([key, label]) => `<option value="${key}">${label}</option>`)
    .join("")}</select></header>
<section id="installation"><h2><span class="number">1</span>${text("install")}</h2>${installation}<span id="folder-note" role="status"></span><div class="row"><button class="button" id="try-zero">${text("try")}</button><span id="try-note" role="status"></span></div><span id="manager-note" role="status"></span></section>
<section id="connection-step"><h2><span class="number">2</span>${text("connect")}</h2><p id="connection" role="status" aria-live="polite"></p><button id="reconnect" class="button" hidden>${text("retry")}</button></section>
<section id="bubble-step"><h2><span class="number">3</span>${text("open")}</h2><button class="button primary" id="open-bubble" disabled>${text("open")}</button></section>
</main><script src="/install-guide.js"></script></body></html>`;
}

export const INSTALL_GUIDE_SCRIPT = `
const translations=${JSON.stringify(welcomeLocales)};
window.addEventListener('hashchange',()=>location.reload());
const params=new URLSearchParams(location.hash.slice(1)),code=params.get('code')||'';
const locales=Object.keys(translations),requested=new URLSearchParams(location.search).get('locale');
let lang=locales.includes(requested)?requested:locales.find(l=>l===navigator.language)||locales.find(l=>l===navigator.language.split('-')[0])||'en';
let connected=false,extensionReady=false,connecting=false,connectionKey='waiting',noteKey='';
const language=document.querySelector('#language'),status=document.querySelector('#connection'),open=document.querySelector('#open-bubble');
function render(){document.documentElement.lang=lang;document.title=translations[lang].title;language.value=lang;document.querySelectorAll('[data-i18n]').forEach(el=>el.textContent=translations[lang][el.dataset.i18n]);status.textContent=translations[lang][connectionKey];document.querySelector('#try-note').textContent=noteKey?translations[lang][noteKey]:''}
function setConnected(){connected=true;connecting=false;connectionKey='connected';status.classList.add('connected');open.disabled=false;document.querySelector('#reconnect').hidden=true;render()}
function connect(){if(connected||connecting||!extensionReady||!/^[A-F0-9]{16}$/.test(code))return;connecting=true;connectionKey='waiting';render();window.postMessage({type:'glimpselet:pair',port:Number(location.port||80),code,locale:lang},location.origin)}
language.onchange=()=>{lang=language.value;render()};
window.addEventListener('message',event=>{if(event.source!==window||event.origin!==location.origin)return;const data=event.data;if(data?.type==='glimpselet:extension-ready'){extensionReady=true;connect()}if(data?.type==='glimpselet:paired')setConnected();if(data?.type==='glimpselet:connection-failed'){connecting=false;connectionKey='expired';document.querySelector('#reconnect').hidden=false;render()}});
open.onclick=()=>window.postMessage({type:'glimpselet:open-bubble',locale:lang},location.origin);
document.querySelector('#reconnect').onclick=()=>{window.postMessage({type:'glimpselet:hello'},location.origin);connect()};
const download=document.querySelector('#download');if(download)download.href='/install/extension.zip?code='+encodeURIComponent(code);
const copy=document.querySelector('#copy-manager');if(copy)copy.onclick=async()=>{const input=document.querySelector('#manager');try{await navigator.clipboard.writeText(input.value)}catch{input.focus();input.select();document.querySelector('#manager-note').textContent=translations[lang].copyFailed}};
const reveal=document.querySelector('#reveal');if(reveal)reveal.onclick=async()=>{try{const result=await fetch('/install/reveal?code='+encodeURIComponent(code),{method:'POST'});if(!result.ok)throw new Error()}catch{document.querySelector('#folder-note').textContent=translations[lang].revealFailed}};
document.querySelector('#try-zero').onclick=async()=>{const button=document.querySelector('#try-zero');button.disabled=true;noteKey='trying';render();try{const result=await fetch('/install/try?'+new URLSearchParams({code,locale:lang}),{method:'POST'});if(!result.ok)throw new Error();noteKey='tried'}catch{noteKey='tryFailed'}finally{button.disabled=false;render()}};
async function poll(){try{const response=await fetch('/install/status?code='+encodeURIComponent(code));if(!response.ok){connectionKey='expired';render();return}const result=await response.json();if(result.connected)setConnected();if(result.mode==='tunnel'){const local=document.querySelector('#install-local'),remote=document.querySelector('#install-remote');if(local)local.hidden=true;if(remote)remote.hidden=false;document.querySelector('#try-zero').disabled=true;noteKey='remoteTry';render()}if(result.trialError){noteKey='tryFailed';render()}}catch{}setTimeout(poll,1200)}
render();window.postMessage({type:'glimpselet:hello'},location.origin);poll();
`;
