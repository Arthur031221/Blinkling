<h1 align="center"><img src="assets/logo.svg" width="72" alt="" /><br /><picture><source media="(prefers-color-scheme: dark)" srcset="assets/wordmark-dark.svg" /><img src="assets/wordmark-light.svg" width="260" alt="Blinkling" /></picture></h1>

<p align="center"><strong>答えを、読んでいるページのそばに。</strong></p>

<p align="center">
  <a href="https://github.com/Arthur031221/Glimpselet/actions/workflows/ci.yml"><img src="https://github.com/Arthur031221/Glimpselet/actions/workflows/ci.yml/badge.svg" alt="CI" /></a>
  <a href="https://github.com/Arthur031221/Glimpselet/releases"><img src="https://img.shields.io/github/v/release/Arthur031221/Glimpselet" alt="Release" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/github/license/Arthur031221/Glimpselet" alt="License" /></a>
</p>

[English](README.md) | [繁體中文](README.zh-TW.md) | [简体中文](README.zh-CN.md) | [日本語](README.ja.md) | [한국어](README.ko.md) | [Español](README.es.md) | [Français](README.fr.md) | [Deutsch](README.de.md) | [Português](README.pt-BR.md)

Formerly Glimpselet。旧プラグインをお使いの方は、`/plugin uninstall glimpselet@glimpselet` と `/plugin marketplace remove glimpselet` を実行してから、下の手順で Blinkling をインストールしてください。

小さな Claude Code のフローティングチャット。ページについて質問し、範囲をキャプチャし、ガイドをたどり、文章を翻訳できます。

> [!TIP]
> ログイン済みの自分の Claude Code アカウントと、デスクトップ版 Chrome または Edge を使います。Claude Code に API キーは不要です。

![Google Flights：ページガイドを表示し、往復便の予約について質問。](assets/demo.gif)

_Google Flights：ページガイドを表示し、往復便の予約について質問。_

## インストール

1. Claude Code でプラグインをインストール：

   ```text
   /plugin marketplace add Arthur031221/Glimpselet
   /plugin install blinkling@blinkling
   ```

2. ウェルカムガイドを開く：

   ```text
   /blinkling:blinkling
   ```

3. `chrome://extensions`（または `edge://extensions`）で**デベロッパーモード**を有効にします。**Load unpacked** を選び、**Show in Files / Finder** が開くフォルダーを指定します。自動接続後、ツールバーの Blink ボタンをクリックして接続を確認します。

> [!NOTE]
> ブラウザーヘルパーは任意です。なくても Blink はどのウィンドウでも使えます。Chrome または Edge では `/blinkling:install` を実行し、手順 3 のとおり `~/Blinkling-extension` を読み込みます。[インストールと更新](docs/INSTALL.md)。

### 詳細設定: ソースから読み込む

<details>
<summary>ソースからの起動と手動更新</summary>

ソースからプラグインを起動するには、Node.js 22+ と新しいバージョンの Claude Code が必要です。既存のリポジトリのルートフォルダーをターミナルで開いている場合は、最初の 2 つのコマンドを省略してください。ターミナルで次のコマンドを実行します。

```sh
git clone https://github.com/Arthur031221/Glimpselet.git
cd Blinkling
npm ci
npm run build:plugin
claude plugin validate .
node -p "require('./.claude-plugin/plugin.json').version"
node -p "require('./dist-extension/manifest.json').version"
claude --plugin-dir "$PWD" plugin list
claude --plugin-dir "$PWD" plugin details blinkling
node -p "require('./bin/extension/manifest.json').version"
claude --plugin-dir "$PWD"
```

2 つのバージョン確認で、どちらも `2.1.0` と表示されることを確認してください。プラグイン一覧には、`blinkling@inline` のバージョン `2.1.0` がこのセッションで有効と表示されます。最後のコマンドで Claude Code が開いたら、そのセッションで `/blinkling:blinkling` を実行してウェルカムガイドを開きます。`--plugin-dir` は、このセッションだけでソースのプラグインを読み込みます。起動のたびにこのオプションを付け、`npm run build:plugin` で再ビルドしたら Claude Code を再起動してください。ビルドした拡張機能は `dist-extension` にあります。ウェルカムガイドが、以下の固定フォルダーにコピーします。

プラグインの詳細には、`blinkling` と `install` のスキル、および `blinkling` MCP サーバーも必要です。パッケージされた拡張機能は `bin/extension` にあり、そのバージョンも **2.1.0** であることを確認します。Claude Code がリモートで動く場合は、ガイドの SSH コマンドを使い、ブラウザーのある端末で拡張機能 ZIP をダウンロードして、展開したフォルダーを読み込んでください。

ブラウザーと Claude Code が同じ端末で動いている場合、ウェルカムガイドがビルドした拡張機能を固定フォルダー `~/Blinkling-extension` にコピーします。Chrome または Edge で `chrome://extensions` または `edge://extensions` を開き、**Developer mode** をオンにして **Load unpacked** を選び、このフォルダーを指定します。開発者向けの表示は残ります。新しいバージョンが出たら手動で更新してください。

展開済み拡張機能の更新では、古いバブルを閉じて `/blinkling:blinkling` を再実行し、固定フォルダーを更新してから拡張機能のカードで再読み込みします。Claude Code がリモートの場合は、ガイドから新しい ZIP をダウンロードし、ブラウザー側の展開済みファイルを置き換えて再読み込みしてください。 `~/Blinkling-extension` に移す際は、古い拡張機能のカードを削除し、このフォルダーを一度読み込んでください。

インストール済みのプラグインは以下で更新し、Claude Code で `/reload-plugins` と `/blinkling:blinkling` を実行します。プラグイン一覧と拡張機能のカードが **2.1.0** であることを確認してからバブルを開き直してください。

```sh
claude plugin marketplace update blinkling
claude plugin update blinkling@blinkling
claude plugin list
```

</details>

## 読みながら使う

- **Ctrl を押しながらクリック**すると、画面上の段落、ボタン、画像を Blink が取り、Claude Code に尋ねます。**Ctrl を押しながらドラッグ**すると範囲を取ります。
- 小さな入力欄が開き、3 つのクイック質問が並びます。Enter でハイライトされたものを送信します。Blink をクリックすればいつでも会話を再開できます。
- 答えは、話題の対象を指し示す吹き出しで届きます。Blink のメニューには、キャプチャ、ガイド、自動解説（オンにするまでオフ）、設定があります。
- 任意の Chrome/Edge 用ブラウザーヘルパーは、ページ自体の構造を提供するので、Blink は指した段落やボタンを把握できます。さらにページ全体のキャプチャ、ページのその場翻訳、PDF リーダーも使えます。ツールバーのボタンで接続状態を確認でき、Blink を呼び起こせます。ヘルパーがなくても、Blink はすべてのウィンドウで使えます。

## ショートカット

| ショートカット   | 操作                                   |
| ---------------- | -------------------------------------- |
| Ctrl + クリック  | ポインターの下にあるものについて尋ねる |
| Ctrl + ドラッグ  | 範囲を取る                             |
| 設定のホットキー | キャプチャオーバーレイを開く           |

キーは設定で選べます。

## セッションとプライバシー

Blink は選んだ内容を、あなた自身のサインイン済み Claude Code に送り、対象のそばに答えを表示します。同じ会話をターミナルで同時に使わないでください。

> [!IMPORTANT]
> ブラウザーヘルパーは、あなたが指したときだけそのページを読みます。パスワードや支払いの欄は一切読まず、あなたのコンピューター上の Blinkling とだけ通信します。自動解説はオンにするまでオフです。

テレメトリーも、公開元が運営する回答サービスもありません。選んだ内容はあなたの Claude Code に送られ、プロバイダーの規約と利用料金が適用されます。ブラウザー設定、拡張機能ストア、ブラウザー内蔵の PDF ビューアーは保護されたページで、そこでは Blink は画面から答えます。 [プライバシー](docs/SECURITY.md) | [使い方](docs/USAGE.md) | [リリースノート](docs/releases/v2.1.0.md)

Assisted by Claude/Codex.
