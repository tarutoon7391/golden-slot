import type { GameState } from '../shared/types.ts';
import { MACHINE } from '../config/machine.ts';
import { NORMAL_TABLES, oneOver } from '../config/probability.ts';
import { diffOf } from '../store/gameReducer.ts';
import { estimateSetting, mostLikelySetting, oneIn } from '../store/estimate.ts';
import { DataCounterDetail } from './DataCounter.tsx';

/**
 * 「やめる」後の画面: 設定発表とデータからの推測
 */
interface Props {
  state: GameState;
  onNewGame(): void;
}

export function ResultScreen({ state, onNewGame }: Props) {
  const c = state.counters;
  const est = estimateSetting(c);
  const guess = mostLikelySetting(est);
  const diff = diffOf(c);
  const t = NORMAL_TABLES[state.setting];
  const bigW = t.weights.BIG + t.weights.BIG_CHERRY + t.weights.BIG_MELON;
  const regW = t.weights.REG + t.weights.REG_CHERRY + t.weights.REG_MELON;

  return (
    <div className="result">
      <h2 className="result-title">設定発表</h2>
      <p className="result-setting">
        この台は <strong>設定 {state.setting}</strong> でした
      </p>
      <p className="muted">
        理論値: BIG {oneOver(t, bigW)} / REG {oneOver(t, regW)} / ベル {oneOver(t, t.weights.BELL)}
      </p>

      <section className="result-section">
        <h3>データからの推測</h3>
        <p>
          通常時 {c.normalGames} G の BIG・REG・ベル回数から推測すると、いちばん近いのは <strong>設定 {guess}</strong>
          {c.normalGames === 0 && '（データなし）'}
        </p>
        <ul className="estimate">
          {est.map((e) => (
            <li key={e.setting} className={e.setting === state.setting ? 'actual' : ''}>
              <span className="est-label">設定 {e.setting}</span>
              <span className="est-bar">
                <span className="est-fill" style={{ width: `${(e.probability * 100).toFixed(1)}%` }} />
              </span>
              <span className="est-pct">{(e.probability * 100).toFixed(1)}%</span>
            </li>
          ))}
        </ul>
        <p className="muted">※ 事前分布は一様（設定の置かれやすさは考慮しない）。</p>
      </section>

      <section className="result-section">
        <h3>今回の成績</h3>
        <table className="rate-table">
          <tbody>
            <tr>
              <td>総回転数</td>
              <td>{c.totalGames} G（通常時 {c.normalGames} G）</td>
            </tr>
            <tr>
              <td>BIG</td>
              <td>
                {c.bigCount} 回（{oneIn(c.normalGames, c.bigCount)}）
              </td>
            </tr>
            <tr>
              <td>REG</td>
              <td>
                {c.regCount} 回（{oneIn(c.normalGames, c.regCount)}）
              </td>
            </tr>
            <tr>
              <td>合算</td>
              <td>{oneIn(c.normalGames, c.bigCount + c.regCount)}</td>
            </tr>
            <tr>
              <td>差枚数</td>
              <td className={diff >= 0 ? 'plus' : 'minus'}>{diff >= 0 ? `+${diff}` : diff} 枚</td>
            </tr>
            <tr>
              <td>所持コイン</td>
              <td>{state.coins} 枚</td>
            </tr>
          </tbody>
        </table>
      </section>

      <DataCounterDetail counters={c} />

      <button type="button" className="btn btn-primary" onClick={onNewGame}>
        新しい台で始める（設定は再抽選）
      </button>
      <p className="muted">
        {MACHINE.name} v{MACHINE.version}
      </p>
    </div>
  );
}
