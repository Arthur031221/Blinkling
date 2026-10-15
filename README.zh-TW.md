<h1 align="center"><img src="assets/logo.svg" width="72" alt="" /><br /><picture><source media="(prefers-color-scheme: dark)" srcset="assets/wordmark-dark.svg" /><img src="assets/wordmark-light.svg" width="260" alt="Blinkling" /></picture></h1>

<p align="center"><strong>讓答案留在頁面旁邊。</strong></p>

<p align="center">
  <a href="https://github.com/Arthur031221/Glimpselet/actions/workflows/ci.yml"><img src="https://github.com/Arthur031221/Glimpselet/actions/workflows/ci.yml/badge.svg" alt="CI" /></a>
  <a href="https://github.com/Arthur031221/Glimpselet/releases"><img src="https://img.shields.io/github/v/release/Arthur031221/Glimpselet" alt="Release" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/github/license/Arthur031221/Glimpselet" alt="License" /></a>
</p>

[English](README.md) | [繁體中文](README.zh-TW.md) | [简体中文](README.zh-CN.md) | [日本語](README.ja.md) | [한국어](README.ko.md) | [Español](README.es.md) | [Français](README.fr.md) | [Deutsch](README.de.md) | [Português](README.pt-BR.md)

Formerly Glimpselet。從舊外掛升級？請執行 `/plugin uninstall glimpselet@glimpselet` 與 `/plugin marketplace remove glimpselet`，再照下方步驟安裝 Blinkling。

一個小巧的 Claude Code 浮動聊天視窗。詢問頁面、擷取區域、跟著導覽，或翻譯一段文字。

> [!TIP]
> 使用你已登入的 Claude Code 帳號，以及桌面版 Chrome 或 Edge。使用 Claude Code 不需要 API 金鑰。

![Google Flights：先看頁面導覽，再詢問如何預訂來回航班。](assets/demo.gif)

_Google Flights：先看頁面導覽，再詢問如何預訂來回航班。_

## 安裝

1. 在 Claude Code 中安裝外掛：

   ```text
   /plugin marketplace add Arthur031221/Glimpselet
   /plugin install blinkling@blinkling
   ```

2. 開啟歡迎指南：

   ```text
   /blinkling:blinkling
   ```

3. 在 `chrome://extensions`（或 `edge://extensions`）開啟**開發人員模式**。選擇 **Load unpacked**，再選取 **Show in Files / Finder** 開啟的資料夾。歡迎頁會自動連線，再點工具列上的 Blink 按鈕，確認已連線。

> [!NOTE]
> 瀏覽器小幫手是選用的：沒有它，Blink 在任何視窗都能用。若要用在 Chrome 或 Edge，請執行 `/blinkling:install`，再依步驟 3 載入 `~/Blinkling-extension`。[安裝與更新](docs/INSTALL.md)。

### 進階：從原始碼載入

<details>
<summary>從原始碼啟動與手動更新</summary>

從原始碼執行外掛需要 Node.js 22+ 與較新的 Claude Code。如果終端機已位於現有原始碼儲存庫的根目錄，請跳過前兩個指令。請在終端機執行以下指令：

```sh
git clone https://github.com/Arthur031221/Glimpselet.git
cd Blinkling
npm ci
npm run build:plugin
claude plugin validate .
node -p "require('./.claude-plugin/plugin.json').version"
node -p "require('./dist-extension/manifest.json').version"
claude --plugin-dir "$PWD" plugin list
claude --plugin-dir "$PWD" plugin details blinkling
node -p "require('./bin/extension/manifest.json').version"
claude --plugin-dir "$PWD"
```

兩個版本檢查指令都應顯示 `2.1.0`。外掛清單應顯示 `blinkling@inline` 的版本為 `2.1.0`，且已在此工作階段啟用。最後一個指令會開啟 Claude Code。在這個工作階段執行 `/blinkling:blinkling`，即可開啟歡迎指南。`--plugin-dir` 只在目前工作階段載入這份原始碼中的外掛。每次啟動都要加上這個選項。重新執行 `npm run build:plugin` 建置後，請重新啟動 Claude Code。建置好的擴充功能位於 `dist-extension`，歡迎指南會將它複製到下方的固定資料夾。

外掛詳情也應包含 `blinkling` 和 `install` 技能，以及 `blinkling` MCP 伺服器。封裝後的擴充功能位於 `bin/extension`，版本也應為 **2.1.0**。若 Claude Code 在遠端主機，請使用指南中的 SSH 指令，在瀏覽器所在電腦下載擴充功能 ZIP，並載入解壓縮後的資料夾。

如果瀏覽器和 Claude Code 在同一台電腦上執行，歡迎指南會把建置好的擴充功能複製到固定資料夾 `~/Blinkling-extension`。在 Chrome 或 Edge 開啟 `chrome://extensions` 或 `edge://extensions`，開啟 **Developer mode**，選擇 **Load unpacked**，再選取該資料夾。開發者提示會持續顯示。新版本需要手動更新。

更新未封裝擴充功能時，先關閉舊浮動視窗，再執行 `/blinkling:blinkling` 更新固定資料夾，然後在擴充功能頁面的卡片按「重新載入」。若 Claude Code 在遠端，請透過歡迎指南下載新版 ZIP，在瀏覽器所在電腦替換解壓縮後的檔案，再重新載入擴充功能。 改用 `~/Blinkling-extension` 時，請移除舊擴充功能卡片，再載入這個資料夾一次。

已安裝的外掛請執行以下指令，再在 Claude Code 執行 `/reload-plugins` 和 `/blinkling:blinkling`。確認外掛清單與擴充功能卡片均為 **2.1.0** 後，再重新開啟浮動視窗。

```sh
claude plugin marketplace update blinkling
claude plugin update blinkling@blinkling
claude plugin list
```

</details>

## 邊讀邊用

- **按住 Ctrl 並點一下**螢幕上的段落、按鈕或圖片：Blink 會取下它，向 Claude Code 提問。**按住 Ctrl 並拖曳**則改為取一個區域。
- 會跳出一個小輸入框，附三個快速提問，按 Enter 送出反白的那一個。隨時點 Blink 就能接續對話。
- 答案以氣泡呈現，並指向它所談論的東西。Blink 的選單有截圖、導覽、自動解說（預設關閉）與設定。
- 選用的 Chrome／Edge 瀏覽器小幫手會提供網頁本身的結構，讓 Blink 知道你指的是哪一段或哪個按鈕，另有整頁截圖、原地翻譯網頁與 PDF 閱讀器。工具列按鈕會顯示是否已連線，並可喚醒 Blink。沒有它，Blink 在每個視窗仍可使用。

## 快捷鍵

| 快捷鍵         | 操作             |
| -------------- | ---------------- |
| Ctrl + 點一下  | 詢問指標下的東西 |
| Ctrl + 拖曳    | 取一個區域       |
| 設定中的快捷鍵 | 開啟截圖覆蓋層   |

按鍵可在設定中更改。

## 對話與隱私

Blink 會把你選取的內容送給你自己已登入的 Claude Code，並把答案顯示在相關事物旁邊。請避免同時在終端機使用同一個對話。

> [!IMPORTANT]
> 瀏覽器小幫手只在你指向網頁時讀取該頁。密碼與付款欄位一律不讀取，且只與你電腦上的 Blinkling 通訊。自動解說在你開啟前保持關閉。

沒有遙測，也沒有發行者經營的回答服務。你選取的內容會送到你的 Claude Code；適用供應商條款與用量費用。瀏覽器設定、擴充功能商店與瀏覽器內建的 PDF 檢視器屬受保護頁面：在那裡 Blink 只依螢幕畫面回答。 [隱私](docs/SECURITY.md) | [使用說明](docs/USAGE.md) | [版本說明](docs/releases/v2.1.0.md)

Assisted by Claude/Codex.
