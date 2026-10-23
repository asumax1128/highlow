# HIGH×LOW Ver.1.0 リリース候補

Ver.0.1のゲームルールを維持し、オンラインランキングを追加した承認前の実装です。Google Apps Scriptの本番接続・正式公開はまだ行っていません。

## 利用する保存先

他ゲームで使われているGoogleスプレッドシート方式に合わせ、HIGH×LOW専用のApps Scriptとスプレッドシート用の実装を用意しました。[Google接続手順](docs/GOOGLE-SETUP.md)を参照してください。別ゲームの `ranking` シートと `doGet` / `doPost` は変更しません。

すぐにローカルでフル機能を確認したい場合は、Node.js 24以上で次を実行します。依存パッケージのインストールは不要です。

```sh
npm start
```

そのPCの `http://localhost:8080` を開き、RANKINGでニックネームを登録してからPLAYします。完走すると記録が自動反映されます。SQLiteデータは `data/rankings.sqlite` に保存されます。オンライン利用にはHTTPSのホスティングが必要です。

- 難易度：EASY / NORMAL / HARDごとに独立。
- 期間：日本時間の日次・月曜開始の週次・歴代。
- 各プレイヤー・難易度・期間で最高記録1件。上位100名と100位外も含めた自分の順位を表示。
- 同得点は正答率、平均回答時間の順。全項目が等しい場合は同順位（1,1,3方式）。
- 記録の所属期間はサーバーが最初に受理した時刻で確定。再送で日付を変えません。
- 名前は後から登録可能。登録済みの同じ識別情報の過去記録にも反映します。ニックネーム自体をユーザーIDとして扱いません。
- 毎回の完走を送信し、3期間それぞれで更新を判定します。歴代ベスト未満でも日次の記録を残せます。
- 通信失敗でもローカルゲームは遊べます。開始前のAPI接続に失敗した試合はランキング対象外と明示します。送信の失敗はリザルト画面から同じ試合を再送できます。未送信履歴のブラウザ再起動をまたぐ自動再送は未実装です。

## テストとビルド

```sh
npm test
npm run build:gas
python3 scripts/package-v1.py
python3 tests/browser-v1.py
```

ブラウザテストには既存のPython PlaywrightとChromiumを使います。ブラウザテスト自身が一時DBとサーバーを作り、終了時にサーバーを停止します。最初からある `tests/game.test.js` と `dist/engine.js` は変更していません。

`artifacts/HIGH-LOW-v1.0-rc.html` はオフライン確認用です。file://で開いた場合、ランキングAPIは利用できません。ランキングにはWeb配信版を使ってください。Ver.0.1のHTML・ZIPも上書きせず保持しています。

## Node APIの本番運用

`PUBLIC_ORIGIN` を実際のHTTPSオリジン、`NODE_ENV=production` を設定し、SQLite用の永続ボリュームを `HIGHLOW_DB` に指定します。TLS終端を持つリバースプロキシ経由で公開します。Dockerfileは同梱していますが、本環境ではコンテナビルド・デプロイは未実施です。

Node版はHttpOnly / Secure / SameSite=Lax Cookie、GAS版はlocalStorageのランダムトークンで匿名プレイヤーを識別します。本人確認を伴うアカウント認証ではありません。別端末での同一人物の統合やCookie削除後の復元はありません。

スプレッドシート版とSQLite版を同時に別DBとして運用するとランキングは共有されません。公開時にはどちらか一方に統一してください。

## 公平性

サーバー発行の試合ID・乱数シードを使い、同じ問題エンジンと採点処理で回答履歴を再生します。クライアントの申告得点は受け取りません。問題ID・順序・回答・時間範囲・制限時間を検証し、試合の経過実時間と整合することを確認します。

ただしシードはクライアントが受け取るため自動回答が可能であり、個別の回答時間はクライアント申告です。平均時間の改ざん、複数匿名ID、偽の中断なし履歴を完全には防ぎません。サーバー主導の問題配信やアカウント認証は未実装です。正式公開前にこの制限の確認が必要です。

## 主要ファイル

- `server/ranking-core.js`：期間・順位・履歴検証・登録の共通処理。
- `server/sqlite-repository.js`, `server/api.js`, `server/index.js`：ローカル/Nodeホスティング用API。
- `apps-script/adapter.js`, `apps-script/Code.gs`：スプレッドシート保存と生成済みGASコード。
- `dist/ranking-client.js`, `dist/config.js`：通信と実際の接続先の設定。
- `tests/ranking.test.js`：ランキング・API・クライアント・GASのテスト。
- `docs/GOOGLE-SETUP.md`：既存ゲームに触れない導入手順。
