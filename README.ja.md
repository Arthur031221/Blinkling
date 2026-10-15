<h1 align="center"><img src="assets/logo.svg" width="72" alt="" /><br /><picture><source media="(prefers-color-scheme: dark)" srcset="assets/wordmark-dark.svg" /><img src="assets/wordmark-light.svg" width="260" alt="Blinkling" /></picture></h1>

<p align="center"><strong>答えを、読んでいるページのそばに。</strong></p>

<p align="center">
  <a href="https://github.com/Arthur031221/Glimpselet/actions/workflows/ci.yml"><img src="https://github.com/Arthur031221/Glimpselet/actions/workflows/ci.yml/badge.svg" alt="CI" /></a>
  <a href="https://github.com/Arthur031221/Glimpselet/releases"><img src="https://img.shields.io/github/v/release/Arthur031221/Glimpselet" alt="Release" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/github/license/Arthur031221/Glimpselet" alt="License" /></a>
</p>

[English](README.md) | [繁體中文](README.zh-TW.md) | [简体中文](README.zh-CN.md) | [日本語](README.ja.md) | [한국어](README.ko.md) | [Español](README.es.md) | [Français](README.fr.md) | [Deutsch](README.de.md) | [Português](README.pt-BR.md)

Formerly Glimpselet。旧プラグインをお使いの方は、`/plugin uninstall glimpselet@glimpselet` と `/plugin marketplace remove glimpselet` を実行してから、下の手順で Blinkling をインストールしてください。

Blink は画面の隅にいる小さな相棒です。Ctrl を押しながら何かをクリックすると、Claude Code に質問できます。

> [!TIP]
> Blink は、同じコンピューターでサインイン済みの Claude Code を使います。

## インストール

1. Claude Code でプラグインをインストール：

   ```text
   /plugin marketplace add Arthur031221/Glimpselet
   /plugin install blinkling@blinkling
   ```

2. Blink を呼び出します。初回は 3 ステップのウェルカムが表示されます：

   ```text
   /blinkling:blinkling
   ```

3. 任意。ページ構造の取得、ページ全体のキャプチャ、その場での翻訳、PDF リーダーを使う場合：`/blinkling:install` を実行し、`chrome://extensions`（または `edge://extensions`）で**デベロッパーモード**を有効にして、**パッケージ化されていない拡張機能を読み込む**（Load unpacked）から `~/Blinkling-extension` を選びます。

> [!NOTE]
> 補助拡張機能は任意です。なくても Blink は動きます。[インストールとアップデート](docs/INSTALL.md)。

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

2 つのバージョン確認コマンドはどちらも **2.1.0** を出力し、プラグイン一覧には `blinkling@inline` が **2.1.0** で、このセッションで有効と表示される必要があります。最後のコマンドで開いた Claude Code セッションで `/blinkling:blinkling` を実行します。`--plugin-dir` はそのセッションだけチェックアウトを読み込みます。ソースから Claude Code を起動するたびに指定し、再ビルド後はセッションを再起動してください。ビルド済みの拡張機能はチェックアウト内の `dist-extension` にあります。

プラグインの詳細にも `blinkling` と `install` のスキル、`blinkling` MCP サーバーが含まれる必要があります。パッケージ済みの拡張機能は `bin/extension` にあり、バージョンも **2.1.0** になります。

ブラウザー補助拡張機能は任意です。`/blinkling:install` を実行すると、ビルド済みの拡張機能が固定フォルダー `~/Blinkling-extension` にコピーされます。Chrome または Edge で `chrome://extensions` か `edge://extensions` を開き、**Developer mode** を有効にして **Load unpacked** を選び、そのフォルダーを指定します。開発者向けの警告バナーは表示されたままで、新しいバージョンは手動で更新する必要があります。

パッケージ化されていない拡張機能を更新したら、もう一度 `/blinkling:install` を実行して固定フォルダーを更新し、拡張機能ページのカードで「再読み込み」を押します。`~/Blinkling-extension` に切り替えるときは、古い拡張機能カードを削除してから、このフォルダーを一度読み込んでください。

インストール済みのプラグインは、次のコマンドを実行してから、Claude Code で `/reload-plugins` と `/blinkling:blinkling` を実行します。プラグイン一覧と拡張機能カードの両方が **2.1.0** であることを確認してください。

```sh
claude plugin marketplace update blinkling
claude plugin update blinkling@blinkling
claude plugin list
```

</details>

## 読みながら使う

- **ポインターの下のものについて聞く。**Ctrl を押しながらクリックするか、ドラッグして範囲を選びます。選んだものは Blink に飛び込み、ミニコンポーザーが開きます。Enter で送信します。
- **Blink と話す。**Blink をクリックすると、ミニコンポーザーで直前の会話を続けられます。長いメッセージや Shift+Enter でフルコンポーザーに広がります。
- **吹き出しで答える。**吹き出しは話題にしているものを指します。Blink の上でホイールを回すと、以前の吹き出しを読み返せます。
- **メニュー。**Blink にポインターを重ねると開きます：キャプチャ、ガイド、自動解説、設定。ガイドはページ上に手順の番号を付け、Markdown として保存できます。自動解説は初期状態でオフで、吹き出しは最大 2 つ、マークは描きません。
- **ブラウザー補助拡張機能（任意）。**ツールバーのポップアップで接続状況を確認でき、**Wake Blink** ボタンがあります。Blink がページ構造を読み取り、ページ全体をキャプチャし、その場でページを翻訳し、PDF をリーダーで開けるようになります。

キャプチャにはグローバルホットキー Ctrl+Shift+S（macOS は Cmd）もあり、設定で変更できます。

## プライバシー

Blink は、このコンピューターでサインインしている Claude Code に質問し、あなたが頼むまで何もキャプチャしません。テレメトリーも、提供元が運営する回答サービスもありません。選んだコンテキストとキャプチャは Claude Code とそのプロバイダーに送られ、プロバイダーの利用規約と利用料金が適用されます。補助拡張機能は `127.0.0.1` 上のブリッジとだけ通信し、パスワード欄や入力値は読み取りません。自動解説は、オンにするまでオフのままです。

[プライバシーの詳細](docs/SECURITY.md) | [使い方](docs/USAGE.md) | [機能一覧](docs/FEATURES.md) | [リリースノート](docs/releases/v2.1.0.md)

Assisted by Claude/Codex.
