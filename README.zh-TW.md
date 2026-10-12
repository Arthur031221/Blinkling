# Glimpselet

Glimpselet 是一個會保持在其他視窗上方的小型聊天視窗，可連線至現有的 Claude Code 工作階段。它可以讀取及翻譯可存取的網頁、在實際頁面上繪製指引，並擷取網頁區域或分享螢幕畫面來回答問題。

![Glimpselet 浮動聊天示範](assets/demo.gif)

![繪製在實際頁面上的指引圓圈](assets/screenshots/guide.png)

[開啟靜態示範](https://arthur031221.github.io/Glimpselet/)。示範使用範例圖片與預錄回答，不會呼叫供應商服務。

## 安裝

在 Claude Code 中安裝 Glimpselet 外掛：

```text
/plugin marketplace add Arthur031221/Glimpselet
/plugin install glimpselet@glimpselet
```

執行 `/glimpse` 並依照設定指南操作。安裝與配對步驟以該指南為準。

### 進階：從原始碼載入

1. 在 Chrome 或 Edge 開啟 `chrome://extensions`，啟用**開發人員模式**。
2. 選擇**載入未封裝項目**。
3. 選取設定指南提供的擴充功能資料夾。

> **開發人員模式：** Glimpselet 目前以開發人員模式發佈。在應用程式商店上架前，更新都必須手動安裝。

## 擷取與快捷鍵

在浮動泡泡或可存取的網頁上按住 Shift，即可開始裁切。Shift 無法監聽其他應用程式中的按鍵。網頁區域會直接在目前頁面上框選。分享螢幕時，畫面會凍結並以全螢幕顯示供你裁切。按 Enter 確認，按 Esc 取消。

瀏覽器裁切快捷鍵是 Ctrl+Shift+S，Mac 為 Cmd+Shift+S，可在瀏覽器中啟動裁切。全域快捷鍵預設為 Ctrl+Shift+7，因為 Chrome 的全域快捷鍵必須包含數字鍵。你可以在 `chrome://extensions/shortcuts` 修改，也可改成 S。

## Claude Code 工作階段

有文件說明的 MCP channel 支援可將訊息送進正在執行的 Claude Code 工作階段。Glimpselet 會從 channel 回覆工具的分段內容鏡像顯示回覆。終端機中的工作階段控制模型與權限。若要加入 Glimpselet 自訂 channel，請以開發 channel 重新啟動工作階段，再執行 `/glimpse`：

```sh
claude --resume SESSION_ID --dangerously-load-development-channels plugin:glimpselet@glimpselet
```

沒有 channel 時，Glimpselet 可用另一個 print 模式程序透過 `claude --resume SESSION_ID -p` 延續同一工作階段。這是平行延續。請勿與終端機中使用同一工作階段的程序同時執行，以免存取衝突。

## 限制

- 僅支援 Chrome、Edge 及其他 Chromium 瀏覽器。
- `chrome://` 等瀏覽器內部頁面、擴充功能商店及部分受管理頁面會限制擴充功能存取。
- Glimpselet 無法在原生應用程式上繪圖。可分享螢幕並詢問畫面，但無法使用網頁覆蓋層與文字操作。
- PDF 請使用 Glimpselet 隨附的閱讀器。Chrome 內建 PDF 檢視器不是可存取的網頁。
- 瀏覽器的 Document Picture-in-Picture API 不支援點擊穿透，因此浮動視窗無法將點擊傳遞至其他應用程式。瀏覽器也無法保證浮動視窗或自動彈出。使用浮動視窗時，請保持擴充功能頁面開啟。

## 隱私

不收集遙測資料。取得同意後，頁面文字可能會傳送以產生建議問題。提問與自願啟用的被動摘要也會傳送相關文字和圖片。畫面保留在記憶體中，僅在擷取或提問請求時傳送至橋接服務。橋接模式會在主機執行 CLI，工作階段逐字稿也保存在主機。直接 API 模式會從擴充功能送出請求。API 金鑰與橋接權杖保存在瀏覽器工作階段儲存空間。偏好設定保存在瀏覽器本機儲存空間。詳見[安全與隱私](docs/SECURITY.md)。

## 更多資訊

[安裝](docs/INSTALL.md) | [使用方式](docs/USAGE.md) | [設計與整合](docs/DESIGN.md) | [商店準備](docs/STORE.md) | [發行說明](docs/releases/v2.0.0.md)

## Disclosure

Assisted by Claude/Codex.
