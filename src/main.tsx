import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { MACHINE } from './config/machine.ts'

// タブのタイトルも機種名に合わせる（machine.ts の1か所で切り替わる）
document.title = MACHINE.subtitle ? `${MACHINE.name} - ${MACHINE.subtitle}` : MACHINE.name

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
