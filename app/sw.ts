import { defaultCache } from '@serwist/turbopack/worker'
import type { PrecacheEntry, SerwistGlobalConfig } from 'serwist'
import { CacheFirst, ExpirationPlugin, Serwist } from 'serwist'

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined
  }
}

declare const self: ServiceWorkerGlobalScope

// /_next/static 的 JS 是 content-hashed 不可變資產,改用較長效期的 CacheFirst
// 並放在 defaultCache 之前(Serwist 依序取第一個命中的 route)。cache 名沿用
// defaultCache 既有的 `next-static-js-assets`,直接接管既有使用者的快取內容,
// 不會留下永遠沒人讀寫的孤兒 cache。這個快取同時是離線後備頁的 hydration
// 來源:activate 時預先暖入 /offline/ 引用的 chunks(見下),讓離線後備頁與
// 線上完全一致 —— 主題切換、選單等 client 元件在離線時也能正常 hydration。
const IMMUTABLE_SCRIPT_CACHE = 'next-static-js-assets'

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: [
    {
      matcher: /\/_next\/static\/.+\.js$/i,
      handler: new CacheFirst({
        cacheName: IMMUTABLE_SCRIPT_CACHE,
        plugins: [
          new ExpirationPlugin({
            maxEntries: 128,
            maxAgeSeconds: 30 * 24 * 60 * 60,
            maxAgeFrom: 'last-used',
          }),
        ],
      }),
    },
    ...defaultCache,
  ],
  fallbacks: {
    entries: [
      {
        url: '/offline/',
        matcher({ request }) {
          return request.destination === 'document'
        },
      },
    ],
  },
})

// 離線後備頁的 JS chunks 無法在 build 期列進 precache(Turbopack 的 prerender
// 順序沒有保證,sw route 產生時 offline.html 未必存在),改在 activate 時解析
// 目前部署的 /offline/ HTML 暖入。best-effort:失敗時保持現狀(後備頁仍有
// precache 的 HTML/CSS/字型/hero 圖,只是離線時不 hydration),下次 activate 重試。
async function warmOfflineFallbackScripts() {
  try {
    const response = await fetch('/offline/')
    if (!response.ok) return
    const html = await response.text()
    const urls = [
      ...new Set(
        Array.from(html.matchAll(/\/_next\/static\/[^"'\s]+\.js/g), (match) => match[0])
      ),
    ]
    const cache = await caches.open(IMMUTABLE_SCRIPT_CACHE)
    await Promise.all(
      urls.map(async (url) => {
        if (await cache.match(url)) return
        const asset = await fetch(url)
        if (asset.ok) await cache.put(url, asset)
      })
    )
  } catch (error) {
    console.warn('offline fallback script warmup failed; retrying on next activate', error)
  }
}

self.addEventListener('activate', (event) => {
  event.waitUntil(warmOfflineFallbackScripts())
})

serwist.addEventListeners()
