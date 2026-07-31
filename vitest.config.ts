import { defineConfig } from 'vitest/config'
import { resolve } from 'path'

// 單元測試設定。收 tests/unit 下的 *.test.ts 與 *.test.tsx,
// 避免和 tests/playwright 的 parity specs(用 @playwright/test)衝突。
// 有 .tsx 是因為 hero rendering test 要用 renderToStaticMarkup 渲染 JSX。
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/unit/**/*.test.ts', 'tests/unit/**/*.test.tsx'],
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
