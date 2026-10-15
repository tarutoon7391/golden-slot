import { useGame } from './store/useGame.ts';
import { Cabinet } from './ui/Cabinet.tsx';
import { isDebugEnabled } from './debug/debugFlag.ts';
import { useDebugSettings } from './debug/useDebugSettings.ts';
import { DebugPanel } from './debug/DebugPanel.tsx';
import './ui/cabinet.css';
import './debug/debug.css';

/**
 * アプリのルート。
 * ゲームの状態は useGame が持ち、筐体 UI（Cabinet）に渡すだけ。
 * `?debug=1` のときはデバッグパネルを筐体の下に出し、useGame に差し込み口を渡す。
 */
const DEBUG = isDebugEnabled();

export default function App() {
  const debug = useDebugSettings();
  const api = useGame(DEBUG ? debug.overridesRef : undefined);
  return (
    <Cabinet
      api={api}
      instantReels={DEBUG && debug.settings.skipAnimation}
      logoLamps={DEBUG ? debug.settings.logoLamps : undefined}
      debugFlash={DEBUG && debug.settings.testFlash ? { request: { id: debug.settings.testFlash.id }, startAt: debug.settings.testFlash.at } : null}
    >
      {DEBUG && <DebugPanel api={api} debug={debug} />}
    </Cabinet>
  );
}
