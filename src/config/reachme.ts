import type { ReachmePattern, ReelIndex, ReelPattern } from '../shared/types.ts';
import { windowAt } from './reels.ts';
import { horizontalBonusLines, sandwichDoubleTempai } from '../reel/reachmeGen.ts';

/**
 * リーチ目テーブル（docs/reachme/GOLDEN_リーチ目仕様_v1.1.md §3）
 *
 * 分類: 共通（R）＝全ボーナス／7系（S）＝BIG7・REG／G系（G）＝BIGG。
 * bonus に含まれるボーナスの成立中は「優先して止める」、含まれない状態（非成立・他系の成立中）では「止めない」。
 *
 * ■ 書き方（1 件の例）
 *
 * {
 *   id: 'example-bar-bottom',            // 一意なID（半角英数とハイフン）
 *   label: '例: 左BAR下段・中G中段・右は見ない',
 *   // [左, 中, 右] それぞれ [上段, 中段, 下段]。'*' は任意の図柄。null はそのリールを見ない
 *   reels: [
 *     ['*', '*', 'bar'],                  // 左: 下段 BAR
 *     ['*', 'g', '*'],                    // 中: 中段 G
 *     null,                               // 右: 見ない（2 リール時点で成立するリーチ目）
 *   ],
 *   usage: 'both',                        // 'both'(既定) / 'preferOnly' / 'excludeOnly'
 *   bonus: ['BIG7', 'REG'],               // 対象ボーナス。省略時は全ボーナス（BIG7 / BIGG / REG）
 *   // 以下は省略可
 *   when: {                               // 押し順・押下位置・スベリの条件（省略時は出目だけで判定）
 *     order: [0, 2],                      //   押し順の先頭一致（0=左, 1=中, 2=右）。[0, 2] は左→右の挟み打ち、[1] は中押し
 *     reels: { 0: { slip: [3, 4] } },     //   リールごとの押下位置（push: [11, 12]）・スベリ（slip: [3, 4]）
 *   },
 *   strict: true,                         // 当選小役が揃っていてもリーチ目扱い。省略時は「○○orリーチ目」（小役が揃えば小役の出目）
 * },
 *
 * at(リール, コマ番号) はそのコマが中段のときの 3 図柄をそのまま書く省略形。
 * 形が多いもの（R04 挟み打ちWテンパイ・R11 ボーナス図柄の横一直線）は src/reel/reachmeGen.ts で生成する。
 *
 * ■ 制御への効き方
 * - ボーナス非成立（default セット）: 登録したリーチ目は止めない（残りリールの押し方次第で避けられない位置も止めない）。
 *   例外は viaForPullIn の形（仕様 v1.2 P1 補足: R04・R09・R10・G02〜G04・G07・S03〜S06）で、
 *   「それ以外では成立役を取りこぼし確定」のときだけ、成立役を引き込むために経由してよい（経由後に目押しを外せば形が残る）
 * - ボーナス成立後（BIG7 / BIGG / REG セット）: bonus にその種別を含むリーチ目は、ボーナスを引き込めないときに優先して止める。
 *   含まないリーチ目（他系）は止めない
 *
 * デバッグモード（?debug=1）の「出目をコピー」ボタンで、今の出目をこの形式で取得できる。
 */

/** リール reel の koma 番が中段にあるときの [上段, 中段, 下段] */
function at(reel: ReelIndex, koma: number): ReelPattern {
  const w = windowAt(reel, koma);
  return [w[0], w[1], w[2]];
}

const SEVEN = ['BIG7', 'REG'] as const; // 7 系
const G = ['BIGG'] as const; // G 系

export const REACHME: readonly ReachmePattern[] = [
  // ---------------------------------------------------------------- 共通（全ボーナス）
  // R01 ゲチェナ：右 19 番中段（上段リ・中段チ・下段 7）。上段／右上がりのリプレイ揃いなら小役
  { id: 'R01', label: 'ゲチェナ（右19番）', reels: [null, null, at(2, 19)] },
  // R02 順押しチスチ：中 10 番中段。スイカが揃えば小役、揃わなければボーナス
  { id: 'R02', label: '順押しチスチ（中10番）', reels: [null, at(1, 10), null] },
  // R03 中押しチスチ：中が第 1 停止で 10 番中段 → 1 確（スイカ成立でも止めない）
  { id: 'R03', label: '中押しチスチ（中第1停止で10番）', reels: [null, at(1, 10), null], when: { order: [1] }, strict: true },
  // R04 挟み打ち W テンパイ：左→右の第 2 停止で小役 2 種以上がテンパイ（生成。左→右のときだけ）
  ...sandwichDoubleTempai().map((p) => ({ ...p, viaForPullIn: true })),
  // R05 右ベリベ：右 2 番中段。ベルかリプレイが揃えば小役
  { id: 'R05', label: '右ベリベ（右2番）', reels: [null, null, at(2, 2)] },
  // R06 7 中段：左 13 番中段（上段ベ・下段リ）。小役以上
  { id: 'R06', label: '7中段（左13番）', reels: [at(0, 13), null, null] },
  // R07 7 下段 3 コマ以上スベリ：左 14 番中段、押し位置 11 番以前（スベリ 3〜4）。0〜2 コマの 14 番はハズレでも止まる
  { id: 'R07', label: '7下段3コマ以上スベリ（左14番・スベリ3〜4）', reels: [at(0, 14), null, null], when: { reels: { 0: { slip: [3, 4] } } } },
  // R08 BAR 枠上：左 3 番中段（ベ・ス・リ）。小役以上。default では 4 番へ逃がす
  { id: 'R08', label: 'BAR枠上（左3番）', reels: [at(0, 3), null, null] },
  // R09 左 BAR 上段＋右 BAR 上段：左 4 番＋右 12 番。スイカ（右上がり代用）or リーチ目
  { id: 'R09', label: '左BAR上段＋右BAR上段（左4番＋右12番）', reels: [at(0, 4), null, at(2, 12)], viaForPullIn: true },
  // R10 7 下段＋中ベル中段テンパイ：左 14 番＋中ベル中段。ベル or リーチ目
  { id: 'R10', label: '7下段＋中ベル中段テンパイ（左14番）', reels: [at(0, 14), ['*', 'bell', '*'], null], viaForPullIn: true },
  // R11 ボーナス図柄の横一直線（入賞形以外）。小役が揃っていてもリーチ目（生成・strict）。
  //     7・7・BAR は REG 成立中に並べない（REG は右下がりのみ）ので BIG7・BIGG だけを対象にする
  ...horizontalBonusLines({ bonusFor: (s) => (s[0] === 'seven' && s[1] === 'seven' && s[2] === 'bar' ? ['BIG7', 'BIGG'] : undefined) }),
  // R12 順押し BAR 上段テンパイ：左 4 番＋中 5 番 → 2 確
  { id: 'R12', label: 'BAR上段テンパイ（左4番＋中5番）', reels: [at(0, 4), at(1, 5), null] },

  // ---------------------------------------------------------------- 7 系（BIG7・REG）
  // S01 順押し 7 右上がりテンパイ：左 14 番＋中 17 番 → 2 確。右 7 上段（17 番中段）で BIG7
  { id: 'S01', label: '7右上がりテンパイ（左14番＋中17番）', reels: [at(0, 14), at(1, 17), null], bonus: SEVEN },
  // S02 7 下段＋右スイカ中段：左 14 番＋右 21・16・9・4 番中段（BAR 代用は除く）→ 2 確
  { id: 'S02', label: '7下段＋右スイカ中段（左14番）', reels: [at(0, 14), null, ['*', 'melon', '*']], bonus: SEVEN },
  // S03 G 上段→4 コマで 7 上段：左 押し位置 8 番 → 12 番中段（7・リ・ス）。スイカ or リーチ目
  { id: 'S03', label: 'G上段→4コマで7上段（左8番押し→12番）', reels: [at(0, 12), null, null], when: { reels: { 0: { push: [8] } } }, bonus: SEVEN, viaForPullIn: true },
  // S04 左 7 上段＋右 BAR 上段：左 12 番＋右 12 番。リプレイ（中段）or リーチ目
  { id: 'S04', label: '左7上段＋右BAR上段（左12番＋右12番）', reels: [at(0, 12), null, at(2, 12)], bonus: SEVEN, viaForPullIn: true },
  // S05 順押し 7 上段テンパイ：左 12 番＋中 16 番。リプレイ（中段）or リーチ目
  { id: 'S05', label: '7上段テンパイ（左12番＋中16番）', reels: [at(0, 12), at(1, 16), null], bonus: SEVEN, viaForPullIn: true },
  // S06 右 7 中段：右 18 番中段（チ・7・ベ）。ベル（下段・右下がり）or リーチ目
  { id: 'S06', label: '右7中段（右18番）', reels: [null, null, at(2, 18)], bonus: SEVEN, viaForPullIn: true },

  // ---------------------------------------------------------------- G 系（BIGG）
  // G01 3 連 G：左 19 番中段 → ボーナス確定。中は 14 番中段（G 中段）へ引き込み（引き込みルールが自然にやる）
  { id: 'G01', label: '3連G（左19番）', reels: [at(0, 19), null, null], bonus: G },
  // G02 リ G G：左 20 番中段。リプレイ（上段・右下がり）or リーチ目
  { id: 'G02', label: 'リGG（左20番）', reels: [at(0, 20), null, null], bonus: G, viaForPullIn: true },
  // G03 G G ベル：左 18 番中段。ベル（下段・右上がり）or リーチ目
  { id: 'G03', label: 'GGベル（左18番）', reels: [at(0, 18), null, null], bonus: G, viaForPullIn: true },
  // G04 BAR 上段→4 コマで G 上段：左 押し位置 4 番 → 8 番中段（G・ベ・リ）。リプレイ（下段・右上がり）or リーチ目
  { id: 'G04', label: 'BAR上段→4コマでG上段（左4番押し→8番）', reels: [at(0, 8), null, null], when: { reels: { 0: { push: [4] } } }, bonus: G, viaForPullIn: true },
  // G05 左 G 上段＋右 BAR 上段：左 8 番＋右 12 番 → 2 確
  { id: 'G05', label: '左G上段＋右BAR上段（左8番＋右12番）', reels: [at(0, 8), null, at(2, 12)], bonus: G },
  // G06 順押し G 上段テンパイ：左 8 番＋中 13 番 → 2 確
  { id: 'G06', label: 'G上段テンパイ（左8番＋中13番）', reels: [at(0, 8), at(1, 13), null], bonus: G },
  // G07 右 G 中段：右 11 番中段（リ・G・ベ）。リプレイ（上段・右上がり）or ベル（下段・右下がり）or リーチ目
  { id: 'G07', label: '右G中段（右11番）', reels: [null, null, at(2, 11)], bonus: G, viaForPullIn: true },
];
