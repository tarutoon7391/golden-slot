# GOLDEN（仮称）– ブラウザで遊べる Aタイプ・パチスロゲーム

React + Vite + TypeScript で作るオリジナルのパチスロゲームです。
仮想コインのみで遊ぶゲームで、換金・課金など実在のお金に関わる要素は一切ありません。

機種名は仮称です。`src/config/machine.ts` の `name` を変えると全画面の表示が切り替わります。

## 必要なもの

- Node.js 22.18 以上（`node scripts/sim/run.ts` のように TypeScript を直接実行するため）

## npm scripts

| コマンド | 内容 |
| --- | --- |
| `npm run dev` | 開発サーバー起動（<http://localhost:5173>） |
| `npm run build` | 型チェック + 本番ビルド（`dist/` に出力） |
| `npm run preview` | ビルド結果をローカルで確認 |
| `npm test` | Vitest で単体テストを実行 |
| `npm run sim` | シミュレーター。`-- --setting 3 --games 1000000 --seed 42` で設定・ゲーム数・シードを指定（既定: 全設定・各1000万G） |
| `npm start` | `dist/` を静的配信（Railway 用。環境変数 `PORT` を使う。未設定なら 3000） |

## ディレクトリ構成

```
golden-slot/
├─ index.html              エントリ HTML
├─ public/
│   └─ symbols/            図柄画像（1図柄1ファイル・SVG）
├─ scripts/
│   ├─ server.mjs          dist を静的配信する最小サーバー（npm start）
│   ├─ sim/run.ts          シミュレーター（npm run sim）
│   └─ probe/pullin.ts     停止制御の網羅チェック（全役×全押し順×全押下位置）
├─ src/
│   ├─ main.tsx            React のエントリ
│   ├─ App.tsx             画面のルート
│   ├─ config/             ★ 調整する場所はすべてここ（数値をコードに埋め込まない）
│   │   ├─ machine.ts      機種名・掛け枚数・ウェイトなど
│   │   ├─ reels.ts        リール配列（確定済み・変更しない）
│   │   ├─ roles.ts        役・入賞形・配当
│   │   ├─ probability.ts  設定1〜6の確率テーブル
│   │   ├─ reachme.ts      リーチ目テーブル（中身は自分で書く）
│   │   ├─ effects.ts      演出期待度テーブル
│   │   ├─ keys.ts         PC のキー操作（フェーズ4）
│   │   ├─ symbols.ts      図柄の表示名・画像パス
│   │   └─ lines.ts        有効ライン5本の定義
│   ├─ shared/
│   │   ├─ types.ts        型定義の集約
│   │   └─ rng.ts          乱数の集約（シード指定可・Math.random 直呼び禁止）
│   ├─ lottery/            内部抽選（設定別・フラグ持ち越し）
│   ├─ reel/
│   │   ├─ rules.ts        ★ 停止制御のルール配列（引き込み→蹴飛ばし→リーチ目→スベリ最小）
│   │   ├─ control.ts      候補列挙とルール適用の仕組み（stopSequence で 3 リール一括）
│   │   ├─ lookahead.ts    先読み（残りリールをどう押されても揃う／揃わないか。メモ化）
│   │   ├─ reachme.ts      リーチ目の照合・reachme.ts 書式への変換
│   │   └─ window.ts       停止位置 → 窓（3×3 図柄）
│   ├─ payout/judge.ts     払い出し判定（5ライン・代用スイカ・左チェリー・1G上限）
│   └─ ui/                 筐体 UI・データカウンター・デバッグパネル
└─ test/                   単体テスト（Vitest）
```

処理順は必ず「内部抽選 → リール制御 → 演出」です。表示は抽選結果に従います。

## 開発の進め方（フェーズ）

| フェーズ | 内容 | 状態 |
| --- | --- | --- |
| 0 | 土台（プロジェクト・型・乱数・scripts） | 完了 |
| 1 | config（確率・配列・役） | 完了 |
| 2 | 抽選とシミュレーター | 完了 |
| 3 | リール制御（最小限） | 完了 |
| 4 | 画面・データカウンター・保存 | 未着手 |
| 5 | デバッグモード（`?debug=1`） | 未着手 |
| 6 | 公開（GitHub → Railway） | 未着手 |

## Railway へのデプロイ

フェーズ6で手順を記載します。
（Build: `npm run build` / Start: `npm start` / `PORT` は Railway が注入）
