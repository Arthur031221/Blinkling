# Glimpselet

[English](README.md) · [繁體中文](README.zh-TW.md) · [简体中文](README.zh-CN.md) · [日本語](README.ja.md) · [한국어](README.ko.md) · [Español](README.es.md) · [Français](README.fr.md) · [Deutsch](README.de.md) · [Português](README.pt-BR.md)

表示中のページや画面について Claude Code に質問できる、小さなフローティングチャットです。Web ページの閲覧や翻訳、ページ上の操作案内、範囲キャプチャへの質問ができます。

|           Glimpselet のフローティングチャット           |                 ページ上のガイド例                  |
| :-----------------------------------------------------: | :-------------------------------------------------: |
| ![Glimpselet のフローティングチャット](assets/demo.gif) | ![ページ上のガイド例](assets/screenshots/guide.png) |

必要なもの：新しいバージョンの Claude Code、自分のサブスクリプションアカウントでのログイン、Chrome や Edge などのデスクトップ Chromium ブラウザー。

Glimpselet は専用の会話を開始します。最近の Claude Code セッションを選ぶと、別のプロセスで続行できます。ターミナルで開いている対話セッションに送るには、channel プレビューを有効にしてください。[Channel の設定](docs/DESIGN.md#the-running-claude-code-conversation)。

## インストール

1. Claude Code にマーケットプレイスを追加し、プラグインをインストールします。

   ```text
   /plugin marketplace add Arthur031221/Glimpselet
   /plugin install glimpselet@glimpselet
   ```

2. ターミナルの `claude plugin list` で Glimpselet が **2.0.0** であることを確認し、Claude Code で `/glimpselet:glimpse` を実行します。

3. ウェルカムガイドに従ってブラウザーを接続します。ローカルのデスクトップでは **Try without installing** を選ぶか、自分のブラウザーに拡張機能を読み込んでペア設定します。Claude Code がリモートホストで動作している場合は、ガイドの SSH コマンドをブラウザーのあるコンピューターで実行し、そのコンピューターで ZIP をダウンロードして拡張機能を読み込みます。リモートホストではインストール不要のブラウザーは使えません。ペア設定が成功すると、Glimpselet パネルに接続モードとプロジェクトが表示されます。

### 詳細設定: ソースから読み込む

自分のデスクトップブラウザーでは、拡張機能は固定フォルダー `~/.glimpselet/extension` にあります。Chrome または Edge で `chrome://extensions` または `edge://extensions` を開き、**Developer mode** をオンにして **Load unpacked** を選び、このフォルダーを指定します。開発者向けの表示は残ります。新しいバージョンが出たら手動で更新してください。

展開済み拡張機能の更新では、古いバブルを閉じて `/glimpselet:glimpse` を再実行し、固定フォルダーを更新してから拡張機能のカードで再読み込みします。Claude Code がリモートの場合は、ガイドから新しい ZIP をダウンロードし、ブラウザー側の展開済みファイルを置き換えて再読み込みしてください。

## すでに Glimpselet を使っている場合

Claude Code が動いているコンピューターのターミナルで次のコマンドを実行します。マーケットプレイスの更新だけでは、インストール済みプラグインの更新は保証されません。

```sh
claude plugin marketplace update glimpselet
claude plugin update glimpselet@glimpselet
claude plugin list
```

開いている Claude Code で `/reload-plugins` を実行するか再起動し、`/glimpselet:glimpse` を実行します。一覧の `glimpselet@glimpselet` が **2.0.0** で、ウェルカム・ペアリングガイドが開くことを確認してください。ブラウザー側の `chrome://extensions` または `edge://extensions` でも Glimpselet が **2.0.0** か確認します。まだ 1.1.1 なら、公開マーケットプレイスに v2 が未公開の可能性があります。古い画面選択ページは v2 のガイドではありません。[更新の確認](docs/DESIGN.md#plugin-upgrades-and-release-verification)。

パッケージ化されていない拡張機能では、ガイドが新しいファイルを `~/.glimpselet/extension` にコピーします。`chrome://extensions` または `edge://extensions` で Glimpselet を再読み込みし、バージョンが **2.0.0** であることを確認してください。SSH の場合は、ブラウザーのある端末でガイドから新しい ZIP をダウンロードし、以前読み込んだフォルダーに展開して再読み込みします。リモートホストから手元の端末にインストール不要のブラウザーを開くことはできません。

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

Channel プレビューのコマンドと設定は[Claude Code セッション](docs/DESIGN.md#the-running-claude-code-conversation)を参照してください。channel を使わない場合、選択したセッションを別プロセスで続行できます。これは並行続行です。同じセッションをターミナルでも同時に使用しないでください。競合する可能性があります。

## 制限とプライバシー

Glimpselet はデスクトップ版 Chrome、Edge、その他の Chromium ブラウザーに対応します。ストア配布が始まるまでは開発者向けの表示があり、更新は手動です。設定画面、拡張機能ストア、アクセス制限されたページなど、一部のページにはアクセスできません。Chrome 内蔵 PDF ビューアーは読み取れないため、Glimpselet リーダーを使ってください。ネイティブアプリから取得できるのは画像だけで、ページテキストやオーバーレイは利用できません。Shift はバブルとアクセスを許可したページで使えます。他のアプリではグローバル切り取りショートカットを使ってください。フローティングウィンドウはクリックを透過しません。

自動の質問候補がページ情報を使うのは、同意した場合だけです。受動的な要約は任意で、検査可能なブラウザータブを共有している必要があります。共有元がウィンドウ、画面、ネイティブアプリ、不明なソース、またはアクセスできないページの場合、自動要約は一時停止します。手動の質問とキャプチャは引き続き使えます。

[インストールガイド](docs/INSTALL.md) | [使い方](docs/USAGE.md) | [設計](docs/DESIGN.md) | [プライバシー詳細](docs/SECURITY.md)

Assisted by Claude/Codex.
