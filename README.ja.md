<h1 align="center"><img src="assets/logo.svg" width="72" alt="" /><br /><picture><source media="(prefers-color-scheme: dark)" srcset="assets/brand/wordmark-dark.svg" /><img src="assets/brand/wordmark-light.svg" width="260" alt="Blinkling" /></picture></h1>

<p align="center"><strong>Blink は画面の隅に住んでいます。Ctrl を押しながらクリックすれば、答えが返ってきます。</strong></p>

<p align="center">
  <a href="https://github.com/Arthur031221/Blinkling/actions/workflows/ci.yml"><img src="https://github.com/Arthur031221/Blinkling/actions/workflows/ci.yml/badge.svg" alt="CI" /></a>
  <a href="https://github.com/Arthur031221/Blinkling/releases"><img src="https://img.shields.io/github/v/release/Arthur031221/Blinkling" alt="Release" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/github/license/Arthur031221/Blinkling" alt="License" /></a>
</p>

[English](README.md) | [繁體中文](README.zh-TW.md) | [简体中文](README.zh-CN.md) | [日本語](README.ja.md) | [한국어](README.ko.md) | [Español](README.es.md) | [Français](README.fr.md) | [Deutsch](README.de.md) | [Português](README.pt-BR.md)

Formerly Glimpselet。旧プラグインをお使いの方は、`/plugin uninstall glimpselet@glimpselet` と `/plugin marketplace remove glimpselet` を実行してから、下の手順で Blinkling をインストールしてください。

Blinkling は、小さな緑の相棒 Blink を画面の隅に置き、すべてのアプリの上に表示します。聞きたいものを **Ctrl**（macOS では Control）を押しながらクリックするか、ドラッグして範囲を選びます。選んだものは Blink に飛び込み、質問すると、答えは Blink の横に吹き出しで表示されます。

> **安全な設計：** Blinkling は見て説明するだけ。クリックや入力、アプリの操作は一切しません。

このコンピュータでログイン済みの Claude Code を使います。

![Ctrl を押しながら、ウェブページの段落をクリックします。Blink に飛び込み、質問すると、答えが Blink の横に表示されます。](assets/pick.gif)

## インストール

サインイン済みの Claude Code が必要です。続いて：

1. 次の 1 行をターミナルに貼り付けて Enter を押します：

   ```sh
   claude plugin marketplace add Arthur031221/Blinkling && claude plugin install blinkling@blinkling
   ```

2. Claude Code で実行します：

   ```text
   /blinkling:blinkling
   ```

3. Mac では、Blinkling の**画面収録**を一度だけ許可します：システム設定、プライバシーとセキュリティ。 macOS は Ctrl キーで選択を始められるよう、**アクセシビリティ**も一度だけ尋ねます。同じ場所で許可してください。

> [!NOTE]
> Windows PowerShell 5 では `&&` の代わりに `;` を使います。お使いのコンピューター向けのアニメーション付き手順：[インストールガイド](https://arthur031221.github.io/Blinkling/install/)。その他の方法、更新、Linux のサンドボックス：[docs/INSTALL.md](docs/INSTALL.md)。

## 読みながら使う

- **Ctrl を押しながらクリック**すると、段落、ボタン、画像を Blink が取ります。
- **Ctrl を押しながらドラッグ**すると、範囲を取ります。
- 小さな入力欄が開き、3 つのクイック質問が並びます。Enter でハイライトされたものを送信します。
- Blink をクリックすればいつでも話せます。答えは Blink の横に吹き出しで届きます。

![Blink をクリックして質問を入力すると、答えが吹き出しで返ります。](assets/ask.gif)

- Blink のメニューには、キャプチャ、ガイド、自動解説（オンにするまでオフ）、設定があります。
- 任意の Chrome/Edge 用ブラウザーヘルパーは、ページ自体の構造を提供するので、Blink は指した段落やボタンを把握できます。さらにページ全体のキャプチャ、ページのその場翻訳、PDF リーダーも使えます。ツールバーのボタンで接続状態を確認でき、Blink を呼び起こせます。ヘルパーがなくても、Blink はすべてのウィンドウで使えます。

## ショートカット

| ショートカット   | 操作                                   |
| ---------------- | -------------------------------------- |
| Ctrl + クリック  | ポインターの下にあるものについて尋ねる |
| Ctrl + ドラッグ  | 範囲を取る                             |
| 設定のホットキー | キャプチャオーバーレイを開く           |

キーは設定で選べます。

## セッションとプライバシー

Blink は選んだ内容を、あなた自身のサインイン済み Claude Code に送り、答えを Blink の横に吹き出しで表示します。同じ会話をターミナルで同時に使わないでください。

> [!IMPORTANT]
> ブラウザーヘルパーは、あなたが指したときだけそのページを読みます。パスワードや支払いの欄は一切読まず、あなたのコンピューター上の Blinkling とだけ通信します。自動解説はオンにするまでオフです。

テレメトリーも、公開元が運営する回答サービスもありません。選んだ内容はあなたの Claude Code に送られ、プロバイダーの規約と利用料金が適用されます。ブラウザー設定、拡張機能ストア、ブラウザー内蔵の PDF ビューアーは保護されたページで、そこでは Blink は画面から答えます。 [プライバシー](docs/SECURITY.md) | [使い方](docs/USAGE.md) | [リリースノート](docs/releases/v3.0.0.md)

Assisted by Claude/Codex.
