import withBundleAnalyzerInit from '@next/bundle-analyzer'
import { withSerwist } from '@serwist/turbopack'

const withBundleAnalyzer = withBundleAnalyzerInit({
  enabled: process.env.ANALYZE === 'true',
})

// 'unsafe-eval' 只有 dev 工具鏈需要(webpack/turbopack 的 eval sourcemap、React Fast Refresh),
// production bundle 不使用 eval,因此只在 dev 模式加入,縮小正式環境的 XSS 攻擊面。
const isDev = process.env.NODE_ENV === 'development'

// 【已停用的 starter 模板殘留來源 — 暫時保留紀錄,勿直接復原】
// 以下兩個來源是 tailwind-nextjs-starter-blog 模板預設值,站內內容實際上都沒有使用
// (2026-07-10 全站 grep 確認),先從 CSP 移除、保留註解以便日後追溯:
//
// 1. media-src 的 `https://*.s3.amazonaws.com`
//    風險:萬用字元涵蓋「所有人」的 S3 bucket(包括攻擊者自己開的),等於允許載入任意
//    第三方控制的媒體。若日後真的要用 S3,請改成指定 bucket 的完整網域,不要用萬用字元。
//
// 2. img-src 的 `https://picsum.photos`(以及下方 images.remotePatterns 對應項目)
//    風險:純屬模板示範圖床,每多一個允許來源就多一分內容注入面;重新啟用前請先確認
//    內容確實需要。
//
// You might need to insert additional domains in script-src if you are using external services
const ContentSecurityPolicy = `
  default-src 'self';
  base-uri 'self';
  object-src 'none';
  frame-ancestors 'none';
  script-src 'self' ${isDev ? "'unsafe-eval' " : ''}'unsafe-inline' https://giscus.app https://www.googletagmanager.com;
  style-src 'self' 'unsafe-inline';
  img-src 'self' https://img.allenspace.de https://www.google-analytics.com https://www.googletagmanager.com blob: data:;
  media-src 'self';
  connect-src 'self' https://img.allenspace.de https://giscus.app https://www.google-analytics.com https://*.google-analytics.com https://*.analytics.google.com https://www.googletagmanager.com;
  font-src 'self';
  frame-src https://giscus.app https://slide.allenspace.de https://www.youtube-nocookie.com https://youtube-nocookie.com https://player.vimeo.com;
  form-action 'self';
  upgrade-insecure-requests;
`

const securityHeaders = [
  // https://developer.mozilla.org/en-US/docs/Web/HTTP/CSP
  {
    key: 'Content-Security-Policy',
    value: ContentSecurityPolicy.replace(/\n/g, ''),
  },
  // https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Referrer-Policy
  {
    key: 'Referrer-Policy',
    value: 'strict-origin-when-cross-origin',
  },
  // https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/X-Frame-Options
  {
    key: 'X-Frame-Options',
    value: 'DENY',
  },
  // https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/X-Content-Type-Options
  {
    key: 'X-Content-Type-Options',
    value: 'nosniff',
  },
  // https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/X-DNS-Prefetch-Control
  {
    key: 'X-DNS-Prefetch-Control',
    value: 'on',
  },
  // https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Strict-Transport-Security
  {
    key: 'Strict-Transport-Security',
    value: 'max-age=31536000; includeSubDomains',
  },
  // https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Feature-Policy
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=()',
  },
]

const output = process.env.EXPORT ? 'export' : undefined
const basePath = process.env.BASE_PATH || undefined
const unoptimized = process.env.UNOPTIMIZED ? true : undefined

/**
 * @type {import('next').NextConfig}
 **/
const nextConfig = {
  output,
  basePath,
  reactStrictMode: true,
  trailingSlash: true,
  turbopack: {
    root: process.cwd(),
    rules: {
      '*.svg': {
        loaders: ['@svgr/webpack'],
        as: '*.js',
      },
    },
  },
  pageExtensions: ['ts', 'tsx', 'js', 'jsx', 'md', 'mdx'],
  images: {
    remotePatterns: [
      // picsum.photos 為 starter 模板示範圖床,內容未使用,已隨 CSP img-src 一併停用
      // (風險說明見上方 CSP 註解區)。若要復原,CSP 的 img-src 也要同步加回。
      // {
      //   protocol: 'https',
      //   hostname: 'picsum.photos',
      // },
      {
        protocol: 'https',
        hostname: 'img.allenspace.de',
      },
    ],
    unoptimized,
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: securityHeaders,
      },
    ]
  },
  // 分頁改回 jekyll-paginate 的語意:首頁就是第 1 頁,第 2 頁起是 /pageN/。
  // 舊的 /blog 列表與它的 page/1 分身曾與首頁內容完全相同,一律永久導向新網址。
  // 注意:redirects() 在 EXPORT=1 靜態匯出下不會生效,屆時要改由網頁伺服器承接。
  async redirects() {
    return [
      { source: '/blog', destination: '/', permanent: true },
      // 必須排在下面的數字規則之前,否則 page/1 會被導到不存在的 /page1/。
      { source: '/blog/page/1', destination: '/', permanent: true },
      // 帶參數的 destination 不會被 trailingSlash 正規化,結尾斜線要自己補,
      // 否則 Location 是 /page2,瀏覽器還得再吃一次 308 才到 /page2/(多餘的轉址鏈)。
      { source: '/blog/page/:page(\\d+)', destination: '/page:page/', permanent: true },
      { source: '/tags/:tag/page/1', destination: '/tags/:tag/', permanent: true },
    ]
  },
}

// @next/bundle-analyzer 只支援 webpack;`yarn analyze` 會明確改走 webpack build。
export default withSerwist(withBundleAnalyzer(nextConfig))
