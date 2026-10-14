import type { BgmId, LeverSoundId } from '../shared/types.ts';
import { BGM, SFX, type ToneSpec } from '../config/sounds.ts';

/**
 * 音の再生（Web Audio 合成）
 * - AudioContext はブラウザの制限で「ユーザー操作の後」でないと鳴らないので、
 *   最初の操作（ベット・レバー・ストップ）で unlockAudio() を呼んで resume する
 * - ミュート設定は localStorage に保存する
 */

const MUTE_KEY = 'golden-slot:muted';

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let muted = readMuted();

function readMuted(): boolean {
  try {
    return typeof localStorage !== 'undefined' && localStorage.getItem(MUTE_KEY) === '1';
  } catch {
    return false;
  }
}

export function isMuted(): boolean {
  return muted;
}

export function setMuted(value: boolean): void {
  muted = value;
  try {
    localStorage.setItem(MUTE_KEY, value ? '1' : '0');
  } catch {
    // 無視
  }
  if (master) master.gain.value = value ? 0 : 1;
  if (value) stopBgm();
}

/** 最初のユーザー操作で呼ぶ。AudioContext を作って resume する */
export function unlockAudio(): void {
  try {
    if (typeof AudioContext === 'undefined') return;
    if (!ctx) {
      ctx = new AudioContext();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : 1;
      master.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') void ctx.resume();
  } catch {
    ctx = null;
    master = null;
  }
}

/** 1 つの音列をスケジュールする。戻り値は終了時刻（秒） */
function scheduleTone(spec: ToneSpec, startAt: number): number {
  if (!ctx || !master) return startAt;
  let t = startAt;
  for (const step of spec.steps) {
    if (step.freq > 0) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = spec.type;
      osc.frequency.value = step.freq;
      // クリックノイズを避けるため短いアタック・リリースを付ける
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(spec.gain, t + 0.005);
      gain.gain.setValueAtTime(spec.gain, Math.max(t + 0.005, t + step.dur - 0.01));
      gain.gain.linearRampToValueAtTime(0, t + step.dur);
      osc.connect(gain).connect(master);
      osc.start(t);
      osc.stop(t + step.dur + 0.01);
    }
    t += step.dur;
  }
  return t;
}

function play(spec: ToneSpec): void {
  if (!ctx || muted) return;
  scheduleTone(spec, ctx.currentTime);
}

export function playLeverSound(id: LeverSoundId): void {
  if (id === 'none') return;
  play(SFX[id]);
}

export function playStopSound(): void {
  play(SFX.stop);
}

export function playBetSound(): void {
  play(SFX.bet);
}

export function playBonusConfirm(): void {
  play(SFX.bonusConfirm);
}

/** 払い出し音（count 枚ぶん、intervalMs 間隔） */
export function playPayout(count: number, intervalMs: number): void {
  if (!ctx || muted || count <= 0) return;
  const base = ctx.currentTime;
  for (let i = 0; i < count; i++) scheduleTone(SFX.coin, base + (i * intervalMs) / 1000);
}

// ---------------------------------------------------------------------------
// BGM（ループ再生。少し先までスケジュールし続ける）
// ---------------------------------------------------------------------------

let bgmTimer: ReturnType<typeof setInterval> | null = null;
let currentBgm: BgmId = 'none';

export function currentBgmId(): BgmId {
  return currentBgm;
}

export function startBgm(id: BgmId): void {
  if (id === currentBgm) return;
  stopBgm();
  if (id === 'none' || !ctx || muted) return;
  const spec = BGM[id];
  const audio = ctx;
  currentBgm = id;
  let melodyAt = audio.currentTime + 0.05;
  let bassAt = melodyAt;
  const LOOKAHEAD = 0.6;
  const tick = () => {
    while (melodyAt < audio.currentTime + LOOKAHEAD) melodyAt = scheduleTone(spec.melody, melodyAt);
    while (bassAt < audio.currentTime + LOOKAHEAD) bassAt = scheduleTone(spec.bass, bassAt);
  };
  tick();
  bgmTimer = setInterval(tick, 200);
}

export function stopBgm(): void {
  if (bgmTimer) clearInterval(bgmTimer);
  bgmTimer = null;
  currentBgm = 'none';
}
