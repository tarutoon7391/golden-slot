/**
 * 機種情報（仮称）
 * ここを変えれば全画面の表示名が切り替わる。
 * 画面の動作に関わる数値（コイン・ウェイト・タイミング）もここに集約する。
 */
export const MACHINE = {
  /** 機種名（仮称） */
  name: 'GOLDEN',
  /** ロゴパネルの区切り（つなげると name になる。区切りごとに独立して点灯できる） */
  logoSegments: ['GO', 'LD', 'EN'],
  /** サブタイトル（空でもよい） */
  subtitle: 'A-TYPE',
  /** バージョン表記 */
  version: '0.8.0',
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
  /**
   * 挟み打ち（左→右）の右停止で、スイカを平行（上・中・下段）にも斜め（右上がり・右下がり）にも狙える押下位置のとき、
   * 斜めを選ぶ割合。残りは平行。どちらか一方しか狙えない位置では関係ない（引き込みを優先する）
   */
  hasamiDiagonalMelonRate: 0.1,
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
  /** 保存データのバージョン（形式を変えたら上げる。古い版からの移行は store/storage.ts） */
  saveVersion: 3,
} as const;
