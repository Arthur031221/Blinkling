# Glimpselet

[English](README.md) · [繁體中文](README.zh-TW.md) · [简体中文](README.zh-CN.md) · [日本語](README.ja.md) · [한국어](README.ko.md) · [Español](README.es.md) · [Français](README.fr.md) · [Deutsch](README.de.md) · [Português](README.pt-BR.md)

一個懸浮聊天視窗，讓你向 Claude Code 詢問目前頁面或螢幕上的內容。閱讀與翻譯網頁、取得頁面控制項指引，也可以擷取區域後提問。

|           Glimpselet 懸浮聊天           |                 頁面指引範例                  |
| :-------------------------------------: | :-------------------------------------------: |
| ![Glimpselet 懸浮聊天](assets/demo.gif) | ![頁面指引範例](assets/screenshots/guide.png) |

需求：較新的 Claude Code、使用你自己的訂閱帳號登入，以及桌面版 Chromium 瀏覽器，例如 Chrome 或 Edge。

Glimpselet 預設建立專用對話。你也可以選擇最近的 Claude Code 工作階段，在另一個程序中接續。若要將請求傳送到終端機中已開啟的互動工作階段，請啟用 channel 預覽功能。[Channel 設定](docs/DESIGN.md#the-running-claude-code-conversation)。

## 安裝

1. 在 Claude Code 中新增市集並安裝外掛：

   ```text
   /plugin marketplace add Arthur031221/Glimpselet
   /plugin install glimpselet@glimpselet
   ```

2. 執行 `/glimpselet:glimpse`。

3. 依照歡迎指南連接瀏覽器。在本機桌面上，可選擇 **Try without installing**，也可以在自己的瀏覽器載入並配對擴充功能。如果 Claude Code 在遠端主機執行，請在有瀏覽器的電腦執行指南提供的 SSH 指令，並在該電腦下載 ZIP、於瀏覽器載入擴充功能。遠端主機無法使用免安裝瀏覽器。配對成功後，Glimpselet 面板會顯示連線模式與專案。

### 進階：從原始碼載入

在自己的桌面瀏覽器中，擴充功能會放在固定資料夾 `~/.glimpselet/extension`。在 Chrome 或 Edge 開啟 `chrome://extensions` 或 `edge://extensions`，開啟 **Developer mode**，選擇 **Load unpacked**，再選取該資料夾。開發者提示會持續顯示。新版本需要手動更新。

## 可以做什麼

- 使用 Opus、Sonnet 或 Haiku 取得串流回覆並繼續追問。
- 在全螢幕檢視中擷取分享的螢幕，或用頁面浮層裁切區域。按住 Shift 拖曳，再按 Enter 擷取或按 Esc 取消。
- 查看會隨頁面變化更新的建議問題。
- 可選擇開啟 Passive 摘要，用 Alt+P 暫停，並查看每小時費用。
- 在頁面實際控制項上顯示操作指引。可就地翻譯文字，並用 Restore 還原。
- 選取文字後可解釋、翻譯或提問。也能在內建閱讀器開啟 PDF 並提問。

![導覽這個頁面](assets/guide.gif)

![選取區域](assets/crop.gif)

| 快速鍵                                 | 操作                                                              |
| -------------------------------------- | ----------------------------------------------------------------- |
| Alt+Shift+G                            | 開啟 Glimpselet，選擇 **Float** 開啟懸浮聊天。                    |
| Ctrl+Shift+S（macOS 上為 Cmd+Shift+S） | 裁切目前頁面或分享的螢幕。                                        |
| Ctrl+Shift+7（macOS 上為 Cmd+Shift+7） | 從任何應用程式裁切。可在 `chrome://extensions/shortcuts` 中修改。 |
| 按住 Shift                             | 在 Glimpselet 懸浮視窗或頁面中開始裁切。                          |
| Alt+P                                  | 暫停 Passive 摘要。                                               |

在 macOS 上，Cmd+Shift+5 會開啟系統截圖工具。網頁中的 Shift 只在 Glimpselet 頁面有效，無法監聽其他應用程式。

第一個操作是 **Float**。使用需要頁面存取權的功能時，擴充功能會要求權限。使用你自己已登入的 Claude Code 工作階段時，不需要提供服務供應商 API 金鑰。直接 API 模式是選用功能，需要你自己的 API 金鑰。

## Claude Code 工作階段

Channel 預覽的指令與設定請參閱 [Claude Code 工作階段](docs/DESIGN.md#the-running-claude-code-conversation)。未啟用 channel 時，Glimpselet 可以在另一個程序中繼續所選工作階段。這是平行延續。請勿同時在終端機使用該工作階段，否則並行存取可能造成衝突。

## 限制與隱私

Glimpselet 支援桌面版 Chrome、Edge 和其他 Chromium 瀏覽器。商店發行前會顯示開發者提示，更新需要手動進行。瀏覽器設定、擴充功能商店和受限頁面等部分頁面會阻擋存取。Chrome 內建 PDF 檢視器無法讀取，請使用 Glimpselet 閱讀器。原生應用程式只提供像素畫面，無法讀取頁面文字或顯示疊加層。Shift 只在 Glimpselet 自己的瀏覽器介面中有效，無法用於其他應用程式。懸浮視窗不支援點擊穿透。

只有在你同意後，自動建議問題才會使用頁面內容。被動摘要是選用功能，且需要分享可檢查的瀏覽器分頁。如果分享來源是視窗、螢幕、原生應用程式、未知來源或無法存取的來源，自動摘要會暫停。手動提問和擷取仍可使用。

[安裝指南](docs/INSTALL.md) | [使用方式](docs/USAGE.md) | [設計](docs/DESIGN.md) | [隱私詳情](docs/SECURITY.md)

Assisted by Claude/Codex.
