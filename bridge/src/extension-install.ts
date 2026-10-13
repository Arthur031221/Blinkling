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

export const extensionFolder = () =>
  join(homedir(), ".glimpselet", "extension");

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
  const screenshots = `<div class="install-images"><figure><img src="/assets/install/01-extensions-before.png" alt="Chrome extensions page" loading="lazy"><figcaption data-en="1. Turn on Developer mode" data-zh="1. 啟用開發人員模式"></figcaption></figure><figure><img src="/assets/install/02-developer-mode.png" alt="Chrome Load unpacked button" loading="lazy"><figcaption data-en="2. Choose Load unpacked" data-zh="2. 按載入未封裝項目"></figcaption></figure><figure><img src="/assets/install/03-select-extension-folder.png" alt="Chrome extension folder picker" loading="lazy"><figcaption data-en="3. Select the extension folder" data-zh="3. 選擇擴充功能資料夾"></figcaption></figure></div>`;
  const installation = store
    ? `<div class="install-card" id="install-store"><p data-en="Install Glimpselet from the browser store. Confirm the browser prompt; updates arrive automatically." data-zh="從瀏覽器擴充功能商店安裝 Glimpselet，依提示確認即可，之後會自動更新。"></p><a class="button primary" href="${escapeHtml(store)}" data-en="Add to browser" data-zh="加入瀏覽器"></a><details><summary data-en="Advanced: load from source" data-zh="進階：從原始碼載入"></summary><p data-en="Build the source on the computer with your browser using npm ci and npm run build:extension. Choose Load unpacked and select dist-extension." data-zh="請在瀏覽器所在電腦執行 npm ci 與 npm run build:extension 建置原始碼。接著按「載入未封裝項目」，選擇 dist-extension 資料夾。"></p></details></div>`
    : `<div class="install-card" id="install-local" hidden><p data-en="Open your browser's extensions page. Turn on Developer mode, choose Load unpacked, then select this folder:" data-zh="開啟瀏覽器的擴充功能頁面，啟用「開發人員模式」，按「載入未封裝項目」，再選擇這個資料夾："></p><a class="button primary" href="chrome://extensions" data-en="Open extensions" data-zh="開啟擴充功能"></a><code class="path">${escapeHtml(folder)}</code><p class="quiet" data-en="The browser asks you to confirm these steps. Updates are manual until the store listing is live." data-zh="瀏覽器會請你手動確認這些步驟。正式上架前需要手動更新。"></p></div><div class="install-card" id="install-remote" hidden><p data-en="Download the extension ZIP on the computer where Chrome runs. Extract it on this computer, open chrome://extensions, turn on Developer mode, choose Load unpacked, and select the extracted folder." data-zh="請在執行 Chrome 的這台電腦下載擴充功能 ZIP，並在這台電腦解壓縮。接著開啟 chrome://extensions、啟用「開發人員模式」、按「載入未封裝項目」，再選擇解壓縮後的資料夾。"></p><a class="button primary" href="/install/extension.zip" data-en="Download extension ZIP" data-zh="下載擴充功能 ZIP"></a></div>${screenshots}`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Welcome to Glimpselet</title>
<style>
:root{color-scheme:light dark;--paper:#faf7f0;--ink:#302a23;--muted:#766d62;--line:#e6ddd0;--card:#fffdf9;--accent:#bd6849;--accent-dark:#91472f;--green:#397858}*{box-sizing:border-box}body{margin:0;background:var(--paper);color:var(--ink);font:16px/1.55 Inter,system-ui,sans-serif}main{max-width:900px;margin:auto;padding:30px 22px 70px}header{display:flex;align-items:center;gap:16px;margin:14px 0 28px}.blink{width:64px;height:64px;flex:none;display:grid;place-items:center;border:2px solid var(--ink);border-radius:48% 52% 50% 45%;background:#f3dfc4;overflow:hidden;transform:rotate(-5deg)}.blink img{width:46px;height:56px;object-fit:contain;transform:rotate(5deg)}h1,h2,h3{font-family:Georgia,serif;line-height:1.15}h1{font-size:clamp(32px,6vw,48px);margin:0 0 6px}h2{font-size:26px;margin:0 0 10px}h3{font-size:21px;margin:0}.lede{color:var(--muted);margin:0}.top{display:flex;justify-content:space-between;align-items:center;gap:12px}.lang,.button{border:1px solid #c7b8a5;border-radius:999px;padding:9px 14px;background:var(--card);color:var(--ink);text-decoration:none;font:600 14px system-ui;cursor:pointer}.button.primary{background:var(--accent);color:white;border-color:var(--accent)}button:hover,.button:hover{filter:brightness(.96)}section{margin:18px 0;padding:22px;border:1px solid var(--line);border-radius:20px;background:var(--card);box-shadow:0 8px 25px #392b1910}.install-card{padding:16px;border-radius:14px;background:#f6efe4}.path{display:block;width:min(100%,680px);padding:11px;margin:14px 0;background:#eee5d8;border-radius:9px;overflow-wrap:anywhere}.path:focus{outline:3px solid var(--accent);outline-offset:2px}.quiet,.muted{color:var(--muted)}.pairline{display:flex;flex-wrap:wrap;gap:9px;align-items:center}.status{padding:12px 14px;border-radius:12px;background:#f5efe6}.status.connected{background:#e8f3ea;color:#285e3e}.progress{height:9px;border-radius:9px;background:#eee6da;overflow:hidden;margin:14px 0 18px}.progress span{display:block;height:100%;width:0;background:var(--accent);transition:width .25s}.steps{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.step{border:1px solid var(--line);border-radius:15px;padding:15px;background:var(--card);min-width:0}.step.done{border-color:#83b295;background:#f4faf4}.step-head{display:flex;align-items:center;gap:10px}.number{display:grid;place-items:center;width:29px;height:29px;border-radius:50%;background:#f0e5d5;color:var(--accent-dark);font-weight:700}.step p{min-height:48px;color:var(--muted);margin:8px 0}.actions{display:flex;gap:7px;flex-wrap:wrap}.actions button{padding:7px 11px}.illustration{height:86px;margin:12px 0;padding:9px;border:1px solid #e4d9ca;border-radius:10px;background:linear-gradient(#f2e9dc 0 20px,#fff 20px);position:relative;overflow:hidden}.browserbar{position:absolute;top:6px;left:10px;right:10px;height:8px;border-radius:5px;background:#dbcbb8}.mockline{position:absolute;left:14px;top:34px;width:55%;height:6px;border-radius:4px;background:#e9e2d9}.mockline.two{top:49px;width:72%}.mockline.three{top:64px;width:42%}.mockfocus{position:absolute;right:10px;top:30px;padding:7px 9px;border:2px solid var(--accent);border-radius:8px;background:#fff8eb;color:var(--accent-dark);font-size:11px;animation:pulse 1.8s infinite}@keyframes pulse{50%{box-shadow:0 0 0 5px #bd684920}}.tutorial-note{font-size:14px;color:var(--muted)}details{margin-top:12px}summary{cursor:pointer}a{color:var(--accent-dark)}@media(max-width:650px){main{padding:18px 14px 48px}.steps{grid-template-columns:1fr}section{padding:17px}.top{align-items:flex-start}}
@media(prefers-color-scheme:dark){:root{--paper:#24221f;--ink:#f4eee5;--muted:#b4a99b;--line:#4a4137;--card:#302d29}.blink{background:#5c4938}.install-card,.status{background:#3a342d}.path{background:#24221f}.step.done{background:#28342b}.number{background:#493a2e}.illustration{background:linear-gradient(#51463a 0 20px,#393632 20px);border-color:#625648}.browserbar{background:#746453}.mockline{background:#61584e}.mockfocus{background:#362f28;color:#f2b89d}.status.connected{background:#293b2d;color:#b9e3c5}}
.install-images{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;margin-top:18px}.install-images figure{margin:0}.install-images img{width:100%;border:1px solid #c9bfaf;border-radius:8px}.install-images figcaption{font-size:13px;margin-top:8px}@media(max-width:600px){.install-images{grid-template-columns:1fr}}
</style></head><body><main><div class="top"><header><div class="blink" aria-hidden="true"><img src="/assets/logo.svg" alt=""></div><div><h1 data-en="Glimpselet is ready when you are." data-zh="Glimpselet 已準備好陪你探索。"></h1><p class="lede" data-en="A small, hands-on tour. Try each move, mark it done, or skip ahead." data-zh="用幾個小步驟認識 Glimpselet。試過就勾選完成，也可以略過。"></p></div></header><button class="lang" id="language" type="button" aria-label="Switch language">繁體中文</button></div>
<section><h2 data-en="1 · Add Glimpselet" data-zh="1 · 安裝 Glimpselet"></h2>${installation}</section>
<section id="pairing"><h2 data-en="2 · Connect your browser" data-zh="2 · 連接瀏覽器"></h2><p id="pair" class="pairline" aria-live="polite"></p><div class="pairline" id="pair-controls"><button class="button" id="copy" hidden data-en="Copy code" data-zh="複製配對碼"></button><button class="button" id="connect" hidden data-en="Pair extension" data-zh="配對擴充功能"></button></div><p class="status" id="connection" aria-live="polite" data-en="Waiting for Glimpselet. Click Pair extension in the browser window to approve the connection." data-zh="等待 Glimpselet 連線。請在瀏覽器視窗按「配對擴充功能」以確認連線。"></p><p id="mode" class="quiet" aria-live="polite"></p><div id="tunnel" hidden><label for="tunnel-command" data-en="Run this on the computer with your browser:" data-zh="請在瀏覽器所在電腦執行："></label><div class="pairline"><input id="tunnel-command" class="path" readonly aria-label="SSH tunnel command"><button id="copy-tunnel" class="button" type="button" data-en="Copy SSH command" data-zh="複製 SSH 指令"></button></div></div><div class="pairline"><button class="button" id="try-zero" type="button" data-en="Try without installing" data-zh="不安裝，先試用"></button><span id="try-note" class="quiet" role="status"></span></div></section>
<section id="tour"><div class="top"><div><h2 data-en="3 · Take the tour" data-zh="3 · 動手試一圈"></h2><p class="tutorial-note" data-en="The sample page is a safe place to practise. Each Try button opens it and sends a small action request to the page." data-zh="範例頁是安全的練習場。按「試試」會開啟範例頁，並傳送對應的操作提示。"></p></div><button id="replay" class="button" type="button" data-en="Replay tour" data-zh="重播導覽"></button></div><div class="progress" role="progressbar" aria-label="Tour progress" aria-valuemin="0" aria-valuemax="8" aria-valuenow="0"><span id="progress"></span></div><p id="progress-label" class="quiet" aria-live="polite"></p><div id="steps" class="steps"></div><p class="tutorial-note" data-en="The PDF practice action opens the bundled reader from the bubble. You can also open a local PDF there." data-zh="PDF 練習會從浮動視窗開啟內建閱讀器。你也可以在閱讀器選擇本機 PDF。"></p></section>
<p><a href="https://github.com/Arthur031221/Glimpselet/blob/main/docs/INSTALL.md" data-en="Install help" data-zh="安裝說明"></a> · <a href="https://arthur031221.github.io/Glimpselet/privacy.html" data-en="Privacy" data-zh="隱私權"></a></p></main><script src="/install-guide.js"></script></body></html>`;
}

export const INSTALL_GUIDE_SCRIPT = `(()=>{
const strings={en:{waiting:'Waiting for Glimpselet. Click Pair extension in the browser window to approve the connection.',connected:'Connected. Choose a practice step below.',copy:'Copied.',copyFail:'Select and copy the code above.',copyTunnelFail:'Select and copy the SSH command above.',try:'Opening your practice window…',tryStarted:'Chromium launch requested. If its Glimpselet window opens, click Pair extension; this page will confirm when connected.',pairing:'Pairing request sent. Waiting for you to approve the connection in Glimpselet…',extensionReady:'Glimpselet is ready. Click Pair extension to approve the connection.',remote:'Zero-install mode is not available on a remote host. Use the SSH command below on the computer with your browser.',tryFail:'Could not open the practice browser. Check the error above or install the extension in your browser.',step:'Completed',of:'of',done:'Done',skip:'Skipped',request:'Requested in the sample page. Use the Glimpselet bubble to complete this step.',
titles:['Float and switch windows','Capture a page and ask','Try a suggestion','Turn on passive mode','Take a page tour','Translate the page','Select text and ask','Read a PDF'],
descs:['Open the floating bubble, then switch to another window and see it stay on top.','Capture the tea page and ask what changes the taste.','Choose a suggested question and send it with one click.','Turn on passive mode, then change the sample page or open another page.','Start Guide and watch it point out the tea buttons.','Translate the page in place, then switch back to the original.','Select a sentence and choose Explain, Translate, or Ask.','Open the sample PDF in the Glimpselet reader and try selecting a paragraph.'],
focus:['Float','Capture','Suggested question','Passive','Guide','Translate','Select a sentence','Open PDF'],tries:['Open sample + request float','Open sample + request capture','Open sample + request suggestion','Open sample + request passive','Open sample + request guide','Open sample + request translation','Open sample + request selection','Open sample PDF'],
labels:['Developer mode','Load unpacked','Select the folder'],
},zh:{waiting:'等待 Glimpselet 連線。請在瀏覽器視窗按「配對擴充功能」以確認連線。',connected:'已連線，請選擇下方的練習步驟。',copy:'已複製。',copyFail:'請選取上方配對碼並複製。',copyTunnelFail:'請選取上方 SSH 指令並複製。',try:'正在開啟練習視窗⋯',tryStarted:'已要求啟動 Chromium。若 Glimpselet 視窗開啟，請按「配對擴充功能」；連線後本頁會顯示確認。',pairing:'已送出配對要求，請在 Glimpselet 中確認連線⋯',extensionReady:'Glimpselet 已就緒，請按「配對擴充功能」確認連線。',remote:'遠端主機無法使用免安裝模式。請在瀏覽器所在電腦執行下方 SSH 指令。',tryFail:'無法開啟練習瀏覽器。請檢查上方錯誤，或改在自己的瀏覽器安裝擴充功能。',step:'已完成',of:'/',done:'已完成',skip:'已略過',request:'操作提示已傳到範例頁，請在 Glimpselet 浮動視窗完成這一步。',
titles:['浮動視窗與切換視窗','擷取頁面並提問','試試建議問題','開啟被動模式','導覽頁面','翻譯整頁','選取文字並提問','閱讀 PDF'],
descs:['開啟浮動視窗，再切到另一個視窗，看看它是否仍在最上層。','擷取茶葉範例頁，問問哪些因素會改變茶的風味。','按一下建議問題，直接送出。','開啟被動模式，再切換範例頁或開啟另一個頁面。','啟動導覽，看看它如何指出茶葉按鈕。','就地翻譯頁面，再切回原文。','選取一句文字，再按「解釋」、「翻譯」或「提問」。','在 Glimpselet 閱讀器開啟範例 PDF，試著選取一段文字。'],
focus:['浮動','擷取','建議問題','被動模式','導覽','翻譯','選取句子','開啟 PDF'],tries:['開啟範例並提示浮動','開啟範例並提示擷取','開啟範例並提示建議問題','開啟範例並提示被動模式','開啟範例並提示導覽','開啟範例並提示翻譯','開啟範例並提示選取文字','開啟 PDF 範例'],labels:['開發人員模式','載入未封裝項目','選擇資料夾']}};
const steps=[['float','float'],['capture','capture'],['suggest','suggest'],['passive','passive'],['guide','guide'],['translate','translate'],['selection','selection'],['pdf','pdf']];
const stateKey='glimpselet-install-tour-v1', getState=()=>{try{return JSON.parse(localStorage.getItem(stateKey)||'{}')}catch{return{}}};let state=getState(), lang='en', sample, isConnected=false, remoteMode=false, modeKind='';
const code=new URLSearchParams(location.hash.slice(1)).get('code'), port=Number(location.port||80), status=document.querySelector('#connection');
const applyLanguage=()=>{document.documentElement.lang=lang==='zh'?'zh-Hant':'en';document.querySelectorAll('[data-en][data-zh]').forEach(el=>{el.textContent=el.dataset[lang]});document.querySelector('#language').textContent=lang==='en'?'繁體中文':'English';document.querySelector('#language').setAttribute('aria-label',lang==='en'?'切換為繁體中文':'Switch to English');renderPair();if(isConnected)status.textContent=strings[lang].connected;if(modeKind)document.querySelector('#mode').textContent=modeKind==='tunnel'?(lang==='en'?'Claude Code is on another computer.':'Claude Code 位於另一台電腦。'):modeKind==='api'?(lang==='en'?'Using direct API mode.':'使用直接 API 模式。'):(lang==='en'?'Claude Code is on this computer.':'Claude Code 位於這台電腦。');if(remoteMode)document.querySelector('#try-note').textContent=strings[lang].remote;render()};
function render(){const t=strings[lang], host=document.querySelector('#steps');host.replaceChildren();steps.forEach(([action],i)=>{const card=document.createElement('article');card.className='step'+(state[i]?' done':'');card.innerHTML='<div class="step-head"><span class="number">'+(state[i]?'✓':i+1)+'</span><h3></h3></div><p></p><div class="illustration" aria-hidden="true"><span class="browserbar"></span><span class="mockline"></span><span class="mockline two"></span><span class="mockline three"></span><span class="mockfocus"></span></div><div class="actions"><button class="button primary try"></button><button class="button done"></button><button class="button skip"></button></div>';card.querySelector('h3').textContent=t.titles[i];card.querySelector('p').textContent=t.descs[i];card.querySelector('.mockfocus').textContent=t.focus[i];card.querySelector('.try').textContent=t.tries[i];card.querySelector('.done').textContent=state[i]?t.done:(lang==='en'?'Done':'完成');card.querySelector('.skip').textContent=state[i]?'':(lang==='en'?'Skip':'略過');card.querySelector('.skip').hidden=!!state[i];card.querySelector('.try').onclick=()=>tryStep(i,action);card.querySelector('.done').onclick=()=>mark(i);card.querySelector('.skip').onclick=()=>mark(i);host.append(card)});const count=Object.values(state).filter(Boolean).length;document.querySelector('#progress').style.width=(count/8*100)+'%';document.querySelector('.progress').setAttribute('aria-valuenow',String(count));document.querySelector('#progress-label').textContent=t.step+' '+count+' '+t.of+' 8';}
function mark(i){state[i]=true;localStorage.setItem(stateKey,JSON.stringify(state));render()}
let pendingPractice;
const deliveredSteps = new Set();
function clearPractice() {
  if (!pendingPractice) return;
  clearTimeout(pendingPractice.probe);
  clearTimeout(pendingPractice.timeout);
  pendingPractice = undefined;
}
function practiceFailure() {
  clearPractice();
  document.querySelector('#try-note').textContent = lang === 'en'
    ? 'Could not deliver the practice action. Close the sample tab and try again.'
    : '無法傳送練習操作。請關閉範例分頁，再試一次。';
}
function probePractice() {
  if (!pendingPractice || pendingPractice.sent) return;
  if (!sample || sample.closed) { practiceFailure(); return; }
  try {
    sample.postMessage({
      type: 'glimpselet:tutorial:ping', version: 1,
      requestId: pendingPractice.request.requestId,
    }, location.origin);
  } catch { practiceFailure(); return; }
  pendingPractice.probe = setTimeout(probePractice, 100);
}
function tryStep(i, action) {
  clearPractice();
  const base = new URL('/assets/glimpselet-welcome-sample.html', location.origin).href;
  let restore = !sample || sample.closed, target = 'glimpselet-sample';
  if (!restore) {
    try { restore = sample.location.href !== base; }
    catch { restore = true; target = '_blank'; }
  }
  if (restore) deliveredSteps.clear();
  pendingPractice = {
    request: {
      type: 'glimpselet:tutorial-action', version: 1,
      requestId: crypto.randomUUID(), action, step: i + 1, code: code || null,
    },
    sent: false,
  };
  try { if (restore) sample = window.open(base, target); }
  catch { practiceFailure(); return; }
  if (!sample) {
    clearPractice();
    document.querySelector('#try-note').textContent = lang === 'en'
      ? 'Allow pop-ups for this local page, then try again.'
      : '請允許此本機頁面開啟彈出視窗，再重試。';
    return;
  }
  document.querySelector('#try-note').textContent = lang === 'en'
    ? 'Opening the sample page. Waiting for the practice action…'
    : '正在開啟範例頁，等待傳送練習操作⋯';
  pendingPractice.timeout = setTimeout(practiceFailure, 6000);
  probePractice();
  sample.focus();
}
const pair=document.querySelector('#pair'), copy=document.querySelector('#copy'), connect=document.querySelector('#connect');function renderPair(){if(/^[A-F0-9]{16}$/.test(code||'')){pair.textContent=(lang==='en'?'Pairing code: ':'配對碼：')+code+' · '+(lang==='en'?'Port: ':'連接埠：')+port;copy.hidden=false;connect.hidden=false}else pair.textContent=lang==='en'?'Open Glimpselet from Claude Code to receive a pairing code.':'請從 Claude Code 開啟 Glimpselet 取得配對碼。'}renderPair();if(/^[A-F0-9]{16}$/.test(code||'')){copy.onclick=async()=>{try{await navigator.clipboard.writeText(port+' '+code);document.querySelector('#try-note').textContent=strings[lang].copy}catch{document.querySelector('#try-note').textContent=strings[lang].copyFail}};connect.onclick=()=>{document.querySelector('#connection').textContent=strings[lang].pairing;window.postMessage({type:'glimpselet:pair',port,code},location.origin)}}
document.querySelector('#language').onclick=()=>{lang=lang==='en'?'zh':'en';applyLanguage()};document.querySelector('#replay').onclick=()=>{clearPractice();deliveredSteps.clear();state={};localStorage.removeItem(stateKey);render();document.querySelector('#tour').scrollIntoView({behavior:'smooth'})};
document.querySelector('#copy-tunnel').onclick=async()=>{const input=document.querySelector('#tunnel-command');try{await navigator.clipboard.writeText(input.value);document.querySelector('#try-note').textContent=strings[lang].copy}catch{input.focus();input.select();document.querySelector('#try-note').textContent=strings[lang].copyTunnelFail}};
document.querySelector('#try-zero').onclick=async()=>{const button=document.querySelector('#try-zero'),note=document.querySelector('#try-note');button.disabled=true;note.textContent=strings[lang].try;try{const response=await fetch('/install/try?code='+encodeURIComponent(code||''),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({}),cache:'no-store'});const data=await response.json().catch(()=>({}));if(response.status===409||data.mode==='tunnel'){remoteMode=true;button.hidden=true;note.textContent=strings[lang].remote;return}if(!response.ok)throw new Error('launch');note.textContent=strings[lang].tryStarted}catch{note.textContent=strings[lang].tryFail}finally{button.disabled=false}};
function setInstallMode(){const local=document.querySelector('#install-local'),remote=document.querySelector('#install-remote');if(!local||!remote)return;const isRemote=modeKind==='tunnel';local.hidden=isRemote;remote.hidden=!isRemote}
function setConnected(){if(isConnected)return;isConnected=true;status.classList.add('connected');status.textContent=strings[lang].connected;document.querySelector('#pair-controls').hidden=true;pair.hidden=true;document.querySelector('#copy').hidden=true;document.querySelector('#connect').hidden=true}
async function poll(){if(!/^[A-F0-9]{16}$/.test(code||''))return;try{const response=await fetch('/install/status?code='+encodeURIComponent(code),{cache:'no-store'});if(response.ok){const result=await response.json();const download=document.querySelector('#install-remote a');if(download)download.href='/install/extension.zip?code='+encodeURIComponent(code);if(typeof result.mode==='string'){const nextKind=result.mode==='tunnel'?'tunnel':result.mode==='api'?'api':'direct';if(nextKind!==modeKind){modeKind=nextKind;setInstallMode();applyLanguage()}}if(typeof result.tunnelCommand==='string'&&/^ssh -N(?: -p [0-9]{1,5})? -L /.test(result.tunnelCommand)&&!/[\\r\\n]/.test(result.tunnelCommand)){document.querySelector('#tunnel').hidden=false;document.querySelector('#tunnel-command').value=result.tunnelCommand}if(modeKind==='tunnel'){remoteMode=true;document.querySelector('#try-zero').disabled=true;document.querySelector('#try-zero').hidden=true;document.querySelector('#try-note').textContent=strings[lang].remote}if(result.trialError===true)document.querySelector('#try-note').textContent=strings[lang].tryFail;if(result.connected===true){setConnected();setTimeout(()=>{document.querySelector('#tour').scrollIntoView({behavior:'smooth'})},650);return}}}catch{}setTimeout(poll,1200)}
window.addEventListener('message',event=>{
  if(event.origin!==location.origin||(event.source!==window&&event.source!==sample))return;
  const value=event.data;
  if(event.source===sample&&value?.version===1){
    const request=pendingPractice?.request;
    if (request && value.requestId === request.requestId) {
      if (value.type === 'glimpselet:tutorial:ready' && !pendingPractice.sent) {
        pendingPractice.sent = true;
        clearTimeout(pendingPractice.probe);
        sample.postMessage(request, location.origin);
      }
      if (value.type === 'glimpselet:tutorial:ack' && pendingPractice.sent
          && value.action === request.action && value.step === request.step) {
        deliveredSteps.add(request.step);
        clearPractice();
        document.querySelector('#try-note').textContent = strings[lang].request;
      }
    }
    if(value.type==='glimpselet:tutorial:done'&&Number.isInteger(value.step)&&deliveredSteps.has(value.step))mark(value.step-1);
  }
  if(value?.type==='glimpselet:paired'&&event.source===window)setConnected();if(value?.type==='glimpselet:extension-ready'&&event.source===window&&!isConnected&&/^[A-F0-9]{16}$/.test(code||''))document.querySelector('#try-note').textContent=strings[lang].extensionReady
});
applyLanguage();poll();if(location.hash==='#tour')document.querySelector('#tour').scrollIntoView();})();`;
