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

/** 小役（払い出しまたは再遊技がある役） */
export type SmallRole = 'BELL' | 'MELON' | 'CHERRY' | 'REPLAY';

/** ボーナス */
export type BonusRole = 'BIG' | 'REG';

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
  /** [左, 中, 右] それぞれに許される図柄。null は任意 */
  symbols: readonly [readonly SymbolId[] | null, readonly SymbolId[] | null, readonly SymbolId[] | null];
  /**
   * 判定する範囲。
   * - 'line'  : 有効ライン上で 3 リールの図柄を見る（通常の 3 つ揃い）
   * - 'leftReel' : 左リールの指定段だけを見る（チェリーなど）
   */
  scope: 'line' | 'leftReel';
  /** scope が 'leftReel' のとき、入賞とみなす段。省略時は全段 */
  leftRows?: readonly RowIndex[];
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
export interface StopResult {
  reel: ReelIndex;
  pushKoma: KomaNo;
  stopKoma: KomaNo;
  slip: number;
  /** 全候補の評価（デバッグ表示用） */
  candidates: CandidateEvaluation[];
}

// ---------------------------------------------------------------------------
// 演出
// ---------------------------------------------------------------------------

/** レバーオン時の予告音 */
export type LeverSoundId = 'none' | 'normal' | 'notice';

/** リールフラッシュのパターン（CSS クラス名に対応） */
export type FlashId = 'none' | 'bonusConfirm';

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
  flash: FlashId;
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
  /** 差枚数の推移（グラフ用。一定ゲーム間隔で記録） */
  diffSeries: number[];
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
  counters: Counters;
  /** 前回レバーオン時刻（ウェイト制御用・ms） */
  lastLeverAt: number;
}

// ---------------------------------------------------------------------------
// 抽選テーブル（config/probability.ts）
// ---------------------------------------------------------------------------

/**
 * 抽選テーブルの行。単独役と、ボーナス＋小役の重複行を持つ。
 * 行に無いぶん（denom − 合計）がハズレ。
 */
export type LotteryRowKey =
  | 'BIG'
  | 'REG'
  | 'BELL'
  | 'MELON'
  | 'CHERRY'
  | 'REPLAY'
  | 'BIG_CHERRY' // BIG＋チェリー重複
  | 'BIG_MELON' // BIG＋スイカ重複
  | 'REG_CHERRY' // REG＋チェリー重複
  | 'REG_MELON'; // REG＋スイカ重複

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
  /** 対象ボーナス。省略時は BIG・REG 両方 */
  bonus?: readonly BonusRole[];
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
  bonusConfirmFlash: FlashId;
  /** ボーナス中の BGM */
  bgm: Record<BonusRole, BgmId>;
}
