import { MACHINE } from '../config/machine.ts';
import type { LogoLamps } from './logoLamps.ts';

/**
 * 筐体上部のロゴパネル（フェーズ8a: 器のみ）
 *
 * 機種名を Dela Gothic One・斜体・金のグラデ（G 図柄と同じ配色）で大きく出す。
 * ロゴは MACHINE.logoSegments のとおり区切り（GO / LD / EN）、区切りごとに独立して点灯できる。
 * 受け取る状態は区切りごとの lamp（'off' | 'on'）だけ。
 * - off: 消えずに暗い金色で沈んで見える（筐体の一部として常にある）
 * - on : その区切りの外側に金色の光彩が付く。1 つでも点いていれば枠も光る
 * いつ点くか（演出の法則）は別フェーズで決めるので、ここに点灯条件は書かない。
 * 状態の型は logoLamps.ts。見た目は cabinet.css の .logo-panel / .logo-seg。ロゴは画像にせず CSS テキストで作る（色やアニメを後で変えやすくするため）。
 */

interface Props {
  lamps: LogoLamps;
}

export function LogoPanel({ lamps }: Props) {
  const segs = MACHINE.logoSegments;
  const anyOn = segs.some((_, i) => lamps[i] === 'on');
  const status = segs.map((s, i) => `${s}${lamps[i] === 'on' ? '点灯' : '消灯'}`).join('・');
  return (
    <div className={`logo-panel${anyOn ? ' on' : ''}`} role="img" aria-label={`ロゴパネル ${MACHINE.name}（${status}）`}>
      <span className="logo-text" aria-hidden="true">
        {segs.map((s, i) => (
          <span key={s} className={`logo-seg${lamps[i] === 'on' ? ' on' : ''}`}>
            {s}
          </span>
        ))}
      </span>
    </div>
  );
}
