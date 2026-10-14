/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  test: {
    // src 配下と test 配下の *.test.ts を対象にする
    include: ['src/**/*.test.ts', 'test/**/*.test.ts'],
    // 停止制御の総当たり（21^3 × 6 押し順）や制御込みシミュレーションは数秒かかる
    testTimeout: 60_000,
  },
})
