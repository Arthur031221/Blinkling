<p align="center"><img src="assets/logo.svg" width="72" alt="Glimpselet 的夥伴 Blink"><br><strong>Glimpselet</strong><br><em>Blink 等著。你指出畫面。它來回答。</em></p>

<p align="center"><a href="README.md">English</a>  |  <a href="README.zh-CN.md">简体中文</a>  |  <a href="README.ja.md">日本語</a>  |  <a href="README.ko.md">한국어</a>  |  <a href="README.es.md">Español</a>  |  <a href="README.fr.md">Français</a>  |  <a href="README.de.md">Deutsch</a>  |  <a href="README.pt-BR.md">Português (Brasil)</a></p>

> 在小型浮動視窗中，向你的程式設計助理詢問正在分享的畫面。

已檢查的測試結果：20 項合成螢幕閱讀任務全數通過，作者逐一檢查每個回答。透過整合套件使用 CLI Haiku 進行實測。中位數 2.609 秒，p95 為 3.263 秒。[結果與方法](assets/benchmark.json)。

| 操作前       | 操作後                               |
| ------------ | ------------------------------------ |
| 畫面資訊太多 | 凍結畫面、裁切或遮住細節，再提出問題 |

透過兩個斜線指令安裝整合套件：

```text
/plugin marketplace add Arthur031221/Glimpselet
/plugin install glimpselet@glimpselet
```

接著執行 `/glimpselet:glimpse`。需要 Node.js 22 以上版本，不需要瀏覽器擴充功能。

<p align="center"><img src="assets/demo.gif" width="800" alt="Glimpselet 使用標示清楚的測試畫面和預錄回答，不會呼叫模型"></p>

<p align="center"><a href="https://arthur031221.github.io/Glimpselet/">開啟靜態示範</a>  |  預錄範例，不會送出供應商請求</p>

## 平常怎麼用

```text
/glimpselet:glimpse
在瀏覽器選擇器中選取螢幕、視窗或分頁。
凍結畫面、裁切區域，並以不透明遮罩蓋住私人資訊。
提出問題，閱讀串流回答，再繼續追問。
複製或釘選回答，結束後清除本機工作階段。
```

提出問題或啟用被動筆記前，畫面只留在本機。不透明遮罩會修改送出的影像。被動筆記每兩秒取樣一次，為變動畫面送出簡短描述請求，預設每個滾動分鐘最多六次（每小時最多 360 次）。這是請求數上限，不代表費用，也可調低。

**畫面由你決定何時分享，程式不會自行開始觀看。**

## 詳細說明

<details>
<summary>安裝與開啟</summary>

上方兩個指令會加入並安裝整合套件。執行 `/glimpselet:glimpse`，即可在隨機連接埠開啟本機面板。一次性連結 60 秒後失效且只能兌換一次，記憶體中的面板工作階段維持 30 分鐘。瀏覽器選擇器會讓你選擇顯示器、應用程式視窗或分頁。

</details>

<details>
<summary>提問、追問與檢視</summary>

可選 `sonnet`、`opus` 或 `haiku` 模型別名。問題會透過已安裝且受限的命令列工具串流處理，也可由本機橋接程式發出選用 API 請求。受限 CLI 會移除一般命令工具，但企業管理的 hooks 仍可能執行，因此它不是作業系統層級的沙箱，仍須信任已安裝的 CLI 及組織設定的政策 hooks。追問可帶入範圍有限的近期脈絡。面板支援裁切、凍結、不透明遮罩、複製、釘選、最近十分鐘時間軸、摘要和 Markdown 匯出。摘要使用現有的被動筆記，不會另外傳送新的影像。清除會中止工作並移除本機影格、筆記、歷史與記憶體中的 API 金鑰。

</details>

<details>
<summary>浮動視窗與瀏覽器支援</summary>

開啟浮動面板需要使用者操作。Chrome 和 Edge 116 以上版本在支援時可使用 Document Picture-in-Picture。若此功能拒絕開啟，請再點一次「Open popup」以一般彈出視窗開啟。彈出視窗不保證總是在其他視窗上方。視窗位置由瀏覽器控制，瀏覽器也可能沿用先前的位置。此分頁會記住緊湊或展開的選擇。瀏覽器和作業系統的擷取權限及選項各有不同。

</details>

<details>
<summary>從原始碼開發</summary>

需要 Node.js 22 以上版本，接著執行 `npm ci`、`npm run build` 和 `npm run build:plugin`。完整檢查請見[貢獻指南](CONTRIBUTING.md)。靜態示範使用測試圖片與預錄文字，不會呼叫模型。

</details>

## 限制

瀏覽器分享啟用時，MCP 擷取會使用該分享來源。若來源中斷或無法回應，就會直接失敗，不會改用未套用遮罩的原生擷取。分享中斷後，分享意圖仍會保留，直到明確停止分享、清除本機資料或工作階段到期。在此之前不會改用原生擷取。分享意圖結束後，原生擷取才可使用，且會受平台工具與作業系統權限限制：macOS 支援螢幕、視窗與區域，Windows 支援螢幕，Linux 依 Wayland 或 X11 工具而定。一般彈出視窗不保證置頂。程式無法可靠辨識密碼、游標或視窗標題。送出前請檢查每張影格。

另一個 `screen_watch_start` MCP 工具可依指定的 5 至 60 秒間隔連續取樣，只保留有變化的影格，且不呼叫模型。它與面板每兩秒取樣並產生敘述的被動筆記不同。

更多內容：[使用方式](docs/USAGE.md)、[安裝](docs/INSTALL.md)、[設定](docs/CONFIGURATION.md)、[架構](docs/ARCHITECTURE.md)、[安全與隱私](docs/SECURITY.md)、[套件結構](docs/PLUGIN.md)、[貢獻](CONTRIBUTING.md)、[MIT 授權](LICENSE)。

## Disclosure

Assisted by Claude/Codex.
