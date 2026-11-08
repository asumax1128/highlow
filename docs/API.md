# HIGH×LOW ranking API v1（エンジン high-low-0.2）

Node版は同一オリジンの `POST /api/ranking`、GAS版は実際に作成したWebアプリの `/exec` を使います。接続先や認証情報を推測してコードに埋め込んではいけません。

Node版のContent-Typeはapplication/json、GAS版はプリフライトを避けるtext/plainです。いずれも本体はJSON。Node版はCookie、GAS版は本体のtokenで識別します。

```json
{"action":"ranking","data":{"difficulty":"NORMAL","period":"daily"}}
```

| action | data | 主な応答 |
|---|---|---|
| profile | `{}`、`{nickname}`、`{hidden}`、`{nickname,hidden}` | `player.nickname`, `player.hidden`, `registered`。GASのみ識別トークンも返す |
| start | `{difficulty,engineVersion,countdown}` | `runId`, `seed`, `engineVersion`, `countdown` |
| submit | `{runId,completed:true,answers:[{questionId,choice,elapsed}],finalElapsed}` | サーバー再計算のscore/correct/wrong、期間別updated、periodKeys |
| ranking | `{difficulty,period}` | 上位100行（`rank`,`nickname`,`hidden`,`score`,`accuracy`,`averageMs`,`isMe`）、me、totalPlayers、期間、サーバー時刻 |

- difficultyはEASY/NORMAL/HARD、periodはdaily/weekly/all。
- **engineVersion**（段階2）：クライアントの `ENGINE_VERSION`（`dist/engine.js` が正。現在 `high-low-0.2`）。欠落・不一致は `ENGINE_VERSION`（409）で拒否し、run を作りません。クライアントは「ページを再読み込みしてください」と表示して開始を止めます。
- **countdown**（段階2）：`first`（初回：600ms×3＋GO 200ms＝2.0秒）または `retry`（RETRY：300ms×3＋GO 200ms＝1.1秒）。run に保存し、最低経過時間の計算に使います。それ以外の値は `INVALID_REQUEST`。
- elapsedはその問題でPLAYINGだった実時間のミリ秒。演出は含めません。**150ms未満は `TOO_FAST`**（段階2。クライアントも150ms未満の回答を無視します）。
- **finalElapsed**（段階2）：時間切れの瞬間に表示されていた最後の問題の経過時間（ミリ秒）。`Σelapsed + finalElapsed` が30,000msと±5ms以内で一致しない場合、または欠落している場合は **`INCOMPLETE_HISTORY`**（履歴の途中切り捨て対策）。
- 得点・正解・コンボなどの申告フィールドは受け付けません。
- 試合はサーバー発行から10分で期限切れ（`EXPIRED`）。受付時間は `minimumWallMs` ＝「カウントダウン（2.0秒／1.1秒）＋30秒＋回答ごとの入力遮断（正解180ms／誤答500ms）」から50msを差し引いた時刻以降（それより早ければ `TOO_EARLY`）、60秒の通信・描画猶予内（超えたら `TIMING_MISMATCH`）。計算はクライアントと同じ `dist/engine.js` の関数を使います。各回答時間の真正性は保証しません。
- 記録は初回受付時の日本時間の日付・月曜開始週へ割り当てます。日付をクライアントから指定できません。
- 同一runIdで同じ履歴を再送した場合は同じ記録として処理します。別履歴での再送はDUPLICATEです。
- 書き込み系（profile/start/submit）はSQL版はトランザクション、GAS版はスクリプトロックで直列化します。GAS版の複数行書き込みはACIDではなく、部分失敗後の再送で3期間のベストを修復します。
- **ranking（読み取り）はロック・トランザクションを取らず、ストレージにも書き込みません**（段階3）。結果は難易度×期間（×期間キー）ごとに**15秒キャッシュ**（GASはCacheService、Nodeはメモリ）します。提出時には無効化しないため、最大15秒古い表示になることがあります。名前・非表示設定の変更時だけ現在のキャッシュを破棄します。トークンの照合も60秒キャッシュするため、キャッシュが効いている間はシートを読みません。
- 上位100名の切り口は100レコードです。100位に完全同点が複数いても100名を超えて返しません。順位そのものは全プレイヤーを対象に計算し、本人が100位外でもmeで返します。
- 完全同点の表示順だけは受付時刻、内部プレイヤーIDの順で安定させます。順位を分けるためには使いません。
- ニックネーム未登録の匿名記録は保存しますが表示対象から除きます。後で登録すると同じ匿名IDの記録を表示します。
- **hidden**（段階3）：`true` のプレイヤーは一覧で名前の代わりに「非公開プレイヤー」と表示します（`hidden:true`。順位・得点・正答率・平均は表示）。
- **ニックネームの禁止語**（段階3）：サーバー定数 `BANNED_WORDS`（名前のどこかに含む）／`BANNED_EXACT`（名前全体が一致）。NFKC・小文字化・カタカナ→ひらがな・空白記号除去の後に照合し、該当すれば `BANNED_NAME`。
- **引き継ぎコード**（段階3、GAS版のみ）：クライアントの設定画面で、識別トークンをコードとして表示・入力できます。入力されたコードは `profile`（`{}`）をそのトークンで呼んでサーバーが検証し、成功したときだけそのブラウザの識別情報を置き換えます。Node版はHttpOnly Cookieのため対象外です。
- **壊れた行**（段階3）：JSONとして読めない行や形の正しくない行は読み飛ばし、APIは継続します。GAS版は書き込み系（ロック中）で `HIGHLOW_v1_quarantine` シートへ写し（同じ行は6時間に1回まで）、読み取り系は実行ログにだけ残します。元の行は変更しません。

## エラー

```json
{"error":{"code":"RATE_LIMIT","message":"連続した操作が多すぎます。少し待って再試行してください。"}}
```

| code | 意味 |
|---|---|
| ENGINE_VERSION | クライアントまたは run のエンジン版が現行と違う。ページの再読み込みが必要 |
| TOO_FAST | 150ms未満の回答時間を含む |
| INCOMPLETE_HISTORY | `finalElapsed` が無い、または回答時間の合計が30秒にならない |
| TOO_EARLY / TIMING_MISMATCH | 最低経過時間より早い／60秒の猶予を超えた（クライアントは「時間が経ったため登録できません」と表示） |
| EXPIRED | 発行から10分を過ぎた run（同上） |
| BANNED_NAME | 禁止語を含むニックネーム |
| INVALID_NAME / INVALID_REQUEST / INVALID_HISTORY / INVALID_ANSWER / TIME_LIMIT / DUPLICATE / RUN_NOT_FOUND | 入力の誤り |
| UNAUTHORIZED | トークンが無い・無効 |
| RATE_LIMIT / BUSY | 制限超過／ロック待ち |

Node版は400/401/403/404/409/410/413/415/422/429/500等を返します。GAS ContentService版はHTTPステータスを自由に指定できないため、JSONのerrorも必ず確認します。

クライアントは通信エラーを表示し、試合開始に失敗した場合は記録対象外のローカルプレイを続行します（`ENGINE_VERSION` の場合だけは開始を止めます）。提出の通信失敗は自動で最大3回（1秒・3秒・3秒間隔）再送し、その後は画面（リザルト・タイトル・ランキング）の再送ボタンで再試行できます。期限切れ系は再送しません。通信失敗を登録成功として扱いません。

## 制限

段階2以降、レート制限は「トークンの検証前」と「検証後」で分かれます。

- **検証前（共有の1枠）**：トークンなしでの識別情報の新規作成と、無効なトークンによるリクエストは、全体で共有する1つの枠（120回/分）で数えます。保存先はキャッシュ（GASはCacheService、Nodeはメモリ）で、**シート／DBに行を作りません**。
- **検証後（プレイヤーごと）**：書き込み系は1プレイヤーにつき操作120回/分（`requests:` 行としてlimitsに保存）、試合開始6回/分、提出12回/分、名前・非表示の変更5回/分。
- **ranking（段階3）**：プレイヤーごとに120回/分をキャッシュで数え、limitsには書きません。

固定窓方式のため窓の境界では一時的に上限の約2倍の操作が可能です。期限切れの runs/limits は日次の `cleanupHighLow`（GAS、残す行を一括で書き戻し）または1時間ごとの `prune`（Node）で削除します。

Node版がリバースプロキシの後ろにある場合は、未検証のX-Forwarded-Forを信頼せずソケットのIPを使います。

匿名IDを大量に取得する不正や自動解答を完全に防ぐものではありません。
