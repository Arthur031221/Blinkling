import { SPARKLE_CSS } from "./sparkle.js";
import { welcomeLocales } from "./welcome-locales.js";
import { cp, mkdir, readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
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
  file = process.env.BLINKLING_DISTRIBUTION_CONFIG ||
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

export const extensionFolder = () => join(homedir(), "Blinkling-extension");

export const extensionSourceFolder = () =>
  resolve(
    process.env.BLINKLING_EXTENSION_DIR ||
      `${dirname(resolve(process.argv[1] ?? process.cwd()))}/extension`,
  );

export async function installExtension(
  source: string,
  destination = extensionFolder(),
): Promise<string> {
  await readFile(join(source, "manifest.json"));
  await mkdir(destination, { recursive: true, mode: 0o700 });
  await cp(source, destination, { recursive: true, force: true });
  return destination;
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
  if (process.env.BLINKLING_DISABLE_BROWSER_OPEN === "1") return;
  const config = loadDistributionConfig();
  const storeUrl = selectedStoreUrl(
    config,
    process.env.BLINKLING_BROWSER === "msedge" ? "edge" : "chrome",
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
    run(process.env.BLINKLING_BROWSER || "google-chrome", [
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
    process.env.BLINKLING_BROWSER === "msedge" ? "edge" : "chrome",
  );
  const manager =
    process.env.BLINKLING_BROWSER === "msedge"
      ? "edge://extensions"
      : "chrome://extensions";
  const text = (key: keyof typeof welcomeLocales.en) =>
    `<span data-i18n="${key}"></span>`;
  const installation = store
    ? `<a class="button primary" href="${escapeHtml(store)}">${text("store")}</a>`
    : `<code class="path">${escapeHtml(folder)}</code><button class="button" id="reveal">${text("reveal")}</button><div class="manager"><label for="manager">${text("manager")}</label><div class="row"><input id="manager" class="manager-address" value="${manager}" readonly><button class="button" id="copy-manager">${text("copy")}</button></div><small>${text("paste")}</small></div><div class="install-images">${["01-extensions-before", "02-developer-mode", "03-select-extension-folder"].map((name, i) => `<figure><img src="/assets/install/${name}.png" alt="" loading="lazy"><figcaption>${i + 1}. ${text((["click1", "click2", "click3"] as const)[i]!)}</figcaption></figure>`).join("")}</div>`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Welcome to Blinkling</title>
<style>
:root{color-scheme:light dark;--paper:#faf7f0;--ink:#302a23;--muted:#766d62;--line:#e6ddd0;--card:#fffdf9;--accent:#bd6849}*{box-sizing:border-box}[hidden]{display:none!important}body{margin:0;background:var(--paper);color:var(--ink);font:16px/1.5 system-ui,sans-serif}main{max-width:850px;margin:auto;padding:30px 22px 45px}header{display:flex;align-items:center;gap:20px;margin-bottom:24px}.blink{width:82px;height:102px;object-fit:contain;animation:hello .5s ease-out}h1{font:clamp(27px,5vw,38px)/1.2 Georgia,serif;margin:0;flex:1}h2{font:23px/1.3 Georgia,serif;margin:0 0 16px}.number{display:inline-grid;place-items:center;width:30px;height:30px;margin-right:10px;border-radius:50%;background:#bd68491a;color:var(--accent);font:600 16px system-ui}section{margin:14px 0;padding:22px;border:1px solid var(--line);border-radius:18px;background:var(--card)}.button,select{border:1px solid var(--line);border-radius:999px;padding:10px 15px;background:var(--card);color:var(--ink);font:600 14px system-ui;cursor:pointer;text-decoration:none}.primary{background:var(--accent);color:#fff;border-color:var(--accent)}button:disabled{opacity:.45;cursor:default}button:hover:enabled,a.button:hover{filter:brightness(.96)}:focus-visible{outline:3px solid var(--accent);outline-offset:3px}.path{display:block;margin:0 0 12px;overflow-wrap:anywhere}.manager{margin-top:16px}.row{display:flex;gap:8px;align-items:center;flex-wrap:wrap}input{min-width:0;border:1px solid var(--line);border-radius:8px;padding:9px;background:var(--paper);color:var(--ink);font:14px system-ui}small,p{color:var(--muted)}small{font-size:13px}.install-images{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;margin:20px 0}figure{margin:0}figure img{width:100%;border:1px solid var(--line);border-radius:8px}figcaption{font-size:13px;margin-top:6px}#connection{margin:0}.connected{color:#397858!important;animation:hello .3s ease-out}#folder-note,#manager-note{margin-left:8px;font-size:14px}#reconnect{margin-top:10px}@keyframes hello{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}@media(max-width:600px){main{padding:18px 14px}header{gap:10px;flex-wrap:wrap}.blink{width:60px;height:75px}header select{margin-left:auto}section{padding:18px}.install-images{gap:8px}}@media(prefers-color-scheme:dark){:root{--sparkle-ink:#3ddc97;--paper:#24221f;--ink:#f4eee5;--muted:#b4a99b;--line:#4a4137;--card:#302d29}.connected{color:#b9e3c5!important}}@media(prefers-reduced-motion:reduce){*{animation:none!important}}
${SPARKLE_CSS}</style></head><body><main><header><img class="blink" src="/assets/logo.svg" alt="Blink"><h1 id="title"></h1><select id="language" aria-label="Language">${Object.entries(
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
<section id="installation"><h2><span class="number">1</span>${text("install")}</h2>${installation}<span id="folder-note" role="status"></span><span id="manager-note" role="status"></span></section>
<section id="connection-step"><h2><span class="number">2</span>${text("connect")}</h2><p id="connection" role="status" aria-live="polite"></p><button id="reconnect" class="button" hidden>${text("retry")}</button></section>
</main><script src="/install-guide.js"></script></body></html>`;
}

export const INSTALL_GUIDE_SCRIPT = `
const translations=${JSON.stringify(welcomeLocales)};
window.addEventListener('hashchange',()=>location.reload());
const code=new URLSearchParams(location.hash.slice(1)).get('code')||'';
const locales=Object.keys(translations),requested=new URLSearchParams(location.search).get('locale');
let lang=locales.includes(requested)?requested:locales.find(l=>l===navigator.language)||locales.find(l=>l===navigator.language.split('-')[0])||'en';
let completed=false,linkExpired=false,extensionReady=false,connecting=false,connectionKey='waiting';
const language=document.querySelector('#language'),status=document.querySelector('#connection');
function drawTitle(){const heading=document.querySelector('#title');heading.replaceChildren();translations[lang].title.split('Blinkling').forEach((part,index)=>{if(index){const name=document.createElement('span');name.className='sparkle-name';const word=document.createElement('span');word.className='sparkle-text';word.textContent='Blinkling';name.append(word);for(let star=0;star<3;star++){const mark=document.createElement('i');mark.className='sparkle-star';mark.setAttribute('aria-hidden','true');name.append(mark)}heading.append(name)}heading.append(part)})}
function render(){document.documentElement.lang=lang;document.title=translations[lang].title;drawTitle();language.value=lang;document.querySelectorAll('[data-i18n]').forEach(el=>el.textContent=translations[lang][el.dataset.i18n]);status.textContent=translations[lang][connectionKey];status.classList.toggle('connected',connectionKey==='connected')}
function setPaired(active=false){completed=true;connecting=false;connectionKey=active?'connected':'completed';document.querySelector('#reconnect').hidden=true;render()}
async function connect(){if(completed||linkExpired||connecting||!extensionReady||!/^[A-F0-9]{16}$/.test(code))return;connecting=true;connectionKey='waiting';render();try{const response=await fetch('/install/trust',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({code})});if(response.status===401){linkExpired=true;throw new Error()}if(!response.ok)throw new Error();const granted=await response.json();window.postMessage({type:'blinkling:trust',secret:granted.secret,port:granted.port},location.origin)}catch{connecting=false;connectionKey=linkExpired?(completed?'completed':'expired'):'connectionFailed';document.querySelector('#reconnect').hidden=completed||linkExpired;render()}}
language.onchange=()=>{lang=language.value;render()};
window.addEventListener('message',event=>{if(event.source!==window||event.origin!==location.origin)return;const data=event.data;if(data?.type==='blinkling:extension-ready'){extensionReady=true;void connect()}if(data?.type==='blinkling:trusted')setPaired();if(data?.type==='blinkling:trust-failed'){connecting=false;connectionKey='connectionFailed';document.querySelector('#reconnect').hidden=completed;render()}});
document.querySelector('#reconnect').onclick=()=>{window.postMessage({type:'blinkling:hello'},location.origin);void connect()};
const copy=document.querySelector('#copy-manager');if(copy)copy.onclick=async()=>{const input=document.querySelector('#manager');try{await navigator.clipboard.writeText(input.value)}catch{input.focus();input.select();document.querySelector('#manager-note').textContent=translations[lang].copyFailed}};
const reveal=document.querySelector('#reveal');if(reveal)reveal.onclick=async()=>{try{const result=await fetch('/install/reveal?code='+encodeURIComponent(code),{method:'POST'});if(!result.ok)throw new Error()}catch{document.querySelector('#folder-note').textContent=translations[lang].revealFailed}};
async function poll(){try{const response=await fetch('/install/status?code='+encodeURIComponent(code));if(response.status===401){linkExpired=true;connectionKey=completed?'completed':'expired';connecting=false;document.querySelector('#reconnect').hidden=true;render();return}if(!response.ok)throw new Error();const result=await response.json();if(result.connected)setPaired(true);else if(!connecting){connectionKey=completed?'completed':'waiting';render()}}catch{connectionKey='checkFailed';render()}setTimeout(poll,1200)}
render();window.postMessage({type:'blinkling:hello'},location.origin);poll();
`;
