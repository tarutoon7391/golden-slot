import type { Counters } from '../shared/types.ts';
import { ROLES, isBigBonus } from '../config/roles.ts';
import { SMALL_ROLES } from '../lottery/lottery.ts';
import { diffOf } from '../store/gameReducer.ts';
import { oneIn } from '../store/estimate.ts';
import { DiffGraph } from './DiffGraph.tsx';

/**
 * データカウンター
 * compact: 筐体上部の 1 行表示（回転数・BIG・REG・合算・差枚）
 * detail : ボーナス履歴と差枚数グラフ
 */

export function DataCounterCompact({ counters }: { counters: Counters }) {
  const diff = diffOf(counters);
  const bonus = counters.bigCount + counters.regCount;
  return (
    <div className="counter">
      <div className="counter-item main">
        <span className="counter-label">回転数</span>
        <span className="counter-value">{counters.gamesSinceBonus}</span>
      </div>
      <div className="counter-item">
        <span className="counter-label">総回転</span>
        <span className="counter-value">{counters.totalGames}</span>
      </div>
      <div className="counter-item big">
        <span className="counter-label">BIG</span>
        <span className="counter-value">{counters.bigCount}</span>
      </div>
      <div className="counter-item reg">
        <span className="counter-label">REG</span>
        <span className="counter-value">{counters.regCount}</span>
      </div>
      <div className="counter-item">
        <span className="counter-label">合算</span>
        <span className="counter-value small">{oneIn(counters.normalGames, bonus)}</span>
      </div>
      <div className="counter-item">
        <span className="counter-label">差枚</span>
        <span className={`counter-value small ${diff >= 0 ? 'plus' : 'minus'}`}>{diff >= 0 ? `+${diff}` : diff}</span>
      </div>
    </div>
  );
}

export function DataCounterDetail({ counters }: { counters: Counters }) {
  const history = [...counters.history].reverse();
  const n = counters.normalGames;
  return (
    <div className="counter-detail">
      <DiffGraph series={counters.diffSeries} step={counters.diffStep} />
      <div className="detail-grid">
        <div>
          <h3>ボーナス履歴（新しい順）</h3>
          {history.length === 0 ? (
            <p className="muted">まだボーナスはありません</p>
          ) : (
            <ol className="history">
              {history.slice(0, 30).map((h, i) => (
                <li key={`${h.totalGamesAt}-${i}`} className={isBigBonus(h.kind) ? 'big' : 'reg'}>
                  <span className="kind">{ROLES[h.kind].label}</span>
                  <span className="games">{h.gamesSinceLast} G</span>
                  <span className="muted">（総 {h.totalGamesAt} G・差枚 {h.diffAt >= 0 ? `+${h.diffAt}` : h.diffAt}）</span>
                </li>
              ))}
            </ol>
          )}
        </div>
        <div>
          <h3>小役確率（通常時 {n} G）</h3>
          <table className="rate-table">
            <tbody>
              {SMALL_ROLES.map((r) => (
                <tr key={r}>
                  <td>{ROLES[r].label}</td>
                  <td>{counters.smallCounts[r]} 回</td>
                  <td>{oneIn(n, counters.smallCounts[r])}</td>
                </tr>
              ))}
              <tr>
                <td>BIG</td>
                <td>{counters.bigCount} 回</td>
                <td>{oneIn(n, counters.bigCount)}</td>
              </tr>
              <tr>
                <td>REG</td>
                <td>{counters.regCount} 回</td>
                <td>{oneIn(n, counters.regCount)}</td>
              </tr>
            </tbody>
          </table>
          <p className="muted">投入 {counters.coinsIn} 枚 / 払出 {counters.coinsOut} 枚</p>
        </div>
      </div>
    </div>
  );
}
