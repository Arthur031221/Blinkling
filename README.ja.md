# Glimpselet

[English](README.md) · [繁體中文](README.zh-TW.md) · [简体中文](README.zh-CN.md) · [日本語](README.ja.md) · [한국어](README.ko.md) · [Español](README.es.md) · [Français](README.fr.md) · [Deutsch](README.de.md) · [Português](README.pt-BR.md)

表示中のページや画面について Claude Code に質問できる、小さなフローティングチャットです。Web ページの閲覧や翻訳、ページ上の操作案内、範囲キャプチャへの質問ができます。

|           Glimpselet のフローティングチャット           |                 ページ上のガイド例                  |
| :-----------------------------------------------------: | :-------------------------------------------------: |
| ![Glimpselet のフローティングチャット](assets/demo.gif) | ![ページ上のガイド例](assets/screenshots/guide.png) |

必要なもの：新しいバージョンの Claude Code、自分のサブスクリプションアカウントでのログイン、Chrome や Edge などのデスクトップ Chromium ブラウザー。

Glimpselet は利用可能な Claude Code のライブセッションに接続します。それ以外は現在のプロジェクトの最新の会話を自動で続行し、保存済みの会話がなければ新しく作成します。[セッションの設定と制限](docs/DESIGN.md#the-running-claude-code-conversation)。

## インストール

1. Claude Code にマーケットプレイスを追加し、プラグインをインストールします。

   ```text
   /plugin marketplace add Arthur031221/Glimpselet
   /plugin install glimpselet@glimpselet
   ```

2. ターミナルの `claude plugin list` で Glimpselet が **2.1.0** であることを確認し、Claude Code で `/glimpselet:glimpse` を実行します。

3. ようこそページの手順は3つです。拡張機能をインストールし、自動接続して、バブルを開きます。ローカルのデスクトップでは **インストールせずに試す** を選ぶか、自分のブラウザーに拡張機能を読み込んでください。Claude Code がリモートホストで動く場合は、ブラウザーのあるPCでターミナルに表示された SSH コマンドを実行し、ZIP をダウンロードして読み込みます。バブルには **あなたの Claude Code に接続済み** と表示されます。[接続の詳細](docs/INSTALL.md)をご覧ください。

### 詳細設定: ソースから読み込む

ソースからプラグインを起動するには、Node.js 22+ と新しいバージョンの Claude Code が必要です。既存のリポジトリのルートフォルダーをターミナルで開いている場合は、最初の 2 つのコマンドを省略してください。ターミナルで次のコマンドを実行します。

```sh
git clone https://github.com/Arthur031221/Glimpselet.git
cd Glimpselet
npm ci
npm run build:plugin
claude plugin validate .
node -p "require('./.claude-plugin/plugin.json').version"
node -p "require('./dist-extension/manifest.json').version"
claude --plugin-dir "$PWD" plugin list
claude --plugin-dir "$PWD" plugin details glimpselet
node -p "require('./bin/extension/manifest.json').version"
claude --plugin-dir "$PWD"
```

2 つのバージョン確認で、どちらも `2.1.0` と表示されることを確認してください。プラグイン一覧には、`glimpselet@inline` のバージョン `2.1.0` がこのセッションで有効と表示されます。最後のコマンドで Claude Code が開いたら、そのセッションで `/glimpselet:glimpse` を実行してウェルカムガイドを開きます。`--plugin-dir` は、このセッションだけでソースのプラグインを読み込みます。起動のたびにこのオプションを付け、`npm run build:plugin` で再ビルドしたら Claude Code を再起動してください。ビルドした拡張機能は `dist-extension` にあります。ウェルカムガイドが、以下の固定フォルダーにコピーします。

プラグインの詳細には、`glimpse` と `install` のスキル、および `glimpselet` MCP サーバーも必要です。パッケージされた拡張機能は `bin/extension` にあり、そのバージョンも **2.1.0** であることを確認します。Claude Code がリモートで動く場合は、ガイドの SSH コマンドを使い、ブラウザーのある端末で拡張機能 ZIP をダウンロードして、展開したフォルダーを読み込んでください。

ブラウザーと Claude Code が同じ端末で動いている場合、ウェルカムガイドがビルドした拡張機能を固定フォルダー `~/Glimpselet-extension` にコピーします。Chrome または Edge で `chrome://extensions` または `edge://extensions` を開き、**Developer mode** をオンにして **Load unpacked** を選び、このフォルダーを指定します。開発者向けの表示は残ります。新しいバージョンが出たら手動で更新してください。

展開済み拡張機能の更新では、古いバブルを閉じて `/glimpselet:glimpse` を再実行し、固定フォルダーを更新してから拡張機能のカードで再読み込みします。Claude Code がリモートの場合は、ガイドから新しい ZIP をダウンロードし、ブラウザー側の展開済みファイルを置き換えて再読み込みしてください。 `~/Glimpselet-extension` に移す際は、古い拡張機能のカードを削除し、このフォルダーを一度読み込んでください。

## すでに Glimpselet を使っている場合

Claude Code が動いているコンピューターのターミナルで次のコマンドを実行します。マーケットプレイスの更新だけでは、インストール済みプラグインの更新は保証されません。

```sh
claude plugin marketplace update glimpselet
claude plugin update glimpselet@glimpselet
claude plugin list
```

開いている Claude Code で `/reload-plugins` を実行するか再起動し、`/glimpselet:glimpse` を実行します。一覧の `glimpselet@glimpselet` が **2.1.0** で、ウェルカム・ペアリングガイドが開くことを確認してください。ブラウザー側の `chrome://extensions` または `edge://extensions` でも Glimpselet が **2.1.0** か確認します。まだ 1.1.1 なら、公開マーケットプレイスに v2 が未公開の可能性があります。古い画面選択ページは v2 のガイドではありません。[更新の確認](docs/DESIGN.md#plugin-upgrades-and-release-verification)。

## できること

- Opus、Sonnet、Haiku のストリーミング返信を受け取り、追加の質問もできます。
- 共有画面を全画面表示でキャプチャするか、ページ上のオーバーレイで範囲を切り取れます。Shift を押しながらドラッグし、Enter でキャプチャ、Esc でキャンセルします。
- ページの変化に合わせて更新される質問候補を表示します。
- オプションの Passive 要約を有効にし、Alt+P で一時停止できます。時間あたりのコストも確認できます。
- ページ上の実際の操作箇所にガイドを表示します。文章をその場で翻訳し、Restore で元に戻せます。
- テキストを選択して説明、翻訳、質問ができます。内蔵リーダーで PDF を開いて質問することもできます。

![このページを案内](assets/guide.gif)

![選択した範囲](assets/crop.gif)

| ショートカット                         | 操作                                                                             |
| -------------------------------------- | -------------------------------------------------------------------------------- |
| Alt+Shift+G                            | Glimpselet を開き、**Float** を選んでフローティングチャットを開きます。          |
| Ctrl+Shift+S（macOS では Cmd+Shift+S） | 現在のページまたは共有画面を切り取ります。                                       |
| Ctrl+Shift+7（macOS では Cmd+Shift+7） | どのアプリからでも切り取ります。`chrome://extensions/shortcuts` で変更できます。 |
| Shift を押し続ける                     | Glimpselet のバブルまたはページで切り取りを開始します。                          |
| Alt+P                                  | Passive 要約を一時停止します。                                                   |

macOS では Cmd+Shift+5 でシステムのスクリーンショットツールが開きます。Shift は Glimpselet にアクセスを許可した Web ページで使えます。Web ページは他のアプリのキー入力を受け取れません。

最初の操作は **Float** です。ページへのアクセスが必要な機能を使うときに、拡張機能が許可を求めます。自分の Claude Code ログインを使う場合、プロバイダーの API キーは不要です。直接 API モードは任意で、自分の API キーが必要です。

## Claude Code セッション

Channel プレビューのコマンドと設定は[Claude Code セッション](docs/DESIGN.md#the-running-claude-code-conversation)を参照してください。channel を使わない場合、現在のプロジェクトの最新セッションを別プロセスで自動的に続行します。これは並行続行です。同じセッションをターミナルでも同時に使用しないでください。競合する可能性があります。

## 制限とプライバシー

Glimpselet はデスクトップ版 Chrome、Edge、その他の Chromium ブラウザーに対応します。ストア配布が始まるまでは開発者向けの表示があり、更新は手動です。設定画面、拡張機能ストア、アクセス制限されたページなど、一部のページにはアクセスできません。Chrome 内蔵 PDF ビューアーは読み取れないため、Glimpselet リーダーを使ってください。ネイティブアプリから取得できるのは画像だけで、ページテキストやオーバーレイは利用できません。Shift はバブルとアクセスを許可したページで使えます。他のアプリではグローバル切り取りショートカットを使ってください。フローティングウィンドウはクリックを透過しません。

自動の質問候補は、同意した場合だけページ情報を使います。画面共有なしでページの要約を受け取るには、ページを開いて **Passive** をオンにし、求められたらそのサイトへの Glimpselet のアクセスを許可します。Glimpselet はページのテキストを検査し、内容や URL の変更を要約できます。パスワード欄やブロックリストのサイトでは自動要約と質問候補が停止します。

画面共有中の画面変化による自動要約には、検査した同じタブに結び付いたブラウザータブの共有、ページへのアクセス権、同じプライバシーチェックが必要です。共有元がウィンドウ、画面全体、ネイティブアプリ、不明またはアクセスできない場合は、自動要約が停止します。手動の質問とキャプチャは引き続き使えます。

[インストールガイド](docs/INSTALL.md) | [使い方](docs/USAGE.md) | [設計](docs/DESIGN.md) | [プライバシー詳細](docs/SECURITY.md)

Assisted by Claude/Codex.
