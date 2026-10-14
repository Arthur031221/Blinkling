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

3. `chrome://extensions`（または `edge://extensions`）で**デベロッパーモード**を有効にします。**Load unpacked** を選び、**Show in Files / Finder** が開くフォルダーを指定します。自動接続後、バブルを開きます。

> [!NOTE]
> ローカルでは **Try without installing** で別の Chromium プロファイルを開けます。リモートの場合はブラウザー側の端末で表示された SSH コマンドを実行します。[インストールと更新](docs/INSTALL.md)。

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

- **画面全体を撮影**または**範囲を選択**。対応ページやバブルで Shift を押しながらドラッグし、Enter で確定、Esc で取消。共有画面のキャプチャ中はバブルが退避し、終了後に戻ります。
- **このページを案内**で概要を確認し、次へ／戻るで文章や操作部をたどれます。
- テキストを選んで質問・説明・翻訳。ページ内翻訳は元に戻せます。PDF は内蔵リーダーで開きます。
- **自動解説**は最大3つの質問を提案し、変更を要約します。Alt+P で一時停止。チャットには Opus、Sonnet、Haiku を選べます。

![arXiv：要旨を選択して質問し、繁体字中国語に翻訳。](assets/arxiv.gif)

_arXiv：要旨を選択して質問し、繁体字中国語に翻訳。_

実際の拡張機能、公開サイト、Claude Code の回答を録画しています。待ち時間は短縮していますが、ページや回答は作り物ではありません。

## ショートカット

| ショートカット | 操作                   |
| -------------- | ---------------------- |
| Alt+Shift+G    | バブルを開く           |
| Ctrl+Shift+S   | ブラウザー内で切り抜く |
| Ctrl+Shift+7   | 別のアプリから切り抜く |

macOS では Ctrl の代わりに Cmd を使います。`chrome://extensions/shortcuts` で変更できます。Shift は対応ページとバブル内でのみ使えます。

## セッションとプライバシー

検証済みの Claude Code ライブチャネルがあれば利用し、なければ別プロセスでプロジェクトの最新の保存済み会話を再開します。同じ履歴をターミナルで同時に操作しないでください。[チャネル設定と制限](docs/DESIGN.md#the-running-claude-code-conversation)。

> [!IMPORTANT]
> **自動解説**は同意とサイトアクセス許可後、**画面共有なし**でページの変更を要約できます。パスワード欄とブロックリストは自動要約・質問提案を一時停止させます。画面要約には検査した同じタブに結び付いたブラウザータブの共有と同じ検査を使います。モニターやアプリの共有には**共有ごとに個別の同意**が必要です。その画像内のパスワード欄やブロック対象サイトは検査できません。不明な共有元は停止したままです。
> 読み込み中またはアクセスできない埋め込みページも自動リクエストを停止させます。

テレメトリーや発行者の回答サービスはありません。選んだコンテキストと画像は自分のバックエンドに送られ、その利用条件と料金が適用されます。ネイティブアプリは画像のみ対応。設定画面、拡張機能ストア、保護されたページではページツールを使えません。ネイティブウィンドウの透明度やクリック透過にはブラウザーの制限があります。[プライバシー](docs/SECURITY.md) | [使い方](docs/USAGE.md) | [リリースノート](docs/releases/v2.1.0.md)

Assisted by Claude/Codex.
