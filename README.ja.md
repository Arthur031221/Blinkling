<p align="center"><img src="assets/logo.svg" width="72" alt="Glimpselet の相棒 Blink"><br><strong>Glimpselet</strong><br><em>Blink は待つ。見たい場所を選ぶ。答えが返る。</em></p>

<p align="center"><a href="README.md">English</a>  |  <a href="README.zh-TW.md">繁體中文</a>  |  <a href="README.zh-CN.md">简体中文</a>  |  <a href="README.ko.md">한국어</a>  |  <a href="README.es.md">Español</a>  |  <a href="README.fr.md">Français</a>  |  <a href="README.de.md">Deutsch</a>  |  <a href="README.pt-BR.md">Português (Brasil)</a></p>

> 小さなフローティングパネルで、選んだ画面についてコーディングアシスタントに質問できます。フレームを固定し、切り抜きやマスクをして質問します。

<p align="center"><img src="assets/demo.gif" width="800" alt="テスト画像と録画済みの回答を表示する Glimpselet パネル"></p>

<p align="center"><a href="https://arthur031221.github.io/Glimpselet/">静的デモを見る</a>。テスト画像と録画済みの回答を表示します。回答サービスへのリクエストはありません。</p>

<p align="center"><img src="assets/screenshots/light-420.png" width="49%" alt="420 px のライトテーマ"><img src="assets/screenshots/dark-420.png" width="49%" alt="420 px のダークテーマ"></p>

<details>
<summary>6種類のサイズとテーマ</summary>

<p><img src="assets/screenshots/light-360.png" width="140" alt="ライトテーマのパネル 360 px"><img src="assets/screenshots/light-420.png" width="140" alt="ライトテーマのパネル 420 px"><img src="assets/screenshots/light-520.png" width="140" alt="ライトテーマのパネル 520 px"></p>
<p><img src="assets/screenshots/dark-360.png" width="140" alt="ダークテーマのパネル 360 px"><img src="assets/screenshots/dark-420.png" width="140" alt="ダークテーマのパネル 420 px"><img src="assets/screenshots/dark-520.png" width="140" alt="ダークテーマのパネル 520 px"></p>

</details>

フローティングモードにはデスクトップ版 Chromium ブラウザーが必要です。インストール前に Node.js 22 以降とコーディングアシスタントを用意してください。

次のスラッシュコマンド2つでプラグインをインストールします。

```text
/plugin marketplace add Arthur031221/Glimpselet
/plugin install glimpselet@glimpselet
```

続けて `/glimpselet:glimpse` を実行します。Node.js 22 以降が必要です。ブラウザー拡張機能は使いません。

## いつもの使い方

```text
/glimpselet:glimpse
ブラウザーの選択画面で画面、ウィンドウ、タブを選ぶ。
フレームを固定し、範囲を切り抜き、隠したい箇所を不透明マスクで覆う。
質問を入力し、ストリーミング回答を読んで追加質問する。
回答をコピーまたはピン留めし、終わったらローカルの状態を消す。
```

質問するか受動メモを有効にするまでは、画像は端末内にとどまります。不透明マスクは送信画像に適用されます。受動メモは2秒ごとにサンプルし、変化したフレームの短い説明を送信します。既定では1分あたり最大6件、1時間あたり最大360件です。これはリクエスト数の上限で、料金の目安ではありません。さらに低い上限も設定できます。

MCP の画面ツールは、呼び出されたときに画像をコーディングセッションへ返します。パネルの画像は、切り抜きとマスク処理の後で長辺 1536 ピクセル、総画素数 180 万ピクセルに制限されます。小さな選択領域は元の解像度を保ちます。

**共有を始めるのはあなたです。自動で画面を見始めることはありません。**

## 詳細

<details>
<summary>操作と状態</summary>

パネルのサイズ変更ボタンまたは矢印キーでサイズを変えられます。ブラウザーが対応していれば、ウィンドウの端をドラッグしてサイズを変えられます。切り抜きやマスクの選択中は、矢印キーで移動、Shift と矢印キーでサイズ変更、Enter で適用、Escape でキャンセルします。質問欄で Escape を押すとパッシブメモを一時停止し、入力内容を残したまま現在の質問を取り消します。設定はモーダルで開きます。以前の回答のピン留めを解除できます。**最後に送信した画面**は質問と一緒に送信した静止画を示します。**ライブプレビューを表示**すると、新しい質問を送らずに共有中の画面へ戻り、切り抜きとマスクも保持します。**パッシブメモを一時停止**すると、実行中の受動メモのストリーミング処理をキャンセルし、再開するまで次のメモも停止します。S/E/T/P のショートカットは画面プレビューにフォーカスがあるときだけ動作します。ボタンはキーボードでも操作できます。上へスクロールすると回答への追従を停止します。パネルには共有、モデル、受動メモの状態が表示されます。

比較の回答では表の見出しと列を保持します。横幅の広い表は回答内で横にスクロールできます。回答にフォーカスして矢印キーを使うと、他の列を読めます。

</details>

<details>
<summary>インストールと起動</summary>

上の2つのコマンドでプラグインを追加・インストールします。`/glimpselet:glimpse` はランダムポートでローカルパネルを開きます。一度だけ使えるリンクは60秒で期限切れになり、パネルのメモリー上のセッションは30分で終了します。ブラウザーの選択画面でディスプレイ、アプリウィンドウ、タブを選んでください。

</details>

<details>
<summary>質問、追加質問、確認</summary>

質問はインストール済みのコーディングアシスタントで処理するか、ローカルブリッジから任意の API に送信できます。制限付き CLI は通常のコマンドツールを取り除きますが、企業管理のフックは実行される場合があるため、OS レベルのサンドボックスではありません。インストール済み CLI と組織が設定したポリシーフックを信頼する必要があります。追加質問には上限付きの最近の会話履歴を含められます。切り抜き、フレーム固定、不透明マスク、コピー、ピン留め、過去10分のタイムライン、要約、Markdown 書き出しに対応しています。要約では既存の受動メモを使い、新しい画像は送信しません。「Clear」は処理を中止し、ローカルのフレーム、メモ、履歴、メモリー上の API キーを削除します。

</details>

<details>
<summary>フローティングウィンドウとブラウザー</summary>

対応するデスクトップ Chromium ブラウザーでは Document Picture-in-Picture を利用できます。このウィンドウの配置はブラウザーが制御します。コンパクトと展開のサイズ、ポップアップ位置、ウィンドウ枠は、ジオメトリだけを保存するローカルファイルとブラウザーキャッシュに保存され、ブリッジがランダムポートで再起動しても引き継がれます。保存先は[設定](docs/CONFIGURATION.md)を参照してください。保存先が使えない場合、設定の保存はベストエフォートです。

</details>

<details>
<summary>ソースから開発</summary>

Node.js 22 以降を用意し、`npm ci`、`npm run build`、`npm run build:plugin` を実行します。確認項目は[コントリビューションガイド](CONTRIBUTING.md)を参照してください。静的デモはテスト画像と録画済みの文章を使い、回答サービスを呼び出しません。

</details>

## 制限

ブラウザー共有中の MCP キャプチャは、その共有画像を使います。共有が切断されたり応答しない場合は失敗として扱い、マスクされていないネイティブ画像に置き換えません。共有が切断されても共有の意図は残り、「Stop sharing」を明示的に選ぶか、「Clear」でローカルデータを消去するか、セッションが期限切れになるまでネイティブキャプチャには切り替わりません。その後のネイティブキャプチャは OS 権限とプラットフォームのツールに依存します。macOS は画面・ウィンドウ・範囲、Windows は画面に対応し、Linux は Wayland または X11 用ツールの有無によります。ポップアップが最前面にとどまる保証はありません。パスワード、カーソル位置、ウィンドウ名を確実に読み取ることはできません。送信前に画像を確認してください。

別の `screen_watch_start` MCP ツールは5〜60秒間隔で順番に取得し、変化したフレームだけを保持します。モデル呼び出しはありません。2秒ごとに説明を作るパネルの受動メモとは別の機能です。

[使い方](docs/USAGE.md) | [インストール](docs/INSTALL.md) | [設定](docs/CONFIGURATION.md) | [構成](docs/ARCHITECTURE.md) | [安全とプライバシー](docs/SECURITY.md) | [プラグイン構成](docs/PLUGIN.md) | [貢献](CONTRIBUTING.md) | [MIT ライセンス](LICENSE)

## Disclosure

Assisted by Claude/Codex.
