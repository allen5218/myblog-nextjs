/**
 * 兩套測試共用的唯一顏色實作。分散成兩份的話,其中一份丟掉 alpha 的錯誤會持續存在
 * —— series.spec.ts 原本那份就是這樣。
 */
export type Rgb = { r: number; g: number; b: number; a: number }

function clamp01(value: number) {
  return Math.min(1, Math.max(0, value))
}

function parseHex(value: string): Rgb {
  const hex = value.slice(1)
  const expand = (chunk: string) => parseInt(chunk.length === 1 ? chunk + chunk : chunk, 16)
  const size = hex.length <= 4 ? 1 : 2
  const at = (index: number) => hex.slice(index * size, index * size + size)
  const alpha = hex.length === 4 || hex.length === 8 ? expand(at(3)) / 255 : 1
  return { r: expand(at(0)), g: expand(at(1)), b: expand(at(2)), a: alpha }
}

function parseRgb(value: string): Rgb {
  const parts = value
    .slice(value.indexOf('(') + 1, value.lastIndexOf(')'))
    .split(/[,/\s]+/)
    .filter(Boolean)
    .map(Number)
  if (parts.length < 3 || parts.some(Number.isNaN)) {
    throw new Error(`Unsupported color: ${value}`)
  }
  return { r: parts[0], g: parts[1], b: parts[2], a: parts.length > 3 ? parts[3] : 1 }
}

/** oklch → oklab → linear sRGB → gamma-encoded sRGB。 */
function parseOklch(value: string): Rgb {
  const body = value.slice(value.indexOf('(') + 1, value.lastIndexOf(')'))
  const [coords, alphaPart] = body.split('/')
  const parts = coords.trim().split(/\s+/).map(Number)
  if (parts.length < 3 || parts.some(Number.isNaN)) {
    throw new Error(`Unsupported color: ${value}`)
  }
  const [lightness, chroma, hueDegrees] = parts
  const hue = (hueDegrees * Math.PI) / 180
  const a = chroma * Math.cos(hue)
  const b = chroma * Math.sin(hue)

  const l = (lightness + 0.3963377774 * a + 0.2158037573 * b) ** 3
  const m = (lightness - 0.1055613458 * a - 0.0638541728 * b) ** 3
  const s = (lightness - 0.0894841775 * a - 1.291485548 * b) ** 3

  const linear = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ].map((channel) => {
    const clamped = clamp01(channel)
    const encoded = clamped <= 0.0031308 ? 12.92 * clamped : 1.055 * clamped ** (1 / 2.4) - 0.055
    return clamp01(encoded) * 255
  })

  const alpha = alphaPart === undefined ? 1 : Number(alphaPart.trim())
  if (Number.isNaN(alpha)) throw new Error(`Unsupported color: ${value}`)
  return { r: linear[0], g: linear[1], b: linear[2], a: alpha }
}

/**
 * lab(D50) → XYZ(D50) → Bradford 轉 XYZ(D65) → linear sRGB → gamma-encoded sRGB。
 *
 * Tailwind v4 預設色盤(如 gray-800)用 oklch 定義,經 Lightning CSS 編譯後除了
 * sRGB fallback 還會留一份 lab() 精確值;支援 CSS Color 4 的 Chromium 讀
 * getComputedStyle 時回傳的正是 lab() 這份,不會退回 fallback 的 hex。矩陣常數已用
 * 已知解答(同一份編譯輸出裡的 sRGB fallback,例如 gray-800 的 #1e2939)驗證過一致。
 */
function parseLab(value: string): Rgb {
  const body = value.slice(value.indexOf('(') + 1, value.lastIndexOf(')'))
  const [coords, alphaPart] = body.split('/')
  const raw = coords.trim().split(/\s+/)
  if (raw.length < 3) throw new Error(`Unsupported color: ${value}`)
  const [lightness, a, b] = raw.map((part) => Number(part.replace('%', '')))
  if ([lightness, a, b].some(Number.isNaN)) throw new Error(`Unsupported color: ${value}`)

  const kappa = 24389 / 27
  const eps = 216 / 24389
  const fy = (lightness + 16) / 116
  const fx = a / 500 + fy
  const fz = fy - b / 200
  const whiteD50 = [0.96422, 1.0, 0.82521]
  const xyzD50 = [
    fx ** 3 > eps ? fx ** 3 : (116 * fx - 16) / kappa,
    lightness > kappa * eps ? ((lightness + 16) / 116) ** 3 : lightness / kappa,
    fz ** 3 > eps ? fz ** 3 : (116 * fz - 16) / kappa,
  ].map((channel, index) => channel * whiteD50[index])

  const multiply = (matrix: number[][], vector: number[]) =>
    matrix.map((row) => row[0] * vector[0] + row[1] * vector[1] + row[2] * vector[2])

  // Bradford D50 → D65。
  const xyzD65 = multiply(
    [
      [0.9554734527042182, -0.023098536874261423, 0.0632593086610217],
      [-0.028369706963208136, 1.0099954580058226, 0.021041398966943008],
      [0.012314001688319899, -0.020507696433477912, 1.3303659366080753],
    ],
    xyzD50
  )

  // XYZ(D65) → linear sRGB。
  const linear = multiply(
    [
      [3.2404542, -1.5371385, -0.4985314],
      [-0.969266, 1.8760108, 0.041556],
      [0.0556434, -0.2040259, 1.0572252],
    ],
    xyzD65
  ).map((channel) => {
    const clamped = clamp01(channel)
    const encoded = clamped <= 0.0031308 ? 12.92 * clamped : 1.055 * clamped ** (1 / 2.4) - 0.055
    return clamp01(encoded) * 255
  })

  const alpha = alphaPart === undefined ? 1 : Number(alphaPart.trim().replace('%', ''))
  if (Number.isNaN(alpha)) throw new Error(`Unsupported color: ${value}`)
  return { r: linear[0], g: linear[1], b: linear[2], a: alpha }
}

export function parseColor(value: string): Rgb {
  const normalized = value.trim().toLowerCase()
  // 只有 3/4/6/8 位是合法的 hex 長度。寫成 {3,8} 會收下 #12345 這種 5 位值,
  // 而 parseHex 會用 size=2 去切它,靜默算出一個看似合理的錯誤顏色。
  if (/^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/.test(normalized)) return parseHex(normalized)
  if (normalized.startsWith('rgb')) return parseRgb(normalized)
  if (normalized.startsWith('oklch')) return parseOklch(normalized)
  if (normalized.startsWith('lab')) return parseLab(normalized)
  throw new Error(`Unsupported color: ${value}`)
}

export function compositeOver(top: Rgb, bottom: Rgb): Rgb {
  const alpha = top.a + bottom.a * (1 - top.a)
  if (alpha === 0) return { r: 0, g: 0, b: 0, a: 0 }
  const blend = (topChannel: number, bottomChannel: number) =>
    (topChannel * top.a + bottomChannel * bottom.a * (1 - top.a)) / alpha
  return {
    r: blend(top.r, bottom.r),
    g: blend(top.g, bottom.g),
    b: blend(top.b, bottom.b),
    a: alpha,
  }
}

/**
 * layers 由上而下。必須以一個不透明層收尾 —— 沒有的話拋錯而不是猜一個底色,
 * 因為猜錯會讓對比數字看起來合理卻是錯的。
 */
export function flattenLayers(layers: string[]): Rgb {
  let result: Rgb | null = null
  for (const layer of layers) {
    const parsed = parseColor(layer)
    result = result === null ? parsed : compositeOver(result, parsed)
    if (result.a >= 1) return { ...result, a: 1 }
  }
  throw new Error(`Layer stack never reaches an opaque background: ${layers.join(' over ')}`)
}

export function relativeLuminance(color: Rgb): number {
  const [r, g, b] = [color.r, color.g, color.b]
    .map((channel) => channel / 255)
    .map((channel) => (channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4))
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

export function contrastRatio(foreground: Rgb, background: Rgb): number {
  const [lighter, darker] = [relativeLuminance(foreground), relativeLuminance(background)].sort(
    (left, right) => right - left
  )
  return (lighter + 0.05) / (darker + 0.05)
}

/** 前景色對「一疊背景攤平後的實際顏色」的對比。 */
export function contrastOf(foreground: string, backgroundLayers: string[]): number {
  const background = flattenLayers(backgroundLayers)
  const parsedForeground = parseColor(foreground)
  const effective =
    parsedForeground.a >= 1 ? parsedForeground : compositeOver(parsedForeground, background)
  return contrastRatio(effective, background)
}
