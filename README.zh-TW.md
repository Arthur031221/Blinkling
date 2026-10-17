<h1 align="center"><img src="assets/logo.svg" width="72" alt="" /><br /><picture><source media="(prefers-color-scheme: dark)" srcset="assets/brand/wordmark-dark.svg" /><img src="assets/brand/wordmark-light.svg" width="260" alt="Blinkling" /></picture></h1>

<p align="center"><strong>Blink 住在螢幕角落。按住 Ctrl 點一下，答案就來。</strong></p>

<p align="center">
  <a href="https://github.com/Arthur031221/Blinkling/actions/workflows/ci.yml"><img src="https://github.com/Arthur031221/Blinkling/actions/workflows/ci.yml/badge.svg" alt="CI" /></a>
  <a href="https://github.com/Arthur031221/Blinkling/releases"><img src="https://img.shields.io/github/v/release/Arthur031221/Blinkling" alt="Release" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/github/license/Arthur031221/Blinkling" alt="License" /></a>
</p>

[English](README.md) | [繁體中文](README.zh-TW.md) | [简体中文](README.zh-CN.md) | [日本語](README.ja.md) | [한국어](README.ko.md) | [Español](README.es.md) | [Français](README.fr.md) | [Deutsch](README.de.md) | [Português](README.pt-BR.md)

Formerly Glimpselet。從舊外掛升級？請執行 `/plugin uninstall glimpselet@glimpselet` 與 `/plugin marketplace remove glimpselet`，再照下方步驟安裝 Blinkling。

Blinkling 讓小綠伙伴 Blink 待在螢幕角落，浮在所有程式之上。按住 **Ctrl**（macOS 為 Control）點一下想問的東西，或拖曳框出一個區域。內容會飛進 Blink，你開口問，答案會在 Blink 旁邊的聊天卡片中打開。

> **設計上就安全：** Blinkling 只看和解說，絕不替你點擊、打字或操作任何程式。

使用這台電腦上你已登入的 Claude Code。

<table>
<tr>
<td width="33%" align="center"><img src="assets/pick.gif" width="320" alt="在 arXiv 頁面按住 Ctrl 點一個段落。它的截圖飛進 Blink 的嘴裡，聊天卡片打開，答案逐字出現。"></td>
<td width="33%" align="center"><img src="assets/translate.gif" width="320" alt="在阿拉伯文維基百科頁面選一段文字，送進 Blink，按下翻譯，答案用英文說明這段文字。"></td>
<td width="33%" align="center"><img src="assets/tour.gif" width="320" alt="在內容密集的公開網頁按下導覽，Blink 標出頁面各部分，拿著指示棒指向目前這一步，再用下一步往下走。"></td>
</tr>
<tr>
<td align="center">論文：按住 Ctrl 點一段，讀答案。</td>
<td align="center">翻譯：阿拉伯文段落，用英文說明。</td>
<td align="center">導覽：難操作的頁面，一步一步看。</td>
</tr>
</table>

## 安裝

需要已登入的 Claude Code。接著：

1. 把下面這一行貼到終端機並按 Enter：

   ```sh
   claude plugin marketplace add Arthur031221/Blinkling && claude plugin install blinkling@blinkling
   ```

2. 在終端機用 Blink 頻道啟動 Claude Code：

   ```text
   claude --dangerously-load-development-channels plugin:blinkling@blinkling
   ```

   這個旗標讓 Blink 的聊天能傳到這個工作階段，Claude Code 會請你確認一次；沒有它 Blink 照常運作，由自己的工作階段回答。

   接著在那個工作階段中執行：

   ```text
   /blinkling:blinkling
   ```

3. 在 Mac 上，一次性允許 Blinkling 使用**螢幕錄製**：系統設定，隱私權與安全性。macOS 還會詢問一次**輔助使用**，這樣按住 Ctrl 才能開始選取；在同一處允許即可。

> [!NOTE]
> 在 Windows PowerShell 5 中，用 `;` 取代 `&&`。適合你電腦的動畫步驟：[安裝指南](https://arthur031221.github.io/Blinkling/install/)。其他安裝方式、更新與 Linux 沙盒：[docs/INSTALL.md](docs/INSTALL.md)。

## 邊讀邊用

- **按住 Ctrl 並點一下**段落、按鈕或圖片，Blink 就會取下它。
- **按住 Ctrl 並拖曳**則改為取一個區域。
- 會跳出一個小輸入框，附三個快速提問，按 Enter 送出反白的那一個。
- 隨時點 Blink 就能對話。聊天卡片會在 Blink 旁邊打開，接續你們的對話。

![點 Blink，輸入問題，答案會流進聊天卡片。](assets/ask.gif)

- Blink 的選單有截圖、導覽、自動解說（預設關閉）與設定。
- 選用的 Chrome／Edge 瀏覽器小幫手會提供網頁本身的結構，讓 Blink 知道你指的是哪一段或哪個按鈕，另有整頁截圖、原地翻譯網頁與 PDF 閱讀器。工具列按鈕會顯示是否已連線，並可喚醒 Blink。沒有它，Blink 在每個視窗仍可使用。

## 快捷鍵

| 快捷鍵         | 操作             |
| -------------- | ---------------- |
| Ctrl + 點一下  | 詢問指標下的東西 |
| Ctrl + 拖曳    | 取一個區域       |
| 設定中的快捷鍵 | 開啟截圖覆蓋層   |

按鍵可在設定中更改。

## 對話與隱私

Blink 會把你選取的內容送給你自己已登入的 Claude Code，並把答案顯示在 Blink 旁邊的聊天卡片中。在啟動 Blink 的終端機工作階段輸入的提問和完成的答案，會自動出現在 Blink 的聊天中。反方向，也就是讓 Blink 的聊天出現在終端機，用的是 Claude Code 的實驗性 channels，只能在啟動時載入：用 `claude --dangerously-load-development-channels plugin:blinkling@blinkling` 啟動 Claude Code（`/blinkling:blinkling` 會顯示這條指令），兩邊就都看得到全部內容。不這樣做時，Blink 用自己的工作階段回答。

> [!IMPORTANT]
> 瀏覽器小幫手只在你指向網頁時讀取該頁。密碼與付款欄位一律不讀取，且只與你電腦上的 Blinkling 通訊。自動解說在你開啟前保持關閉。

沒有遙測，也沒有發行者經營的回答服務。你選取的內容會送到你的 Claude Code；適用供應商條款與用量費用。瀏覽器設定、擴充功能商店與瀏覽器內建的 PDF 檢視器屬受保護頁面：在那裡 Blink 只依螢幕畫面回答。 [隱私](docs/SECURITY.md) | [使用說明](docs/USAGE.md) | [版本說明](docs/releases/v3.2.2.md)

Assisted by Claude/Codex.
