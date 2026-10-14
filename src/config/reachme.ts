import type { ReachmePattern } from '../shared/types.ts';

/**
 * リーチ目テーブル
 *
 * ここは空のまま始める。中身は自分で設計して書き足す。
 * 空配列のあいだ、リール制御はリーチ目に関して何もしない。
 *
 * ■ 書き方（例を 1 件だけ。コメントを外せばそのまま使える）
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
 *   bonus: ['BIG7', 'REG'],               // 省略時は全ボーナス（BIG7 / BIGG / REG）
 * },
 *
 * デバッグモード（?debug=1）の「出目をコピー」ボタンで、今の出目をこの形式で取得できる。
 */
export const REACHME: readonly ReachmePattern[] = [];
