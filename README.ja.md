<h1 align="center"><img src="assets/logo.svg" width="72" alt="" /><br /><picture><source media="(prefers-color-scheme: dark)" srcset="assets/brand/wordmark-dark.svg" /><img src="assets/brand/wordmark-light.svg" width="260" alt="Blinkling" /></picture></h1>

<p align="center"><strong>Blink は画面の隅に住んでいます。Ctrl を押しながらクリックすれば、答えが返ってきます。</strong></p>

<p align="center">
  <a href="https://github.com/Arthur031221/Blinkling/actions/workflows/ci.yml"><img src="https://github.com/Arthur031221/Blinkling/actions/workflows/ci.yml/badge.svg" alt="CI" /></a>
  <a href="https://github.com/Arthur031221/Blinkling/releases"><img src="https://img.shields.io/github/v/release/Arthur031221/Blinkling" alt="Release" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/github/license/Arthur031221/Blinkling" alt="License" /></a>
</p>

[English](README.md) | [繁體中文](README.zh-TW.md) | [简体中文](README.zh-CN.md) | [日本語](README.ja.md) | [한국어](README.ko.md) | [Español](README.es.md) | [Français](README.fr.md) | [Deutsch](README.de.md) | [Português](README.pt-BR.md)

Formerly Glimpselet。旧プラグインをお使いの方は、`/plugin uninstall glimpselet@glimpselet` と `/plugin marketplace remove glimpselet` を実行してから、下の手順で Blinkling をインストールしてください。

Blinkling は、小さな緑の相棒 Blink を画面の隅に置き、すべてのアプリの上に表示します。聞きたいものを **Ctrl**（macOS では Control）を押しながらクリックするか、ドラッグして範囲を選びます。選んだものは Blink に飛び込み、質問すると、答えは Blink の横のチャットカードに開きます。

> **安全な設計：** Blinkling は見て説明するだけ。クリックや入力、アプリの操作は一切しません。

このコンピュータでログイン済みの Claude Code を使います。

<table>
<tr>
<td width="33%" align="center"><img src="assets/pick.gif" width="320" alt="arXiv のページで Ctrl を押しながら段落をクリックします。そのスナップショットが Blink の口に飛び込み、チャットカードが開いて答えが流れます。"></td>
<td width="33%" align="center"><img src="assets/translate.gif" width="320" alt="アラビア語版ウィキペディアのページで選んだ一節を Blink に送り、翻訳を押すと、答えがその一節を英語で説明します。"></td>
<td width="33%" align="center"><img src="assets/tour.gif" width="320" alt="情報が密集した公開ページでガイドを押すと、ページの各部分に印が付きます。Blink は指示棒で現在のステップを指し、次へで進みます。"></td>
</tr>
<tr>
<td align="center">論文：Ctrl を押しながら段落をクリックし、答えを読む。</td>
<td align="center">翻訳：アラビア語の一節を英語で説明。</td>
<td align="center">ガイド：操作しにくいページを一歩ずつ。</td>
</tr>
</table>

## インストール

サインイン済みの Claude Code が必要です。続いて：

1. 次の 1 行をターミナルに貼り付けて Enter を押します：

   ```sh
   claude plugin marketplace add Arthur031221/Blinkling && claude plugin install blinkling@blinkling
   ```

2. ターミナルで、Blink チャンネル付きで Claude Code を起動します：

   ```text
   claude --dangerously-load-development-channels plugin:blinkling@blinkling
   ```

   このフラグで Blink のチャットがこのセッションに届きます。Claude Code が一度だけ確認を求めます。なくても Blink は動き、自分のセッションで答えます。

   続けて、そのセッションで実行します：

   ```text
   /blinkling:blinkling
   ```

3. Mac では、Blinkling の**画面収録**を一度だけ許可します：システム設定、プライバシーとセキュリティ。macOS は Ctrl キーで選択を始められるよう、**アクセシビリティ**も一度だけ尋ねます。同じ場所で許可してください。

> [!NOTE]
> Windows PowerShell 5 では `&&` の代わりに `;` を使います。お使いのコンピューター向けのアニメーション付き手順：[インストールガイド](https://arthur031221.github.io/Blinkling/install/)。その他の方法、更新、Linux のサンドボックス：[docs/INSTALL.md](docs/INSTALL.md)。

## 読みながら使う

- **Ctrl を押しながらクリック**すると、段落、ボタン、画像を Blink が取ります。
- **Ctrl を押しながらドラッグ**すると、範囲を取ります。
- 小さな入力欄が開き、3 つのクイック質問が並びます。Enter でハイライトされたものを送信します。
- Blink をクリックすればいつでも話せます。Blink の横にチャットカードが開き、会話が続きます。

![Blink をクリックして質問を入力すると、答えがチャットカードに流れ込みます。](assets/ask.gif)

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

Blink は選んだ内容を、あなた自身のサインイン済み Claude Code に送り、答えを Blink の横のチャットカードに表示します。Blink を起動したターミナルのセッションで入力した質問と完成した答えは、Blink のチャットに自動で表示されます。逆方向、つまり Blink のチャットをターミナルに出す部分は Claude Code の実験的な channels を使い、起動時にしか読み込めません。`claude --dangerously-load-development-channels plugin:blinkling@blinkling` で Claude Code を起動すると（`/blinkling:blinkling` が表示します）、両方にすべて表示されます。起動しない場合、Blink は自分のセッションから答えます。

> [!IMPORTANT]
> ブラウザーヘルパーは、あなたが指したときだけそのページを読みます。パスワードや支払いの欄は一切読まず、あなたのコンピューター上の Blinkling とだけ通信します。自動解説はオンにするまでオフです。

テレメトリーも、公開元が運営する回答サービスもありません。選んだ内容はあなたの Claude Code に送られ、プロバイダーの規約と利用料金が適用されます。ブラウザー設定、拡張機能ストア、ブラウザー内蔵の PDF ビューアーは保護されたページで、そこでは Blink は画面から答えます。 [プライバシー](docs/SECURITY.md) | [使い方](docs/USAGE.md) | [リリースノート](docs/releases/v3.2.1.md)

Assisted by Claude/Codex.
