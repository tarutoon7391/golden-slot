/**
 * 機種情報（仮称）
 * ここを変えれば全画面の表示名が切り替わる。
 * 画面の動作に関わる数値（コイン・ウェイト・タイミング）もここに集約する。
 */
export const MACHINE = {
  /** 機種名（仮称） */
  name: 'GOLDEN',
  /** サブタイトル（空でもよい） */
  subtitle: 'A-TYPE',
  /** バージョン表記 */
  version: '0.7.0',
  /** リール本数（Aタイプは3本固定） */
  reelCount: 3,
  /** 1リールのコマ数 */
  komaCount: 21,
  /** 1ゲームの掛け枚数（3枚掛け固定） */
  betPerGame: 3,
  /** リプレイ時の自動掛け枚数 */
  replayBet: 3,
  /** 最短ゲーム間隔（ミリ秒・4.1秒ウェイト） */
  minGameIntervalMs: 4100,
  /** 最大スベリコマ数（押下位置から 0〜4 コマ） */
  maxSlip: 4,
  /** リール回転速度（rpm・約80相当） */
  reelRpm: 80,

  // --- 画面・進行（フェーズ4） ---
  /** 開始時の所持コイン（仮想） */
  initialCoins: 1000,
  /** コインが足りないときに追加する枚数（仮想） */
  coinRefill: 500,
  /** 回転開始からストップボタンを受け付けるまでの時間（ms） */
  reelStartupMs: 300,
  /** 払い出し表示の基本時間（ms） */
  payoutBaseMs: 250,
  /** 払い出し 1 枚あたりの表示時間（ms） */
  payoutPerCoinMs: 35,
  /** ボーナス確定フラッシュの表示時間（ms） */
  bonusFlashMs: 1800,
  /** ボーナス履歴の保持件数 */
  historyMax: 200,
  /** 差枚数グラフの最大点数（超えたら間引く） */
  diffSeriesMax: 600,
  /** localStorage のキー */
  storageKey: 'golden-slot:save',
  /** 保存データのバージョン（形式を変えたら上げる） */
  saveVersion: 2,
} as const;
