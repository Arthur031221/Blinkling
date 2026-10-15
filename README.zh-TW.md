<h1 align="center"><img src="assets/logo.svg" width="72" alt="" /><br /><picture><source media="(prefers-color-scheme: dark)" srcset="assets/wordmark-dark.svg" /><img src="assets/wordmark-light.svg" width="260" alt="Blinkling" /></picture></h1>

<p align="center"><strong>讓答案留在頁面旁邊。</strong></p>

<p align="center">
  <a href="https://github.com/Arthur031221/Glimpselet/actions/workflows/ci.yml"><img src="https://github.com/Arthur031221/Glimpselet/actions/workflows/ci.yml/badge.svg" alt="CI" /></a>
  <a href="https://github.com/Arthur031221/Glimpselet/releases"><img src="https://img.shields.io/github/v/release/Arthur031221/Glimpselet" alt="Release" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/github/license/Arthur031221/Glimpselet" alt="License" /></a>
</p>

[English](README.md) | [繁體中文](README.zh-TW.md) | [简体中文](README.zh-CN.md) | [日本語](README.ja.md) | [한국어](README.ko.md) | [Español](README.es.md) | [Français](README.fr.md) | [Deutsch](README.de.md) | [Português](README.pt-BR.md)

Formerly Glimpselet。從舊外掛升級？請執行 `/plugin uninstall glimpselet@glimpselet` 與 `/plugin marketplace remove glimpselet`，再照下方步驟安裝 Blinkling。

Blink 是螢幕角落的小夥伴。按住 Ctrl 並點一下任何東西，就能向 Claude Code 詢問。

> [!TIP]
> Blink 使用你已在同一台電腦登入的 Claude Code。

## 安裝

1. 在 Claude Code 中安裝外掛：

   ```text
   /plugin marketplace add Arthur031221/Glimpselet
   /plugin install blinkling@blinkling
   ```

2. 喚醒 Blink。第一次會出現三步驟的歡迎畫面：

   ```text
   /blinkling:blinkling
   ```

3. 選用，用於頁面結構、整頁擷取、原地翻譯與 PDF 閱讀器：執行 `/blinkling:install`，在 `chrome://extensions`（或 `edge://extensions`）開啟**開發人員模式**，選擇 **Load unpacked**，再選取 `~/Blinkling-extension`。

> [!NOTE]
> 輔助擴充功能是選用的，沒有它 Blink 也能運作。[安裝與更新](docs/INSTALL.md)。

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

兩個版本檢查指令都應顯示 `2.1.0`，外掛清單應顯示 `blinkling@inline` 的版本為 `2.1.0`，且已在此工作階段啟用。在最後一個指令開啟的 Claude Code 工作階段執行 `/blinkling:blinkling`。`--plugin-dir` 只在目前工作階段載入這份原始碼中的外掛。每次從原始碼啟動 Claude Code 都要加上這個選項，重新建置後請重新啟動該工作階段。建置好的擴充功能位於專案內的 `dist-extension`。

外掛詳情也應包含 `blinkling` 和 `install` 技能，以及 `blinkling` MCP 伺服器。封裝後的擴充功能位於 `bin/extension`，版本也應為 **2.1.0**。

瀏覽器輔助擴充功能是選用的。執行 `/blinkling:install`，會把建置好的擴充功能複製到固定資料夾 `~/Blinkling-extension`。在 Chrome 或 Edge 開啟 `chrome://extensions` 或 `edge://extensions`，開啟 **Developer mode**，選擇 **Load unpacked**，再選取該資料夾。開發者提示會持續顯示，新版本需要手動更新。

更新未封裝擴充功能後，請再執行一次 `/blinkling:install` 更新固定資料夾，然後在擴充功能頁面的卡片按「重新載入」。改用 `~/Blinkling-extension` 時，請移除舊擴充功能卡片，再載入這個資料夾一次。

已安裝的外掛請執行以下指令，再在 Claude Code 執行 `/reload-plugins` 和 `/blinkling:blinkling`。確認外掛清單與擴充功能卡片均為 **2.1.0**。

```sh
claude plugin marketplace update blinkling
claude plugin update blinkling@blinkling
claude plugin list
```

</details>

## 邊讀邊用

- **詢問指標下的東西。**按住 Ctrl 點一下，或拖曳框選區域。它會飛進 Blink，並打開迷你輸入框，按 Enter 送出。
- **和 Blink 說話。**點 Blink 即可在迷你輸入框接續上一段對話。訊息較長或按 Shift+Enter 會展開完整輸入框。
- **用氣泡回答。**氣泡會指向它所談論的東西。在 Blink 上滾動滾輪可回看先前的氣泡。
- **選單。**滑過 Blink 即可展開：截圖、導覽、自動解說與設定。導覽會在頁面上標出步驟編號，並可存成 Markdown。自動解說預設關閉，最多出現兩個氣泡，也不會畫標記。
- **瀏覽器輔助擴充功能（選用）。**工具列彈出視窗會顯示連線狀態，並有 **Wake Blink** 按鈕。它讓 Blink 讀取頁面結構、擷取整頁長圖、原地翻譯頁面，並用閱讀器開啟 PDF。

截圖也有全域快捷鍵 Ctrl+Shift+S（macOS 為 Cmd），可在設定中更改。

## 隱私

Blink 詢問你在這台電腦登入的 Claude Code，你開口之前不會擷取任何內容。沒有遙測，也沒有發行者營運的回答服務。你選擇的內容與擷取畫面會交給 Claude Code 及其供應商，供應商條款與用量費用適用。輔助擴充功能只與 `127.0.0.1` 上的橋接器通訊，絕不讀取密碼欄位或輸入值。自動解說在你開啟前保持關閉。

[隱私詳情](docs/SECURITY.md) | [使用方式](docs/USAGE.md) | [功能一覽](docs/FEATURES.md) | [版本說明](docs/releases/v2.1.0.md)

Assisted by Claude/Codex.
