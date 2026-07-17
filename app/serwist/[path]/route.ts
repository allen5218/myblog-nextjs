import { spawnSync } from 'node:child_process'
import crypto from 'node:crypto'
import { createSerwistRoute } from '@serwist/turbopack'

// git commit hash 當作 offline fallback 的 precache revision;Vercel build 容器
// 不帶 .git,改讀 VERCEL_GIT_COMMIT_SHA;兩者都沒有時退回隨機 uuid ——
// 只用來讓 Serwist 判斷是否更新這筆快取。route 是 force-static,
// revision 在 build 時定案,不會 runtime 漂移。
const revision =
  spawnSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf-8' }).stdout?.trim() ||
  process.env.VERCEL_GIT_COMMIT_SHA ||
  crypto.randomUUID()

export const { dynamic, dynamicParams, revalidate, generateStaticParams, GET } = createSerwistRoute(
  {
    swSrc: 'app/sw.ts',
    // 非 Windows 平台預設 useNativeEsbuild=false,會要求 esbuild-wasm(未安裝);
    // 改用專案本來就釘住的原生 esbuild。
    useNativeEsbuild: true,
    // defaultCache 已會在實際請求時快取頁面與靜態資源;不要再沿用 Serwist 預設的
    // `.next/static/**/*` + `public/**/*` glob。否則首次安裝會立刻下載全站圖片、
    // 所有 JS/CSS 與 OG 專用字型(目前約 5.4 MiB),即使當前頁面完全用不到。
    // 但離線後備頁必須與線上一致,不能退化成無樣式頁面,所以預快取它的呈現
    // 依賴(合計約 0.5 MiB):全站 CSS、Chiron core 字型(後備頁固定 UI 文字
    // 全在 core)與 hero 背景圖。JS chunks 無法在這裡列舉(Turbopack prerender
    // 順序沒有保證,此 route 產生時 offline.html 未必存在),由 app/sw.ts 在
    // activate 時解析 /offline/ HTML 暖入 runtime 快取,讓離線後備頁也能完整
    // hydration(ThemeSwitch 等 client 元件 SSR 時是佔位外觀)。
    globPatterns: [
      '.next/static/**/*.css',
      'public/static/fonts/chiron/core.*.woff2',
      'public/img/404-bg.webp',
    ],
    additionalPrecacheEntries: [{ url: '/offline/', revision }],
  }
)
