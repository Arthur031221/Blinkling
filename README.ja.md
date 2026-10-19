<h1 align="center"><img src="assets/blink-lying.gif" width="150" alt="" /><br /><picture><source media="(prefers-color-scheme: dark)" srcset="assets/brand/wordmark-dark.svg" /><img src="assets/brand/wordmark-light.svg" width="260" alt="Blinkling" /></picture></h1>

<p align="center"><strong>Blink は画面の隅に住んでいます。Ctrl を押しながらクリックすれば、答えが返ってきます。</strong></p>

<p align="center">
  <a href="https://github.com/Arthur031221/Blinkling/actions/workflows/ci.yml"><img src="https://github.com/Arthur031221/Blinkling/actions/workflows/ci.yml/badge.svg" alt="CI" /></a>
  <a href="https://github.com/Arthur031221/Blinkling/releases"><img src="https://img.shields.io/github/v/release/Arthur031221/Blinkling" alt="Release" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/github/license/Arthur031221/Blinkling" alt="License" /></a>
</p>

[English](README.md) | [繁體中文](README.zh-TW.md) | [简体中文](README.zh-CN.md) | [日本語](README.ja.md) | [한국어](README.ko.md) | [Español](README.es.md) | [Français](README.fr.md) | [Deutsch](README.de.md) | [Português](README.pt-BR.md)

Blinkling は、Blink という小さな緑のコンパニオンを画面の隅に置き、すべてのアプリの上に表示します。Ctrl（macOS では Control）を押したまま、聞きたいものをクリックするか、ドラッグして範囲を取ります。選んだものが Blink に飛び込み、質問を入力すると、答えが Blink の横のチャットカードに開きます。

Blinkling は見て説明するだけです。アプリをクリックしたり、入力したりすることは一切ありません。

このコンピューターですでにサインインしている Claude Code を使います。

<p align="center">
<img src="assets/pick.webp" alt="arXiv のページで Ctrl を押しながら段落をクリックします。そのスナップショットが Blink の口に飛び込み、チャットカードが開いて答えが流れます。"><br>
論文：Ctrl を押しながら段落をクリックし、答えを読む。
</p>

<p align="center">
<img src="assets/translate.webp" alt="アラビア語版ウィキペディアのページで選んだ一節を Blink に送り、翻訳を押すと、答えがその一節を英語で説明します。"><br>
翻訳：アラビア語の一節を英語で説明。
</p>

<p align="center">
<img src="assets/tour.webp" alt="情報が密集した公開ページでガイドを押すと、ページの各部分に印が付きます。Blink は指示棒で現在のステップを指し、次へで進みます。"><br>
ガイド：操作しにくいページを一歩ずつ。
</p>

## インストール

このコンピューターでサインイン済みの Claude Code が必要です。Windows ではさらに nodejs.org から Node.js 22 以降が必要で、Blinkling はそれをダウンロードしません。macOS と Linux はほかに何も要りません。

何かをインストールしたら、ターミナルをいったん閉じて新しく開き直してください。新しく入ったプログラムが見つかるようになります。

1. 次の行をターミナルに貼り付けて Enter を押します。

   ```sh
   claude plugin marketplace add Arthur031221/Blinkling && claude plugin install blinkling@blinkling
   ```

2. Blink のチャンネルを付けて Claude Code を起動します。

   ```text
   claude --dangerously-load-development-channels plugin:blinkling@blinkling
   ```

   このフラグで、Blink のチャットとこのターミナルのセッションがお互いを見られるようになります。Claude Code が一度だけ確認を求めます。フラグなしでも Blink は動き、自分のセッションから答えます。

   そのセッションで、次を実行します。

   ```text
   /blinkling:blinkling
   ```

3. Mac では、システム設定のプライバシーとセキュリティで、Blinkling に画面収録を一度許可します。macOS はアクセシビリティも一度尋ねてきます。Ctrl キーで選択を始めるために必要なので、同じ場所で許可してください。

Mac や Linux に Node.js がない場合、Blinkling は初回起動時に専用のコピーを取得します。大きさは約 45 MB で、固定した SHA-256 と照合されます。その初回起動で Claude Code が Blinkling への接続に失敗したと表示したら、1 分待ってから `/mcp` を実行してください。

> [!NOTE]
> Windows PowerShell 5 では、2 つのコマンドを `&&` でつながず、1 つずつ続けて実行してください。お使いのコンピューター向けのアニメーション付き手順は[インストールガイド](https://arthur031221.github.io/Blinkling/install/)にあります。ほかのインストール方法、更新、Linux のサンドボックスは [docs/INSTALL.md](docs/INSTALL.md) を見てください。

## 読みながら使う

- Ctrl を押したまま段落、ボタン、画像をクリックすると、Blink がそれを受け取ります。
- Ctrl を押したままドラッグすると、代わりに範囲を取ります。
- チャットカードが Blink の横に開き、選んだもの、3 つのクイック質問、モデル、強度、権限のピッカーが並びます。Enter で強調表示された質問を送ります。
- 話したいときはいつでも Blink をクリックします。カードがこれまでの会話とともに開きます。

![Blink をクリックして質問を入力すると、答えがチャットカードに流れ込みます。](assets/ask.webp)

- Blink のメニューには、キャプチャ、ガイド、自動解説、設定があります。自動解説は、オンにするまでオフのままです。
- Chrome か Edge 用の任意のブラウザヘルパーは、ページの構造を Blink に渡すので、Blink はあなたが指した段落やボタンがわかります。ページ全体のキャプチャ、その場での翻訳、PDF リーダーも加わります。ツールバーのボタンで接続状況がわかり、Blink を起こすこともできます。なくても、Blink はどのウィンドウでも動きます。

## ショートカット

| ショートカット         | 操作                                                     |
| ---------------------- | -------------------------------------------------------- |
| Ctrl + クリック        | ポインターの下にあるものについて尋ねる                   |
| Ctrl + ドラッグ        | 範囲を取る                                               |
| 設定のホットキー       | キャプチャオーバーレイを開く                             |
| Ctrl + Alt + Shift + B | Blink を終了する（Mac では Ctrl + Option + Command + B） |

キーは設定で変更できます。

## セッションとプライバシー

Blink は、選んだものをあなた自身のサインイン済みの Claude Code に送り、答えをチャットカードに表示します。Blink を起動したターミナルのセッションで入力した内容と、その答えも、Blink のチャットに表示されます。

逆方向、つまり Blink のチャットをターミナルに出す部分は、Claude Code の実験的なチャンネルを使います。チャンネルは Claude Code の起動時にしか読み込まれないので、`claude --dangerously-load-development-channels plugin:blinkling@blinkling` で起動してください。`/blinkling:blinkling` でも同じコマンドが表示されます。

> [!IMPORTANT]
> ブラウザヘルパーは、あなたがページを指したときだけそのページを読みます。パスワードや支払いの欄は読まず、あなた自身のコンピューター上の Blinkling とだけ通信します。 自動解説は、オンにするまでオフのままです。

Blinkling にはテレメトリーも、独自の回答サービスもありません。選んだものはあなたの Claude Code に送られ、プロバイダーの規約と利用料金が適用されます。ブラウザの設定、拡張機能ストア、ブラウザ内蔵の PDF ビューアーは保護されたページなので、そこでは Blink は画面から答えます。

[プライバシー](docs/SECURITY.md) | [使い方](docs/USAGE.md) | [リリースノート](docs/releases/v3.2.7.md)

Assisted by Claude/Codex.
