import { defineConfig } from 'vitest/config'
import { resolve } from 'path'

// 單元測試設定。只收 tests/unit 下的 *.test.ts,
// 避免和 tests/playwright 的 parity specs(用 @playwright/test)衝突。
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/unit/**/*.test.ts'],
  },
  resolve: {
    alias: {
      '@/lib': resolve(__dirname, 'lib'),
      '@/components': resolve(__dirname, 'components'),
      '@/data': resolve(__dirname, 'data'),
      '@/layouts': resolve(__dirname, 'layouts'),
    },
  },
})
