# HIGH×LOW Ver.1.0 RC

30秒で左右の数式を比較するソロゲーム。Ver.0.1のゲームルールを維持し、EASY / NORMAL / HARDそれぞれに日次・週次・歴代ランキングを追加しました。

**状態：実装・ローカル検証済み。Google Apps Scriptの実デプロイ接続と正式承認は未完了です。**

- [起動方法・構成・機能](README-v1.md)
- [実装報告と検証結果](REPORT-v1.md)
- [Googleスプレッドシートの導入手順](docs/GOOGLE-SETUP.md)
- [API仕様](docs/API.md)
- [既存ポータル・ランキング基盤の確認結果](docs/EXISTING-BASE.md)
- [Ver.0.1の報告](REPORT.md)

## 手元でプレイ

Node.js 24以上で、外部パッケージのインストールなしで実行できます。

```sh
npm start
```

`http://localhost:8080` を開き、RANKINGでニックネームを登録してからPLAYします。SQLiteで全機能を確認できます。Googleスプレッドシートを使う場合は、専用Apps Scriptをデプロイして `dist/config.js` に実際のURLを設定してください。既存ゲームのコードやシートは変更しません。

## チェック

```sh
npm test
python3 tests/browser-v1.py
```

各回答の得点はサーバーで再計算しますが、回答時間の改ざん・自動回答・複数匿名IDを完全に防ぐものではありません。正式公開前に実装報告の制限を確認してください。
