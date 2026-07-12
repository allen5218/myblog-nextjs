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
    additionalPrecacheEntries: [{ url: '/offline/', revision }],
  }
)
