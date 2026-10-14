import { MACHINE } from './config/machine.ts'

/**
 * アプリのルート。
 * フェーズ0では機種名を表示するだけの土台。フェーズ4で筐体UIに差し替える。
 */
export default function App() {
  return (
    <main className="app">
      <h1 className="title">{MACHINE.name}</h1>
      <p className="subtitle">{MACHINE.subtitle}</p>
      <p className="note">土台（フェーズ0）: 画面はフェーズ4で実装します</p>
      <p className="version">v{MACHINE.version}</p>
    </main>
  )
}
