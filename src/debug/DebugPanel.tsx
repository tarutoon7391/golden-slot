import { useEffect, useRef, useState } from 'react';
import type { BonusRole, GameState, KomaNo, ReelIndex, Setting, SmallRole, StopResult, SymbolId } from '../shared/types.ts';
import { KOMA_COUNT } from '../config/reels.ts';
import { LINE_LABELS } from '../config/lines.ts';
import { ROLES } from '../config/roles.ts';
import { SYMBOLS } from '../config/symbols.ts';
import { REACHME } from '../config/reachme.ts';
import { ALL_SETTINGS } from '../lottery/setting.ts';
import { BONUS_ROLES, ROW_KEYS, ROW_LABELS, SMALL_ROLES, rowToResult, toActiveFlags } from '../lottery/lottery.ts';
import { STOP_RULE_SETS, ruleSetFor } from '../reel/rules.ts';
import { historyFromStops } from '../reel/control.ts';
import { conditionsOf, findReachme, formatAsReachme, masksOf, matchReachme } from '../reel/reachme.ts';
import { buildPartialWindow } from '../reel/window.ts';
import type { GameApi } from '../store/useGame.ts';
import { oneIn, payoutRate, simulate, type SimResult } from '../sim/simulate.ts';
import { controlPayoutRate, createControlSim, type ControlSim, type ControlSimResult, type PushMode } from '../sim/controlSim.ts';
import type { DebugControl, ForceKey } from './useDebugSettings.ts';

/**
 * デバッグパネル（?debug=1 のときだけ筐体の下に出る）
 *
 * - 内部状態の表示（設定・抽選結果・引き込み対象・演出計画）
 * - 設定固定 / 乱数シード固定
 * - 次ゲームの当選役を強制
 * - 押下位置を 1〜21 で指定、回転アニメーションのスキップ
 * - 停止制御の候補（ルール別の accept / reject / neutral と理由）
 * - リーチ目の一致表示と、今の出目を reachme.ts の書式でコピー
 * - 制御込みシミュレーション（理論値と並べて表示）
 *
 * ここは表示だけ。抽選・制御・判定のロジックは一切持たない。
 */

interface Props {
  api: GameApi;
  debug: DebugControl;
}

const FORCE_KEYS: readonly ForceKey[] = ['NONE', ...ROW_KEYS];
const FORCE_LABEL: Record<ForceKey, string> = ROW_LABELS;
const REEL_NAME = ['左', '中', '右'] as const;
const VERDICT_MARK = { accept: '○', reject: '×', neutral: '−' } as const;
const PUSH_MODE_LABEL: Record<PushMode, string> = { aim: '目押しあり', random: 'ランダム押し', fixed: '固定押し' };

/** 入力欄の整数を読む（空や範囲外は null） */
function readInt(value: string, min: number, max: number): number | null {
  if (value.trim() === '') return null;
  const n = Number(value);
  if (!Number.isInteger(n) || n < min || n > max) return null;
  return n;
}

function roleLabel(role: SmallRole | BonusRole | null): string {
  return role ? ROLES[role].label : 'なし';
}

export function DebugPanel({ api, debug }: Props) {
  const { state } = api;
  return (
    <section className="debug-panel" aria-label="デバッグパネル">
      <h2 className="dbg-title">DEBUG</h2>
      <StateSection state={state} />
      <ForceSection debug={debug} />
      <SettingSection api={api} debug={debug} />
      <PushSection debug={debug} />
      <CandidatesSection state={state} />
      <ReachmeSection state={state} />
      <SimSection initialSetting={state.setting} />
    </section>
  );
}

// ---------------------------------------------------------------------------
// 内部状態
// ---------------------------------------------------------------------------
function StateSection({ state }: { state: GameState }) {
  const l = state.lottery;
  const e = state.effect;
  const p = state.payout;
  const rows: [string, string][] = [
    ['設定', `設定 ${state.setting}`],
    ['乱数シード', String(state.seed)],
    ['フェーズ / モード', `${state.phase} / ${state.mode}`],
    ['今ゲームの抽選', l ? `小役: ${roleLabel(l.small)} ・ ボーナス: ${roleLabel(l.bonus)}${l.roll !== undefined ? ` ・ 乱数 ${l.roll}` : ''}${l.forced ? ' ・ 強制' : ''}` : '-'],
    ['持ち越しボーナス', roleLabel(state.carriedBonus)],
    ['引き込み対象', l ? `小役: ${roleLabel(l.small)} ・ ボーナス: ${roleLabel(state.carriedBonus ?? l.bonus)}（小役優先）` : '-'],
    ['制御セット', l ? `${ruleSetFor(toActiveFlags(l, state.carriedBonus)).label}（STOP_RULE_SETS.${ruleSetFor(toActiveFlags(l, state.carriedBonus)).id}）` : '-'],
    ['演出計画', e ? `予告音: ${e.leverSound}${e.sourceKey ? `（${e.sourceKey}）` : ''} ・ 消灯: ${e.blackout ? 'on' : 'off'} ・ フラッシュ: ${e.flash} ・ ランプ: ${e.lamp} ・ BGM: ${e.bgm}` : '-'],
    ['払い出し判定', p ? (p.hits.length === 0 ? 'ハズレ' : p.hits.map((h) => `${h.patternId}${h.line ? `@${LINE_LABELS[h.line]}` : ''} ${h.payout}枚`).join(' / ') + `（合計 ${p.totalPayout}）`) : '-'],
  ];
  return (
    <details className="dbg-section" open>
      <summary>内部状態</summary>
      <dl className="dbg-grid">
        {rows.map(([k, v]) => (
          <div key={k}>
            <dt>{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
    </details>
  );
}

// ---------------------------------------------------------------------------
// 当選役の強制
// ---------------------------------------------------------------------------
function ForceSection({ debug }: { debug: DebugControl }) {
  const { settings, update } = debug;
  return (
    <details className="dbg-section" open>
      <summary>次ゲームの当選役を強制</summary>
      <div className="dbg-row-flex">
        <label>
          当選役
          <select value={settings.forceKey ?? ''} onChange={(e) => update({ forceKey: (e.target.value || null) as ForceKey | null })}>
            <option value="">通常抽選</option>
            {FORCE_KEYS.map((k) => (
              <option key={k} value={k}>
                {FORCE_LABEL[k]}
              </option>
            ))}
          </select>
        </label>
        <label>
          <input type="checkbox" checked={settings.forceEvery} onChange={(e) => update({ forceEvery: e.target.checked })} />
          毎ゲーム適用（オフなら 1 ゲームで解除）
        </label>
      </div>
      <p className="dbg-note">次のレバーオンから効く。ボーナス持ち越し中に BIG / REG を強制しても新規ボーナスは捨てられる（実機と同じ）。</p>
    </details>
  );
}

// ---------------------------------------------------------------------------
// 設定・シードの固定
// ---------------------------------------------------------------------------
function SettingSection({ api, debug }: Props) {
  const { settings, update } = debug;
  const [seedText, setSeedText] = useState('');
  const editable = api.state.phase === 'idle' || api.state.phase === 'bet';
  const seed = readInt(seedText, 0, 0xffffffff);
  return (
    <details className="dbg-section" open>
      <summary>設定 / 乱数シードの固定</summary>
      <div className="dbg-row-flex">
        <label>
          設定
          <select value={settings.fixedSetting ?? ''} onChange={(e) => update({ fixedSetting: e.target.value ? (Number(e.target.value) as Setting) : null })}>
            <option value="">ランダム（SETTING_WEIGHTS）</option>
            {ALL_SETTINGS.map((s) => (
              <option key={s} value={s}>
                設定 {s}
              </option>
            ))}
          </select>
        </label>
        <button type="button" className="btn-text" disabled={!editable || settings.fixedSetting === null} onClick={() => settings.fixedSetting && api.debugSet({ setting: settings.fixedSetting })}>
          今の台に適用
        </button>
      </div>
      <div className="dbg-row-flex">
        <label>
          シード
          <input type="number" inputMode="numeric" min={0} value={seedText} placeholder="例: 12345" onChange={(e) => setSeedText(e.target.value)} />
        </label>
        <button type="button" className="btn-text" disabled={!editable || seed === null} onClick={() => seed !== null && api.debugSet({ seed })}>
          シードを適用（乱数列をやり直す）
        </button>
      </div>
      <p className="dbg-note">設定は「新しい台で始める」にも使われる。どちらもベット待ち／レバー待ちのときだけ適用できる。</p>
    </details>
  );
}

// ---------------------------------------------------------------------------
// 押下位置の指定・アニメーションスキップ
// ---------------------------------------------------------------------------
function PushSection({ debug }: { debug: DebugControl }) {
  const { settings, update } = debug;
  const setPush = (reel: ReelIndex, value: string) => {
    const next: [KomaNo | null, KomaNo | null, KomaNo | null] = [...settings.pushes] as [KomaNo | null, KomaNo | null, KomaNo | null];
    next[reel] = readInt(value, 1, KOMA_COUNT);
    update({ pushes: next });
  };
  return (
    <details className="dbg-section" open>
      <summary>押下位置の指定（コマ番号 1〜{KOMA_COUNT}）</summary>
      <div className="dbg-row-flex">
        {([0, 1, 2] as ReelIndex[]).map((reel) => (
          <label key={reel}>
            {REEL_NAME[reel]}
            <input
              type="number"
              inputMode="numeric"
              min={1}
              max={KOMA_COUNT}
              value={settings.pushes[reel] ?? ''}
              placeholder="時刻"
              onChange={(e) => setPush(reel, e.target.value)}
            />
          </label>
        ))}
        <button type="button" className="btn-text" onClick={() => update({ pushes: [null, null, null] })}>
          クリア
        </button>
      </div>
      <label className="dbg-check">
        <input type="checkbox" checked={settings.skipAnimation} onChange={(e) => update({ skipAnimation: e.target.checked })} />
        回転アニメーション・ウェイト・払い出し表示を飛ばす
      </label>
      <p className="dbg-note">空欄のリールは押した時刻から中段のコマ番号を求める（通常どおり）。指定したコマ番号が中段にある状態で押したことになり、そこから制御でスベる。</p>
    </details>
  );
}

// ---------------------------------------------------------------------------
// 停止制御の候補
// ---------------------------------------------------------------------------
function SymbolCell({ symbols }: { symbols: readonly [SymbolId, SymbolId, SymbolId] }) {
  return (
    <span className="dbg-symbols">
      {symbols.map((s, i) => (
        <img key={i} src={SYMBOLS[s].imagePath} alt={SYMBOLS[s].label} title={SYMBOLS[s].label} />
      ))}
    </span>
  );
}

function CandidateTable({ result, showReason }: { result: StopResult; showReason: boolean }) {
  const rules = STOP_RULE_SETS[result.ruleSet].rules;
  return (
    <table className="dbg-table">
      <thead>
        <tr>
          <th>スベリ</th>
          <th>コマ</th>
          <th>上中下</th>
          {rules.map((r) => (
            <th key={r.id} title={r.id}>
              {r.label}
            </th>
          ))}
          <th>結果</th>
        </tr>
      </thead>
      <tbody>
        {result.candidates.map((c) => (
          <CandidateRows key={c.slip} c={c} rules={rules} showReason={showReason} />
        ))}
      </tbody>
    </table>
  );
}

function CandidateRows({ c, rules, showReason }: { c: StopResult['candidates'][number]; rules: readonly { id: string }[]; showReason: boolean }) {
  const byRule = new Map(c.evaluations.map((ev) => [ev.ruleId, ev]));
  return (
    <>
      <tr className={c.chosen ? 'chosen' : ''}>
        <td>{c.slip}</td>
        <td>{c.koma}</td>
        <td>
          <SymbolCell symbols={c.symbols} />
        </td>
        {rules.map((r) => {
          const ev = byRule.get(r.id);
          return (
            <td key={r.id} className={ev ? `verdict-${ev.verdict}` : ''} title={ev?.reason ?? '未評価（前のルールで除外）'}>
              {ev ? VERDICT_MARK[ev.verdict] : '·'}
            </td>
          );
        })}
        <td>{c.chosen ? '採用' : c.excludedBy ? `除外: ${c.excludedBy}` : '残留'}</td>
      </tr>
      {showReason && (
        <tr className="reason-row">
          <td colSpan={4 + rules.length}>
            {c.evaluations.map((ev) => (
              <div key={ev.ruleId}>
                <b>{ev.ruleId}</b> {VERDICT_MARK[ev.verdict]} {ev.reason}
              </div>
            ))}
          </td>
        </tr>
      )}
    </>
  );
}

function CandidatesSection({ state }: { state: GameState }) {
  const [showReason, setShowReason] = useState(false);
  const stops = state.stops.filter((s): s is StopResult => s !== null);
  return (
    <details className="dbg-section" open>
      <summary>停止制御の候補（StopResult.candidates）</summary>
      <label className="dbg-check">
        <input type="checkbox" checked={showReason} onChange={(e) => setShowReason(e.target.checked)} />
        理由を表示
      </label>
      {stops.length === 0 && <p className="dbg-note">まだ止まっていない。</p>}
      {stops.map((r) => (
        <div key={r.reel} className="dbg-reel-block">
          <h3>
            {REEL_NAME[r.reel]}リール: 押下 {r.pushKoma} → 停止 {r.stopKoma}（スベリ {r.slip}）・セット {STOP_RULE_SETS[r.ruleSet].label}
          </h3>
          <CandidateTable result={r} showReason={showReason} />
        </div>
      ))}
      <p className="dbg-note">○ accept ／ × reject ／ − neutral。ルールは上から順に適用（src/reel/rules.ts の STOP_RULE_SETS。成立中のボーナスで切り替わる）。</p>
    </details>
  );
}

// ---------------------------------------------------------------------------
// リーチ目
// ---------------------------------------------------------------------------
function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
    } catch {
      // クリップボードが使えない環境では下の欄から手でコピーする
      setCopied(false);
    }
  };
  return (
    <button type="button" className="btn-text" onClick={copy}>
      {copied ? 'コピーした' : '出目をコピー（reachme.ts 形式）'}
    </button>
  );
}

function ReachmeSection({ state }: { state: GameState }) {
  const window = buildPartialWindow(state.positions);
  const history = historyFromStops(state.stops, state.stopAt);
  const ctx = { order: history.map((h) => h.reel), masks: masksOf(conditionsOf(REACHME), history) };
  const hits = findReachme(window, REACHME, ctx);
  // 出目は一致するが押し順・押下位置・スベリの条件が合わないもの
  const shapeOnly = findReachme(window, REACHME).filter((p) => !hits.includes(p));
  const open = REACHME.filter((p) => matchReachme(window, p) === 'open');
  const text = formatAsReachme(window);
  const stoppedCount = state.positions.filter((p) => p !== null).length;
  return (
    <details className="dbg-section" open>
      <summary>リーチ目（src/config/reachme.ts）</summary>
      {REACHME.length === 0 ? (
        <p className="dbg-note">テーブルは空。下の出目をコピーして reachme.ts に貼れば登録できる。</p>
      ) : (
        <ul className="dbg-list">
          <li>一致: {hits.length === 0 ? 'なし' : hits.map((p) => `${p.label}（${p.id}）`).join(' / ')}</li>
          {shapeOnly.length > 0 && <li>出目は一致・条件が不一致: {shapeOnly.map((p) => p.id).join(' / ')}</li>}
          {stoppedCount < 3 && <li>まだ可能性あり: {open.length === 0 ? 'なし' : open.map((p) => p.id).join(' / ')}</li>}
        </ul>
      )}
      {/* 出目が変わったらコピー済み表示をリセットする */}
      <CopyButton key={text} text={text} />
      <textarea className="dbg-code" readOnly value={text} rows={9} aria-label="出目（reachme.ts 形式）" />
    </details>
  );
}

// ---------------------------------------------------------------------------
// 制御込みシミュレーション
// ---------------------------------------------------------------------------
const SIM_CHUNK = 2000;
const SIM_MAX_GAMES = 1_000_000;

interface SimPair {
  control: ControlSimResult;
  theory: SimResult;
}

/** 理論値側: その小役が当選した行（単独＋重複）の合計 */
function smallDrawnTheory(t: SimResult, role: SmallRole): number {
  return ROW_KEYS.reduce((a, k) => a + (rowToResult(k).small === role ? t.rowCounts[k] : 0), 0);
}

function simRows({ control: c, theory: t }: SimPair): [string, string, string][] {
  const cg = c.normalGames;
  const tg = t.normalGames;
  const avg = (sum: number, n: number) => (n === 0 ? '-' : (sum / n).toFixed(1));
  const bonusDrawn = BONUS_ROLES.reduce((a, k) => a + c.bonusDrawn[k], 0);
  const theoryBonusDrawn = ROW_KEYS.reduce((a, k) => a + (rowToResult(k).bonus ? t.rowCounts[k] : 0), 0);
  const bonusCount = (kind: BonusRole, r: { bigCount: number; regCount: number }) => (kind === 'REG' ? r.regCount : r.bigCount);
  return [
    ['機械割', `${controlPayoutRate(c).toFixed(2)} %`, `${payoutRate(t).toFixed(2)} %`],
    ['総ゲーム数（ボーナス中込み）', c.totalGames.toLocaleString(), t.totalGames.toLocaleString()],
    ['BIG 入賞', oneIn(cg, c.bigCount), oneIn(tg, t.bigCount)],
    ['REG 入賞', oneIn(cg, c.regCount), oneIn(tg, t.regCount)],
    ['ボーナス合算（入賞）', oneIn(cg, c.bigCount + c.regCount), oneIn(tg, t.bigCount + t.regCount)],
    ['ボーナス当選（抽選）', oneIn(cg, bonusDrawn), oneIn(tg, theoryBonusDrawn)],
    ['成立 → 入賞までの平均 G', avg(c.bonusWaitGames, c.bigCount + c.regCount), '（ハズレ時に即揃う前提）'],
    ...SMALL_ROLES.map((role): [string, string, string] => [`${ROLES[role].label} 入賞`, oneIn(cg, c.won[role]), `${oneIn(tg, smallDrawnTheory(t, role))}（当選＝入賞）`]),
    ['取りこぼし', SMALL_ROLES.map((r) => `${ROLES[r].label} ${c.lost[r]}`).join(' / '), '0（前提）'],
    ...BONUS_ROLES.map((k): [string, string, string] => [`${ROLES[k].label} 払出合計 / 消化G`, `${c.bonusPayout[k]} / ${c.bonusGames[k]}`, `${t.bonusPayout[k]} / ${t.bonusGames[k]}`]),
    ['BIG 平均枚数（7・G 合算）', avg(c.bonusPayout.BIG7 + c.bonusPayout.BIGG, bonusCount('BIG7', c)), avg(t.bonusPayout.BIG7 + t.bonusPayout.BIGG, bonusCount('BIG7', t))],
    ['REG 平均枚数', avg(c.bonusPayout.REG, c.regCount), avg(t.bonusPayout.REG, t.regCount)],
    ['投入 / 払出', `${c.coinsIn.toLocaleString()} / ${c.coinsOut.toLocaleString()}`, `${t.coinsIn.toLocaleString()} / ${t.coinsOut.toLocaleString()}`],
  ];
}

function SimSection({ initialSetting }: { initialSetting: Setting }) {
  const [setting, setSetting] = useState<Setting>(initialSetting);
  const [gamesText, setGamesText] = useState('20000');
  const [seedText, setSeedText] = useState('1');
  const [pushMode, setPushMode] = useState<PushMode>('aim');
  const [fixedText, setFixedText] = useState<[string, string, string]>(['1', '1', '1']);
  const [progress, setProgress] = useState<number | null>(null);
  const [pair, setPair] = useState<SimPair | null>(null);
  const simRef = useRef<ControlSim | null>(null);
  const timerRef = useRef(0);

  // 画面を閉じたら途中で止める
  useEffect(() => () => clearTimeout(timerRef.current), []);

  const games = readInt(gamesText, 100, SIM_MAX_GAMES);
  const seed = readInt(seedText, 0, 0xffffffff);
  const fixed = fixedText.map((t) => readInt(t, 1, KOMA_COUNT)) as [number | null, number | null, number | null];
  const fixedOk = pushMode !== 'fixed' || fixed.every((f) => f !== null);
  const running = progress !== null;

  const run = () => {
    if (games === null || seed === null || !fixedOk) return;
    clearTimeout(timerRef.current);
    const sim = createControlSim({
      setting,
      games,
      seed,
      pushMode,
      fixedPushes: pushMode === 'fixed' ? (fixed as [KomaNo, KomaNo, KomaNo]) : undefined,
    });
    simRef.current = sim;
    setPair(null);
    setProgress(0);
    const tick = () => {
      if (simRef.current !== sim) return;
      const done = sim.step(SIM_CHUNK);
      setProgress(sim.result.normalGames / games);
      if (!done) {
        timerRef.current = window.setTimeout(tick, 0);
        return;
      }
      // 理論値は同じシード・同じゲーム数で（抽選の乱数列が一致する）
      setPair({ control: sim.result, theory: simulate(setting, games, seed) });
      setProgress(null);
    };
    timerRef.current = window.setTimeout(tick, 0);
  };
  const cancel = () => {
    simRef.current = null;
    clearTimeout(timerRef.current);
    setProgress(null);
  };

  return (
    <details className="dbg-section" open>
      <summary>制御込みシミュレーション（実際の停止制御を通す）</summary>
      <div className="dbg-row-flex">
        <label>
          設定
          <select value={setting} onChange={(e) => setSetting(Number(e.target.value) as Setting)} disabled={running}>
            {ALL_SETTINGS.map((s) => (
              <option key={s} value={s}>
                設定 {s}
              </option>
            ))}
          </select>
        </label>
        <label>
          ゲーム数（通常時）
          <input type="number" inputMode="numeric" min={100} max={SIM_MAX_GAMES} value={gamesText} onChange={(e) => setGamesText(e.target.value)} disabled={running} />
        </label>
        <label>
          シード
          <input type="number" inputMode="numeric" min={0} value={seedText} onChange={(e) => setSeedText(e.target.value)} disabled={running} />
        </label>
      </div>
      <div className="dbg-row-flex">
        <label>
          <input type="radio" name="dbg-push-mode" checked={pushMode === 'aim'} onChange={() => setPushMode('aim')} disabled={running} />
          目押しあり（当選役を狙う）
        </label>
        <label>
          <input type="radio" name="dbg-push-mode" checked={pushMode === 'random'} onChange={() => setPushMode('random')} disabled={running} />
          ランダム（目押しなし）
        </label>
        <label>
          <input type="radio" name="dbg-push-mode" checked={pushMode === 'fixed'} onChange={() => setPushMode('fixed')} disabled={running} />
          順押し固定
        </label>
        {pushMode === 'fixed' &&
          ([0, 1, 2] as ReelIndex[]).map((reel) => (
            <label key={reel}>
              {REEL_NAME[reel]}
              <input
                type="number"
                inputMode="numeric"
                min={1}
                max={KOMA_COUNT}
                value={fixedText[reel]}
                disabled={running}
                onChange={(e) => {
                  const next = [...fixedText] as [string, string, string];
                  next[reel] = e.target.value;
                  setFixedText(next);
                }}
              />
            </label>
          ))}
      </div>
      <div className="dbg-row-flex">
        {running ? (
          <button type="button" className="btn-text" onClick={cancel}>
            中止
          </button>
        ) : (
          <button type="button" className="btn-text" onClick={run} disabled={games === null || seed === null || !fixedOk}>
            実行
          </button>
        )}
        {running && (
          <progress className="dbg-progress" value={progress} max={1}>
            {Math.round(progress * 100)}%
          </progress>
        )}
      </div>
      {pair && (
        <table className="dbg-table dbg-sim">
          <thead>
            <tr>
              <th>項目</th>
              <th>制御込み（{PUSH_MODE_LABEL[pair.control.pushMode]}）</th>
              <th>理論値（scripts/sim）</th>
            </tr>
          </thead>
          <tbody>
            {simRows(pair).map(([k, a, b]) => (
              <tr key={k}>
                <td>{k}</td>
                <td>{a}</td>
                <td>{b}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <p className="dbg-note">
        理論値は「小役は必ず入賞・ボーナスはハズレ時に即揃う」前提（scripts/sim/run.ts と同じ）。制御込みは同じシードで抽選し、実際の decideStop と judgeWindow を通す。「目押しあり」は当選役が揃う位置を狙って押すので理論値に近づく。「ランダム」はスイカ・チェリー・ボーナス図柄を取りこぼす（目押し役なので仕様）。
      </p>
    </details>
  );
}
