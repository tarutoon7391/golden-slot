import { useGame } from './store/useGame.ts';
import { Cabinet } from './ui/Cabinet.tsx';
import './ui/cabinet.css';

/**
 * アプリのルート。
 * ゲームの状態は useGame が持ち、筐体 UI（Cabinet）に渡すだけ。
 */
export default function App() {
  const api = useGame();
  return <Cabinet api={api} />;
}
