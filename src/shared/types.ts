/**
 * 型定義の集約
 * ゲーム全体で使う型はここに置く。数値（確率・配当など）は src/config/ 側に置き、ここには入れない。
 */

// ---------------------------------------------------------------------------
// 図柄・リール
// ---------------------------------------------------------------------------

/** 図柄ID（7種） */
export type SymbolId =
  | 'seven' // 赤7
  | 'g' // G（BIG図柄）
  | 'bar' // BAR
  | 'bell' // ベル
  | 'melon' // スイカ
  | 'cherry' // チェリー
  | 'replay'; // リプレイ

/** リール番号（0=左, 1=中, 2=右） */
export type ReelIndex = 0 | 1 | 2;

/** コマ番号（1〜21）。配列表は上から 21番→1番 の順で並ぶ */
export type KomaNo = number;

/** 1リールの配列。index 0 が 21番（最上段）、index 20 が 1番 */
export type ReelStrip = readonly SymbolId[];

/** 窓の段（0=上段, 1=中段, 2=下段） */
export type RowIndex = 0 | 1 | 2;

/** 有効ライン */
export type LineId =
  | 'top' // 上段
  | 'middle' // 中段
  | 'bottom' // 下段
  | 'downRight' // 右下がり（左上→右下）
  | 'upRight'; // 右上がり（左下→右上）

/** ラインの定義：各リールで見る段 */
export interface LineDef {
  id: LineId;
  /** [左の段, 中の段, 右の段] */
  rows: readonly [RowIndex, RowIndex, RowIndex];
}

/**
 * 3リールの停止位置（中段に止まっているコマ番号）。
 * 未停止のリールは null。
 */
export type StopPositions = readonly [KomaNo | null, KomaNo | null, KomaNo | null];

/** 窓に見えている 3×3 の図柄。window[reel][row] */
export type Window = readonly [
  readonly [SymbolId, SymbolId, SymbolId],
  readonly [SymbolId, SymbolId, SymbolId],
  readonly [SymbolId, SymbolId, SymbolId],
];

// ---------------------------------------------------------------------------
// 役・抽選
// ---------------------------------------------------------------------------

/** 払い出し（または再遊技）のある小役 */
export type PayoutSmallRole = 'BELL' | 'MELON' | 'CHERRY' | 'REPLAY';

/**
 * 小役。リーチ目役（REACH_A / REACH_B）は配当 0 の小役として扱い、
 * ボーナス当選ゲームにだけ重複する。リール制御は小役と同じ仕組みで引き込む／蹴飛ばす。
 */
export type SmallRole = PayoutSmallRole | 'REACH_A' | 'REACH_B';

/** ボーナスに重複しうる役（抽選テーブルの重複行） */
export type BonusDupRole = 'CHERRY' | 'MELON' | 'REACH_A' | 'REACH_B';

/** ボーナス（BIG7 = 赤7 揃い、BIGG = G 揃い、REG = 赤7・赤7・BAR） */
export type BonusRole = 'BIG7' | 'BIGG' | 'REG';

/** 当選役（抽選テーブルの行に相当） */
export type Flag = SmallRole | BonusRole | 'NONE';

/**
 * 内部抽選の結果。
 * 小役とボーナスの重複当選を表現するため、両方を別フィールドで持つ。
 * - small: 今ゲームで当選した小役（なければ null）
 * - bonus: 今ゲームで新規に当選したボーナス（なければ null）
 */
export interface LotteryResult {
  small: SmallRole | null;
  bonus: BonusRole | null;
  /** 抽選に使った乱数値（デバッグ表示用） */
  roll?: number;
  /** デバッグで強制した結果か */
  forced?: boolean;
}

/**
 * このゲームで「引き込むべき役」のまとめ。
 * 持ち越し中のボーナスも含めて、リール制御が参照する。
 */
export interface ActiveFlags {
  /** 今ゲームの小役 */
  small: SmallRole | null;
  /** 成立中のボーナス（今ゲーム当選分＋持ち越し分） */
  bonus: BonusRole | null;
}

// ---------------------------------------------------------------------------
// 入賞形・配当
// ---------------------------------------------------------------------------

/**
 * 入賞形の 1 パターン。
 * 各リールに許される図柄の集合。null はその位置を問わない（例: 左チェリー）。
 */
export interface WinPattern {
  /** パターンの識別名（デバッグ表示・配当の分岐に使う） */
  id: string;
  /** 対象の役 */
  role: SmallRole | BonusRole;
  /** [左, 中, 右] それぞれに許される図柄。null は任意（scope が 'window' のときは使わない） */
  symbols: readonly [readonly SymbolId[] | null, readonly SymbolId[] | null, readonly SymbolId[] | null];
  /**
   * 判定する範囲。
   * - 'line'  : 有効ライン上で 3 リールの図柄を見る（通常の 3 つ揃い）
   * - 'leftReel' : 左リールの指定段だけを見る（チェリーなど）
   * - 'window' : 窓全体（3×3）を cells と比べる（リーチ目役など）
   */
  scope: 'line' | 'leftReel' | 'window';
  /** scope が 'line' のとき、見るライン。省略時は全ライン */
  lines?: readonly LineId[];
  /** scope が 'leftReel' のとき、入賞とみなす段。省略時は全段 */
  leftRows?: readonly RowIndex[];
  /** scope が 'window' のときの出目 [左, 中, 右] それぞれ [上段, 中段, 下段]。'*' は任意 */
  cells?: readonly [ReelPattern, ReelPattern, ReelPattern];
  /** このパターン固有の払い出し枚数。省略時は RoleDef.payout を使う（角チェリー／中段チェリーの差など） */
  payout?: number;
}

/** 役の配当定義 */
export interface RoleDef {
  role: SmallRole | BonusRole;
  /** 表示名 */
  label: string;
  /** 払い出し枚数（リプレイ・ボーナスは 0） */
  payout: number;
  /** リプレイ（次ゲーム自動ベット）か */
  isReplay: boolean;
  /** ボーナス中の払い出し枚数（省略時は payout と同じ） */
  payoutInBonus?: number;
}

/** ボーナスの仕様（終了条件） */
export interface BonusSpec {
  kind: BonusRole;
  label: string;
  /** この枚数以上払い出したら終了 */
  maxPayout: number;
}

/** 1 ラインぶんの入賞 */
export interface LineHit {
  patternId: string;
  role: SmallRole | BonusRole;
  /** 入賞したライン。leftReel 判定のときは null */
  line: LineId | null;
  payout: number;
}

/** 払い出し判定の結果 */
export interface PayoutResult {
  hits: LineHit[];
  /** 合計払い出し枚数（上限は config で制御） */
  totalPayout: number;
  /** リプレイ入賞か */
  replay: boolean;
  /** 入賞したボーナス（図柄が揃った）。なければ null */
  bonusHit: BonusRole | null;
}

// ---------------------------------------------------------------------------
// リール制御
// ---------------------------------------------------------------------------

/** 停止制御のルールセット（通常時＝default、ボーナス成立後は種別ごと） */
export type StopRuleSetId = 'default' | BonusRole;

/** 止まったリール 1 本の記録（押下位置・停止位置・スベリ） */
export interface StopRecord {
  reel: ReelIndex;
  /** 押下時に中段にあったコマ番号 */
  pushKoma: KomaNo;
  /** 停止したコマ番号（中段） */
  stopKoma: KomaNo;
  slip: number;
}

/** 停止要求（1 リールぶん） */
export interface StopRequest {
  reel: ReelIndex;
  /** 押下時に中段にあったコマ番号 */
  pushKoma: KomaNo;
  /** すでに止まっているリールの停止位置 */
  stopped: StopPositions;
  /** 引き込み対象の役 */
  flags: ActiveFlags;
  /** ゲームの状態（通常／ボーナス中で制御を変えたいとき用） */
  mode: GameMode;
  /**
   * すでに止まったリールの記録（止めた順）。
   * リーチ目の条件（押し順・押下位置・スベリ）の判定に使う。
   * 省略すると stopped から「左→中→右の順で止まった・スベリ条件は不成立」として扱う。
   */
  history?: readonly StopRecord[];
  /**
   * 制御の振り分け用乱数（0 以上 1 未満）。挟み打ちの平行／斜めスイカの振り分け（MACHINE.hasamiDiagonalMelonRate）に使う。
   * 省略時は振り分けなし（平行優先で固定）。本番は useGame が getRng() から渡す
   */
  roll?: number;
}

/** ルール 1 本の判定結果 */
export type RuleVerdict = 'accept' | 'reject' | 'neutral';

/** 候補 1 つに対する、ルール 1 本の評価 */
export interface RuleEvaluation {
  ruleId: string;
  verdict: RuleVerdict;
  /** 人が読める理由（デバッグパネル表示用） */
  reason: string;
}

/** 停止候補（0〜4 コマすべり）の評価 */
export interface CandidateEvaluation {
  slip: number;
  /** 停止するコマ番号（中段） */
  koma: KomaNo;
  /** 停止した場合にそのリールに見える 3 図柄 [上, 中, 下] */
  symbols: readonly [SymbolId, SymbolId, SymbolId];
  evaluations: RuleEvaluation[];
  /** 最終的に選ばれたか */
  chosen: boolean;
  /** 候補から外れた理由（残った場合は null） */
  excludedBy: string | null;
}

/** 停止結果 */
export interface StopResult extends StopRecord {
  /** 使ったルールセット（デバッグ表示用） */
  ruleSet: StopRuleSetId;
  /** 全候補の評価（デバッグ表示用） */
  candidates: CandidateEvaluation[];
}

// ---------------------------------------------------------------------------
// 演出
// ---------------------------------------------------------------------------

/** レバーオン時の予告音 */
export type LeverSoundId = 'none' | 'normal' | 'notice';

/** ボーナス図柄が揃った瞬間のフラッシュ（窓全体。CSS クラス名に対応） */
export type BonusFlashId = 'none' | 'bonusConfirm';

/**
 * リールフラッシュ 6 種（フェーズ8b・小役の予告。動きと時間は config/flashes.ts、見た目は cabinet.css）
 * REP=リプレイF, BELL=ベルF, MEL=スイカF, CHER=チェリーF, CMEL=チャンススイカF, CCHER=チャンスチェリーF
 */
export type FlashId = 'REP' | 'BELL' | 'MEL' | 'CHER' | 'CMEL' | 'CCHER';

/** レバーON時に決めるフラッシュ要求。発生なしは null で表す */
export interface FlashRequest {
  id: FlashId;
}

/** ロゴランプ（GO / LD / EN）の点灯数 */
export type LampCount = 0 | 1 | 2 | 3;

/** 演出の抽選表の列: 成立役（リーチ目役 A/B は none 扱い） */
export type EffectRoleKey = 'REPLAY' | 'BELL' | 'MELON' | 'CHERRY' | 'none';

/**
 * 演出の抽選表の行キー（演出仕様 v1.0 §2.1）
 * N = ボーナス非成立、B = ボーナス成立後（当選G・持ち越しG）
 */
export type EffectStateKey = `${'N' | 'B'}/${EffectRoleKey}`;

/** レバーON時に決めるロゴランプの点灯計画。第 k 停止（k ≤ count）で、そのとき止めたリールのランプが点く */
export interface LampPlan {
  count: LampCount;
}

/** ロゴランプの状態。lit は [左=GO, 中=LD, 右=EN]。次のレバーONで全消灯 */
export interface LampState {
  count: LampCount;
  lit: readonly [boolean, boolean, boolean];
}

/** 告知ランプ */
export type LampId = 'none' | 'on';

/** BGM */
export type BgmId = 'none' | 'big' | 'reg';

/**
 * 演出計画。
 * 抽選結果とリール制御の後に決まる。「表示は抽選結果に従う」ので演出が結果を変えることはない。
 * バリエーションの枝（消灯・告知・フラッシュ種別）は型だけ用意し、中身は後から足す。
 */
export interface EffectPlan {
  leverSound: LeverSoundId;
  /** リール消灯（true で窓を暗くする CSS クラスを付ける） */
  blackout: boolean;
  flash: BonusFlashId;
  lamp: LampId;
  bgm: BgmId;
  /** 演出期待度テーブルで使ったキー（デバッグ表示用） */
  sourceKey?: string;
}

// ---------------------------------------------------------------------------
// ゲーム状態
// ---------------------------------------------------------------------------

/** 設定（1〜6） */
export type Setting = 1 | 2 | 3 | 4 | 5 | 6;

/** 遊技モード */
export type GameMode = 'normal' | 'big' | 'reg';

/** 1 ゲームの進行フェーズ */
export type GamePhase =
  | 'idle' // ベット待ち
  | 'bet' // ベット済み・レバー待ち
  | 'spinning' // 回転中（ストップ受付）
  | 'payout' // 全停止・払い出し処理中
  | 'ended'; // 「やめる」を押した後（設定発表画面）

/** ボーナス履歴 1 件 */
export interface BonusHistoryEntry {
  kind: BonusRole;
  /** 前回ボーナス終了からの回転数 */
  gamesSinceLast: number;
  /** 総回転数（成立時） */
  totalGamesAt: number;
  /** 成立時の差枚数 */
  diffAt: number;
}

/** データカウンター */
export interface Counters {
  totalGames: number;
  gamesSinceBonus: number;
  bigCount: number;
  regCount: number;
  /** 投入枚数の累計 */
  coinsIn: number;
  /** 払い出し枚数の累計 */
  coinsOut: number;
  history: BonusHistoryEntry[];
  /** 差枚数の推移（グラフ用。diffStep ゲームごとに記録） */
  diffSeries: number[];
  /** diffSeries の記録間隔（ゲーム数）。点数が上限を超えると 2 倍にして間引く */
  diffStep: number;
  /** 通常時のゲーム数（設定推測の分母） */
  normalGames: number;
  /** 通常時に入賞した小役の回数（設定推測・履歴表示用） */
  smallCounts: Record<SmallRole, number>;
}

/** ボーナス中の進行状況 */
export interface BonusProgress {
  kind: BonusRole;
  /** 払い出した枚数の累計（規定枚数で終了） */
  paidOut: number;
}

/** ゲーム全体の状態（保存対象） */
export interface GameState {
  /** 現在の設定（非公開） */
  setting: Setting;
  /** 乱数シード（再現用） */
  seed: number;
  phase: GamePhase;
  mode: GameMode;
  coins: number;
  /** 今ゲームのベット枚数 */
  bet: number;
  /** リプレイ入賞による自動ベットか */
  replayBet: boolean;
  /** 持ち越し中のボーナス（図柄を揃えるまで保持） */
  carriedBonus: BonusRole | null;
  bonus: BonusProgress | null;
  /** 今ゲームの抽選結果 */
  lottery: LotteryResult | null;
  /** 各リールの停止位置 */
  positions: StopPositions;
  /** 各リールの停止結果（デバッグ表示用） */
  stops: (StopResult | null)[];
  payout: PayoutResult | null;
  effect: EffectPlan | null;
  /**
   * 今ゲームのリールフラッシュ（レバーON時に決め、第 3 停止の直後に画面が出す。null は発生なし）。
   * フェーズ8b は器だけで、抽選との接続はフェーズ8c
   */
  flash: FlashRequest | null;
  /** ロゴランプ（GO / LD / EN）。点灯数はレバーON時に決め、停止ごとに 1 個ずつ点く */
  lamp: LampState;
  counters: Counters;
  /** 前回レバーオン時刻（ウェイト制御用・ms） */
  lastLeverAt: number;
  /**
   * リールが回り始める時刻（ms）。ウェイト中はレバーオンより後になる。
   * 押下コマ番号は「spinFrom + 経過時間 ÷ 1 コマの時間」で決める（画面と reducer で同じ式を使う）
   */
  spinStartAt: number;
  /** 回転開始時に中段にあったコマ番号（前ゲームの停止位置） */
  spinFrom: readonly [KomaNo, KomaNo, KomaNo];
  /** 各リールのストップボタンを押した時刻（ms）。未停止は null */
  stopAt: readonly [number | null, number | null, number | null];
}

// ---------------------------------------------------------------------------
// 抽選テーブル（config/probability.ts）
// ---------------------------------------------------------------------------

/**
 * 抽選テーブルの行。単独役と、ボーナス＋小役の重複行を持つ。
 * 行に無いぶん（denom − 合計）がハズレ。
 */
export type LotteryRowKey =
  | PayoutSmallRole // 小役単独
  | BonusRole // ボーナス単独
  | `${BonusRole}_${BonusDupRole}`; // ボーナス＋小役（チェリー・スイカ・リーチ目役A・B）の重複

/** 1 モードぶんの抽選テーブル。各行の重みは整数、分母も整数 */
export interface LotteryTable {
  denom: number;
  weights: Record<LotteryRowKey, number>;
}

// ---------------------------------------------------------------------------
// リーチ目（config/reachme.ts）
// ---------------------------------------------------------------------------

/** 出目パターンの 1 マス。'*' は任意の図柄 */
export type SymbolPattern = SymbolId | '*';

/** 1 リールぶんの出目パターン [上段, 中段, 下段] */
export type ReelPattern = readonly [SymbolPattern, SymbolPattern, SymbolPattern];

/** リーチ目の扱い */
export type ReachmeUsage =
  | 'both' // 内部中は優先・非成立時は除外（既定）
  | 'preferOnly' // 内部中に優先するだけ（非成立時にも出うる＝ガセ目にしたいとき）
  | 'excludeOnly'; // 非成立時に除外するだけ

/** リーチ目の追加条件：1 リールぶんの押下位置・スベリ */
export interface ReachmeReelCondition {
  /** 押下時に中段にあったコマ番号がこの中に含まれるとき */
  push?: readonly KomaNo[];
  /** スベリコマ数がこの中に含まれるとき（0〜4） */
  slip?: readonly number[];
}

/**
 * リーチ目の追加条件（省略時は出目だけで判定）
 * 条件が付いたリーチ目は、押し順・押下位置・スベリまで一致したときだけリーチ目として扱う。
 */
export interface ReachmeCondition {
  /** 押し順の先頭一致。[0, 2] なら 左→右 の挟み打ち、[1] なら中押し（第1停止が中） */
  order?: readonly ReelIndex[];
  /** リールごとの押下位置・スベリ条件（キーはリール番号 0=左, 1=中, 2=右） */
  reels?: Partial<Record<ReelIndex, ReachmeReelCondition>>;
}

/** リーチ目 1 件 */
export interface ReachmePattern {
  id: string;
  /** 表示名・メモ */
  label: string;
  /**
   * [左, 中, 右] の出目。null はそのリールを見ない
   * （例: 左・中の 2 リールで決まるリーチ目は右を null にする）
   */
  reels: readonly [ReelPattern | null, ReelPattern | null, ReelPattern | null];
  /** 省略時は 'both' */
  usage?: ReachmeUsage;
  /** 対象ボーナス。省略時は全ボーナス（BIG7 / BIGG / REG） */
  bonus?: readonly BonusRole[];
  /** 押し順・押下位置・スベリの条件。省略時は出目だけで判定 */
  when?: ReachmeCondition;
  /**
   * true なら当選小役が揃っていてもリーチ目として扱う（例: ボーナス図柄の横一直線）。
   * 省略（false）なら「○○orリーチ目」＝当選小役が揃った形は小役の出目として許す。
   */
  strict?: boolean;
  /**
   * true なら、成立役を引き込むためにこの形を経由してよい（仕様 v1.2 P1 補足の一覧: R04・R09・R10・G02〜G04・G07・S03〜S06）。
   * 従来なら取りこぼし確定の場面だけで使われ、その後に目押しを外すと形だけが残る（「小役が揃わなければボーナス」は目押し前提）。
   * 省略（false）の形は、ボーナス非成立では引き込みのためでも止めない（2 確・1 確の形など）。strict とは独立。
   */
  viaForPullIn?: boolean;
}

// ---------------------------------------------------------------------------
// 演出期待度（config/effects.ts）
// ---------------------------------------------------------------------------

/** 演出を振り分けるときの状況 */
export type EffectSituation =
  | 'none' // ハズレ・ボーナス非成立
  | 'small' // 小役当選・ボーナス非成立
  | 'bonusNew' // 今ゲームでボーナス当選
  | 'bonusCarry'; // ボーナス持ち越し中

/** 状況ごとの重み表。キーが演出ID、値が重み（整数） */
export type EffectWeightTable<T extends string> = Record<EffectSituation, Partial<Record<T, number>>>;

/** 演出期待度テーブル全体 */
export interface EffectTable {
  leverSound: EffectWeightTable<LeverSoundId>;
  /** ボーナス図柄が揃った瞬間に出すフラッシュ */
  bonusConfirmFlash: BonusFlashId;
  /** ボーナス中の BGM */
  bgm: Record<BonusRole, BgmId>;
}
