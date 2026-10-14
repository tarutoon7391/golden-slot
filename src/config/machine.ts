/**
 * 機種情報（仮称）
 * ここを変えれば全画面の表示名が切り替わる。
 */
export const MACHINE = {
  /** 機種名（仮称） */
  name: 'GOLDEN',
  /** サブタイトル（空でもよい） */
  subtitle: 'A-TYPE',
  /** バージョン表記 */
  version: '0.1.0',
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
} as const;
