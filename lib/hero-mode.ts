import type { ParsedHeroConfiguration } from './hero-config'
import { resolveHeroIframeSrc } from './iframe'

/**
 * kind 用 css-background 而非 gradient:頁面端接受任意 CSS background 值,
 * 只有社群卡限定 linear-gradient。命名要反映實情。
 */
export type HeroMode =
  | { kind: 'keynote'; iframeSrc: string }
  | { kind: 'text' }
  | { kind: 'css-background'; background: string }
  | { kind: 'image'; url: string; fallbackColor: string | null }

export type HeroSurface = {
  mode: HeroMode
  maskOpacity: number | null
}

const DEFAULT_HEADER_IMAGE = '/img/home-bg.avif'
const DEFAULT_HEADER_FALLBACK_COLOR = '#2D2D2D'

function resolveHeaderImage(src: string | null) {
  if (src === null) return DEFAULT_HEADER_IMAGE
  if (src.startsWith('http') || src.startsWith('/')) return src
  return `/${src}`
}

/**
 * 優先序 keynote > text > css-background > image。
 * keynote 排最前是沿用既有 hasIframe 短路的先例;text 必須先於 headerBgCss 判斷,
 * 即使 build 已擋掉並存,執行期順序仍要正確。
 */
export function resolveHeroSurface(config: ParsedHeroConfiguration): HeroSurface {
  const maskOpacity = config.headerMask
  const iframeSrc = resolveHeroIframeSrc(config.iframe ?? undefined)

  if (iframeSrc) return { mode: { kind: 'keynote', iframeSrc }, maskOpacity }
  // text 模式強制沒有遮罩:沒有底圖就沒有東西需要壓暗,而遮罩會在頁面底色上疊一層灰。
  if (config.headerStyle === 'text') return { mode: { kind: 'text' }, maskOpacity: null }
  if (config.headerBgCss !== null) {
    return { mode: { kind: 'css-background', background: config.headerBgCss }, maskOpacity }
  }

  return {
    mode: {
      kind: 'image',
      url: resolveHeaderImage(config.headerImg),
      // 未填圖時額外鋪一層底色;明填 URL 時沿用 class 的 #777。
      fallbackColor: config.headerImg === null ? DEFAULT_HEADER_FALLBACK_COLOR : null,
    },
    maskOpacity,
  }
}
