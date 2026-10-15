import { MACHINE } from '../config/machine.ts';

/**
 * ロゴパネルの点灯状態（LogoPanel から分離。コンポーネント以外の export を分けるため）
 * 区切りは MACHINE.logoSegments（GO / LD / EN）。区切りごとに独立して点灯できる。
 */

export type LogoLamp = 'off' | 'on';

/** 区切りごとの点灯状態（MACHINE.logoSegments と同じ並び） */
export type LogoLamps = readonly LogoLamp[];

/** 全消灯 */
export const LOGO_ALL_OFF: LogoLamps = MACHINE.logoSegments.map(() => 'off' as const);
