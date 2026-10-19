<h1 align="center"><img src="assets/logo.svg" width="72" alt="" /><br /><picture><source media="(prefers-color-scheme: dark)" srcset="assets/brand/wordmark-dark.svg" /><img src="assets/brand/wordmark-light.svg" width="260" alt="Blinkling" /></picture></h1>

<p align="center"><strong>Blink住在螢幕角落，按住Ctrl點一下，答案就來。</strong></p>

<p align="center">
  <a href="https://github.com/Arthur031221/Blinkling/actions/workflows/ci.yml"><img src="https://github.com/Arthur031221/Blinkling/actions/workflows/ci.yml/badge.svg" alt="CI" /></a>
  <a href="https://github.com/Arthur031221/Blinkling/releases"><img src="https://img.shields.io/github/v/release/Arthur031221/Blinkling" alt="Release" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/github/license/Arthur031221/Blinkling" alt="License" /></a>
</p>

[English](README.md) | [繁體中文](README.zh-TW.md) | [简体中文](README.zh-CN.md) | [日本語](README.ja.md) | [한국어](README.ko.md) | [Español](README.es.md) | [Français](README.fr.md) | [Deutsch](README.de.md) | [Português](README.pt-BR.md)

Formerly Glimpselet，如果你是從舊外掛升級，請先執行`/plugin uninstall glimpselet@glimpselet`和`/plugin marketplace remove glimpselet`，再照下面的步驟安裝Blinkling。

Blinkling讓一個叫Blink的綠色小夥伴待在螢幕角落，浮在所有程式上面，按住Ctrl，macOS上是Control，再點一下想問的東西，或拖曳框出一個區域，選到的內容會飛進Blink，你輸入問題，答案就在Blink旁邊的聊天卡片裡打開。

Blinkling只看和解說，不會在你的程式裡點擊或打字。

它使用這台電腦上你已經登入的Claude Code。

<p align="center">
<img src="assets/pick.webp" alt="在arXiv頁面按住Ctrl點一個段落，它的截圖飛進Blink的嘴裡，聊天卡片打開，答案逐字出現"><br>
論文，按住Ctrl點一段，讀答案。
</p>

<p align="center">
<img src="assets/translate.webp" alt="在阿拉伯文維基百科頁面選一段文字，送進Blink，按下翻譯，答案用英文說明這段文字"><br>
翻譯，阿拉伯文段落用英文說明。
</p>

<p align="center">
<img src="assets/tour.webp" alt="在內容密集的公開網頁按下導覽，Blink標出頁面各部分，拿著指示棒指向目前這一步，再按下一步往下走"><br>
導覽，難讀的頁面一步一步看。
</p>

## 安裝

你需要在這台電腦上登入好Claude Code，Windows上還要從nodejs.org安裝Node.js 22或更新版本，Blinkling不會替你下載，macOS和Linux不需要其他東西。

安裝完任何東西後，請關掉終端機再開一個新的，這樣它才找得到剛裝好的程式。

1. 把下面這一行貼到終端機，按Enter。

   ```sh
   claude plugin marketplace add Arthur031221/Blinkling && claude plugin install blinkling@blinkling
   ```

2. 用Blink的頻道啟動Claude Code。

   ```text
   claude --dangerously-load-development-channels plugin:blinkling@blinkling
   ```

   這個旗標讓Blink的聊天和這個終端機工作階段能互相看到，Claude Code會請你確認一次，沒有旗標的話Blink照常運作，只是改由自己的工作階段回答。

   接著在那個工作階段裡執行下面這行。

   ```text
   /blinkling:blinkling
   ```

3. 在Mac上，到系統設定的隱私權與安全性，一次性允許Blinkling使用螢幕錄製，macOS也會問一次輔助使用，這樣Ctrl鍵才能開始選取，同樣在那裡允許就好。

Mac或Linux電腦如果沒有Node.js，Blinkling第一次啟動時會自己取得一份專用的，大小約45 MB，並用固定的SHA-256核對，第一次啟動時如果Claude Code說Blinkling連線失敗，請等一分鐘再執行`/mcp`。

> [!NOTE]
> 在Windows PowerShell 5裡，兩個指令請一個接一個執行，不要用`&&`串在一起，適合你電腦的動畫步驟在[安裝指南](https://arthur031221.github.io/Blinkling/install/)，其他安裝方式、更新和Linux沙盒在[docs/INSTALL.md](docs/INSTALL.md)。

## 邊讀邊用

- 按住Ctrl點一下段落、按鈕或圖片，Blink就會把它取下來。
- 按住Ctrl拖曳，改為取一個區域。
- 聊天卡片會在Blink旁邊打開，帶著你取的內容、三個快速提問，以及模型、強度和權限的選擇，按Enter送出反白的那一個。
- 隨時點Blink就能對話，卡片會帶出你們之前的對話。

![點Blink，輸入問題，答案會流進聊天卡片](assets/ask.webp)

- Blink的選單有截圖、導覽、自動解說和設定，自動解說在你開啟前一直是關的。
- 選用的Chrome或Edge瀏覽器小幫手會提供網頁本身的結構，讓Blink知道你指的是哪一段或哪個按鈕，另外還有整頁截圖、原地翻譯和PDF閱讀器，工具列按鈕會顯示是否已連線，也能喚醒Blink，沒有它的話，Blink在每個視窗仍然能用。

## 快捷鍵

| 快捷鍵                 | 操作                                            |
| ---------------------- | ----------------------------------------------- |
| Ctrl加點一下           | 詢問指標下的東西                                |
| Ctrl加拖曳             | 取一個區域                                      |
| 設定中的快捷鍵         | 開啟截圖覆蓋層                                  |
| Ctrl + Alt + Shift + B | 結束Blink，Mac上改按Ctrl + Option + Command + B |

按鍵可以在設定裡更改。

## 對話與隱私

Blink會把你選取的內容送給你自己已登入的Claude Code，答案顯示在聊天卡片裡，你在啟動Blink的終端機工作階段輸入的內容和它的答案，也會出現在Blink的聊天中。

反方向，也就是讓Blink的聊天出現在終端機，走的是Claude Code實驗性的channels，它們只在Claude Code啟動時載入，所以請用`claude --dangerously-load-development-channels plugin:blinkling@blinkling`啟動，`/blinkling:blinkling`也會印出同一行指令。

> [!IMPORTANT]
> 瀏覽器小幫手只在你指向網頁時才讀那一頁，不會讀密碼和付款欄位，只和你電腦上的Blinkling溝通，自動解說在你開啟前一直是關的。

Blinkling沒有遙測，也沒有自己的回答服務，你選取的內容只會送到你的Claude Code，供應商的條款和用量費用照常適用，瀏覽器設定、擴充功能商店和瀏覽器內建的PDF檢視器是受保護頁面，在那裡Blink只能依螢幕畫面回答。

[隱私](docs/SECURITY.md) | [使用說明](docs/USAGE.md) | [版本說明](docs/releases/v3.2.7.md)

Assisted by Claude/Codex.
