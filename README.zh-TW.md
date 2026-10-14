<h1 align="center"><img src="assets/logo.svg" width="72" alt="" /><br />Glimpselet</h1>

<p align="center"><strong>讓答案留在頁面旁邊。</strong></p>

<p align="center">
  <a href="https://github.com/Arthur031221/Glimpselet/actions/workflows/ci.yml"><img src="https://github.com/Arthur031221/Glimpselet/actions/workflows/ci.yml/badge.svg" alt="CI" /></a>
  <a href="https://github.com/Arthur031221/Glimpselet/releases"><img src="https://img.shields.io/github/v/release/Arthur031221/Glimpselet" alt="Release" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/github/license/Arthur031221/Glimpselet" alt="License" /></a>
</p>

[English](README.md) | [繁體中文](README.zh-TW.md) | [简体中文](README.zh-CN.md) | [日本語](README.ja.md) | [한국어](README.ko.md) | [Español](README.es.md) | [Français](README.fr.md) | [Deutsch](README.de.md) | [Português](README.pt-BR.md)

一個小巧的 Claude Code 浮動聊天視窗。詢問頁面、擷取區域、跟著導覽，或翻譯一段文字。

> [!TIP]
> 使用你已登入的 Claude Code 帳號，以及桌面版 Chrome 或 Edge。使用 Claude Code 不需要 API 金鑰。

![Google Flights：先看頁面導覽，再詢問如何預訂來回航班。](assets/demo.gif)

_Google Flights：先看頁面導覽，再詢問如何預訂來回航班。_

## 安裝

1. 在 Claude Code 中安裝外掛：

   ```text
   /plugin marketplace add Arthur031221/Glimpselet
   /plugin install glimpselet@glimpselet
   ```

2. 開啟歡迎指南：

   ```text
   /glimpselet:glimpse
   ```

3. 在 `chrome://extensions`（或 `edge://extensions`）開啟**開發人員模式**。選擇 **Load unpacked**，再選取 **Show in Files / Finder** 開啟的資料夾。歡迎頁會自動連線，再開啟浮動視窗。

> [!NOTE]
> 本機可用 **Try without installing** 開啟獨立 Chromium 設定檔。遠端主機請在瀏覽器所在電腦執行顯示的 SSH 指令。[安裝與更新](docs/INSTALL.md)。

### 進階：從原始碼載入

<details>
<summary>從原始碼啟動與手動更新</summary>

從原始碼執行外掛需要 Node.js 22+ 與較新的 Claude Code。如果終端機已位於現有原始碼儲存庫的根目錄，請跳過前兩個指令。請在終端機執行以下指令：

```sh
git clone https://github.com/Arthur031221/Glimpselet.git
cd Glimpselet
npm ci
npm run build:plugin
claude plugin validate .
node -p "require('./.claude-plugin/plugin.json').version"
node -p "require('./dist-extension/manifest.json').version"
claude --plugin-dir "$PWD" plugin list
claude --plugin-dir "$PWD" plugin details glimpselet
node -p "require('./bin/extension/manifest.json').version"
claude --plugin-dir "$PWD"
```

兩個版本檢查指令都應顯示 `2.1.0`。外掛清單應顯示 `glimpselet@inline` 的版本為 `2.1.0`，且已在此工作階段啟用。最後一個指令會開啟 Claude Code。在這個工作階段執行 `/glimpselet:glimpse`，即可開啟歡迎指南。`--plugin-dir` 只在目前工作階段載入這份原始碼中的外掛。每次啟動都要加上這個選項。重新執行 `npm run build:plugin` 建置後，請重新啟動 Claude Code。建置好的擴充功能位於 `dist-extension`，歡迎指南會將它複製到下方的固定資料夾。

外掛詳情也應包含 `glimpse` 和 `install` 技能，以及 `glimpselet` MCP 伺服器。封裝後的擴充功能位於 `bin/extension`，版本也應為 **2.1.0**。若 Claude Code 在遠端主機，請使用指南中的 SSH 指令，在瀏覽器所在電腦下載擴充功能 ZIP，並載入解壓縮後的資料夾。

如果瀏覽器和 Claude Code 在同一台電腦上執行，歡迎指南會把建置好的擴充功能複製到固定資料夾 `~/Glimpselet-extension`。在 Chrome 或 Edge 開啟 `chrome://extensions` 或 `edge://extensions`，開啟 **Developer mode**，選擇 **Load unpacked**，再選取該資料夾。開發者提示會持續顯示。新版本需要手動更新。

更新未封裝擴充功能時，先關閉舊浮動視窗，再執行 `/glimpselet:glimpse` 更新固定資料夾，然後在擴充功能頁面的卡片按「重新載入」。若 Claude Code 在遠端，請透過歡迎指南下載新版 ZIP，在瀏覽器所在電腦替換解壓縮後的檔案，再重新載入擴充功能。 改用 `~/Glimpselet-extension` 時，請移除舊擴充功能卡片，再載入這個資料夾一次。

已安裝的外掛請執行以下指令，再在 Claude Code 執行 `/reload-plugins` 和 `/glimpselet:glimpse`。確認外掛清單與擴充功能卡片均為 **2.1.0** 後，再重新開啟浮動視窗。

```sh
claude plugin marketplace update glimpselet
claude plugin update glimpselet@glimpselet
claude plugin list
```

</details>

## 邊讀邊用

- **截取全螢幕**或**選取區域**。在支援的頁面或浮動視窗中按住 Shift 拖曳。Enter 確認，Esc 取消。擷取分享螢幕時，浮動視窗會暫時移開，完成後恢復。
- **導覽這頁**提供頁面概覽，再用下一步／上一步走過閱讀區域和控制項。
- 選取文字來提問、解釋或翻譯。頁面原位翻譯可還原。PDF 使用內建閱讀器。
- **自動解說**最多建議三個問題，並摘要變化。Alt+P 暫停。聊天可選 Opus、Sonnet 或 Haiku。

![arXiv：選取摘要、提問，再翻譯成繁體中文。](assets/arxiv.gif)

_arXiv：選取摘要、提問，再翻譯成繁體中文。_

使用真實擴充功能、線上網站與 Claude Code 回答錄製。等待時間已縮短，頁面內容與回答均未編排。

## 快捷鍵

| 快捷鍵       | 操作               |
| ------------ | ------------------ |
| Alt+Shift+G  | 開啟浮動視窗       |
| Ctrl+Shift+S | 在瀏覽器中裁切     |
| Ctrl+Shift+7 | 從其他應用程式裁切 |

macOS 用 Cmd 代替 Ctrl。在 `chrome://extensions/shortcuts` 修改快捷鍵。Shift 僅在支援的頁面和浮動視窗內生效。

## 對話與隱私

Glimpselet 優先使用已驗證的 Claude Code 即時通道，否則在獨立程序中延續專案最新的已儲存對話。避免在終端機同時操作同一份對話紀錄。[通道設定與限制](docs/DESIGN.md#the-running-claude-code-conversation)。

> [!IMPORTANT]
> **自動解說**在你同意並授予網站權限後，**不需要分享螢幕**就能摘要頁面變化。密碼欄位與封鎖清單會暫停自動摘要和問題建議。螢幕摘要會分享瀏覽器分頁，並綁定到同一個已檢查的分頁，執行相同檢查。分享顯示器或應用程式需要**每次分享另外同意**。無法檢查這些像素中的密碼欄位或被封鎖網站。來源不明時保持暫停。
> 載入中或無法存取的嵌入頁面也會暫停自動頁面請求。

沒有遙測，也沒有發布者營運的回答服務。選定的上下文與擷取影像會送到你的後端，適用供應商的條款和費用。原生應用程式只提供像素。瀏覽器設定、擴充功能商店與受保護頁面不支援頁面工具。原生視窗的透明度與點擊穿透受瀏覽器限制。[隱私](docs/SECURITY.md) | [使用說明](docs/USAGE.md) | [版本說明](docs/releases/v2.1.0.md)

Assisted by Claude/Codex.
