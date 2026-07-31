/**
 * hero 相關 frontmatter 的**唯一** coercion 點。
 *
 * 為什麼要有這一層:validator 與 resolver 若都收 raw frontmatter,coercion 就會在
 * validator、resolver、renderer 三處各自實作而漂移。用型別強制單一 parse 點才守得住。
 *
 * 每個欄位各自 parse 成 domain value,不用一顆泛用的「trim 後判空」函式 —— 三者空值語意
 * 不同:headerMask: 0 是有效值、headerImg: "" 等於未設、headerStyle 只有一個合法字面值。
 */
export type RawHeroConfiguration = {
  headerStyle?: unknown
  headerImg?: unknown
  headerBgCss?: unknown
  headerMask?: unknown
  iframe?: unknown
  layout?: unknown
}

export type ParsedHeroConfiguration = {
  headerStyle: 'text' | null
  headerImg: string | null
  headerBgCss: string | null
  headerMask: number | null
  iframe: string | null
  layout: string | null
}

/**
 * 唯一的執行期閘門。contentlayer2 0.5.8 的 `enum` 欄位只產生 TypeScript union,
 * **不驗證值**(原始碼裡是兩個 TODO),所以 `headerStyle: txt` 會被 schema 放行、
 * 生成的型別卻宣稱它是 'text'。少了這個函式,拼錯會靜默落回圖片模式。
 */
export function parseHeaderStyle(value: unknown): 'text' | null {
  if (value === undefined || value === null) return null
  if (value === 'text') return 'text'
  throw new Error(`headerStyle must be "text" when present (received ${JSON.stringify(value)})`)
}

function parseOptionalString(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed === '' ? null : trimmed
}

function parseHeaderImg(value: unknown): string | null {
  // 純空白視為未設是**刻意的行為改變**:現況會產生 "/  " 這種壞路徑。
  return parseOptionalString(value)
}

function parseHeaderBgCss(value: unknown): string | null {
  const trimmed = parseOptionalString(value)
  if (trimmed === null) return null
  // frontmatter 常帶著從 CSS 片段複製留下的尾隨分號。當成 HTML style 字串沒問題,
  // 但 React 走 client 端渲染時是透過 CSSOM setter 賦值,分號會讓整個值被判定無效
  // —— 這正是「站內連結進來背景消失、重新整理才正常」的成因。
  const cleaned = trimmed.replace(/;+\s*$/, '')
  return cleaned === '' ? null : cleaned
}

function parseHeaderMask(value: unknown): number | null {
  if (value === undefined || value === null || value === '') return null
  const parsed = Number(value)
  return Number.isNaN(parsed) ? null : parsed
}

export function parseHeroConfiguration(raw: RawHeroConfiguration): ParsedHeroConfiguration {
  return {
    headerStyle: parseHeaderStyle(raw.headerStyle),
    headerImg: parseHeaderImg(raw.headerImg),
    headerBgCss: parseHeaderBgCss(raw.headerBgCss),
    headerMask: parseHeaderMask(raw.headerMask),
    iframe: parseOptionalString(raw.iframe),
    layout: parseOptionalString(raw.layout),
  }
}
