<h1 align="center"><img src="assets/logo.svg" width="72" alt="" /><br /><picture><source media="(prefers-color-scheme: dark)" srcset="assets/wordmark-dark.svg" /><img src="assets/wordmark-light.svg" width="260" alt="Blinkling" /></picture></h1>

<p align="center"><strong>讓答案留在頁面旁邊。</strong></p>

<p align="center">
  <a href="https://github.com/Arthur031221/Blinkling/actions/workflows/ci.yml"><img src="https://github.com/Arthur031221/Blinkling/actions/workflows/ci.yml/badge.svg" alt="CI" /></a>
  <a href="https://github.com/Arthur031221/Blinkling/releases"><img src="https://img.shields.io/github/v/release/Arthur031221/Blinkling" alt="Release" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/github/license/Arthur031221/Blinkling" alt="License" /></a>
</p>

[English](README.md) | [繁體中文](README.zh-TW.md) | [简体中文](README.zh-CN.md) | [日本語](README.ja.md) | [한국어](README.ko.md) | [Español](README.es.md) | [Français](README.fr.md) | [Deutsch](README.de.md) | [Português](README.pt-BR.md)

Formerly Glimpselet。從舊外掛升級？請執行 `/plugin uninstall glimpselet@glimpselet` 與 `/plugin marketplace remove glimpselet`，再照下方步驟安裝 Blinkling。

一個小巧的 Claude Code 浮動聊天視窗。詢問頁面、擷取區域、跟著導覽，或翻譯一段文字。

> [!TIP]
> 使用你已登入的 Claude Code 帳號，以及桌面版 Chrome 或 Edge。使用 Claude Code 不需要 API 金鑰。

![Google Flights：先看頁面導覽，再詢問如何預訂來回航班。](assets/demo.gif)

_Google Flights：先看頁面導覽，再詢問如何預訂來回航班。_

## 安裝

需要已登入的 Claude Code。接著：

1. 把下面這一行貼到終端機並按 Enter：

   ```sh
   claude plugin marketplace add Arthur031221/Blinkling && claude plugin install blinkling@blinkling
   ```

2. 在 Claude Code 中執行：

   ```text
   /blinkling:blinkling
   ```

3. 在 Mac 上，一次性允許 Blinkling 使用**螢幕錄製**：系統設定，隱私權與安全性。

> [!NOTE]
> 在 Windows PowerShell 5 中，用 `;` 取代 `&&`。適合你電腦的動畫步驟：[安裝指南](https://arthur031221.github.io/Blinkling/install/)。其他安裝方式、更新與 Linux 沙盒：[docs/INSTALL.md](docs/INSTALL.md)。

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

Blinkling 優先使用已驗證的 Claude Code 即時通道，否則在獨立程序中延續專案最新的已儲存對話。避免在終端機同時操作同一份對話紀錄。[通道設定與限制](docs/DESIGN.md#the-running-claude-code-conversation)。

> [!IMPORTANT]
> **自動解說**在你同意並授予網站權限後，**不需要分享螢幕**就能摘要頁面變化。密碼欄位與封鎖清單會暫停自動摘要和問題建議。螢幕摘要會分享瀏覽器分頁，並綁定到同一個已檢查的分頁，執行相同檢查。分享顯示器或應用程式需要**每次分享另外同意**。無法檢查這些像素中的密碼欄位或被封鎖網站。來源不明時保持暫停。
> 載入中或無法存取的嵌入頁面也會暫停自動頁面請求。

沒有遙測，也沒有發布者營運的回答服務。選定的上下文與擷取影像會送到你的後端，適用供應商的條款和費用。原生應用程式只提供像素。瀏覽器設定、擴充功能商店與受保護頁面不支援頁面工具。原生視窗的透明度與點擊穿透受瀏覽器限制。[隱私](docs/SECURITY.md) | [使用說明](docs/USAGE.md) | [版本說明](docs/releases/v2.1.0.md)

Assisted by Claude/Codex.
