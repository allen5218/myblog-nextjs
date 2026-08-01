import { describe, expect, it } from 'vitest'
import {
  hashDiagram,
  normalizeDefinition,
  svgFileName,
  normalizeSvg,
  parseSvgRootDimensions,
  extractMermaidDefinitions,
  LIGHT_THEME,
  DARK_THEME,
} from '../../scripts/mermaid-shared.mjs'

describe('normalizeDefinition', () => {
  it('去除尾端空白與 CRLF,讓不同來源的定義雜湊一致', () => {
    expect(normalizeDefinition('graph TD\r\n  A-->B\n\n')).toBe('graph TD\n  A-->B')
  })
})

describe('hashDiagram', () => {
  it('相同定義(忽略尾端換行差異)得到相同 hash', () => {
    expect(hashDiagram('graph TD\n A-->B')).toBe(hashDiagram('graph TD\n A-->B\n'))
  })
  it('不同定義得到不同 hash', () => {
    expect(hashDiagram('graph TD\n A-->B')).not.toBe(hashDiagram('graph TD\n A-->C'))
  })
})

describe('svgFileName', () => {
  it('用 hash 與 variant 組出檔名', () => {
    expect(svgFileName('abc123', 'light')).toBe('abc123.light.svg')
    expect(svgFileName('abc123', 'dark')).toBe('abc123.dark.svg')
  })
})

describe('normalizeSvg', () => {
  it('用 viewBox 尺寸補上 width/height 並移除 max-width inline style', () => {
    const input =
      '<svg id="m" viewBox="0 0 320 180" style="max-width: 320px;" xmlns="http://www.w3.org/2000/svg"></svg>'
    const out = normalizeSvg(input)
    expect(out).toContain('width="320"')
    expect(out).toContain('height="180"')
    expect(out).not.toContain('max-width')
  })

  it('viewBox origin 非零/負值(timeline、gitGraph、sequence 常見)時仍取寬高', () => {
    const input =
      '<svg id="m" viewBox="100 -61 1190 592.2" xmlns="http://www.w3.org/2000/svg"></svg>'
    const out = normalizeSvg(input)
    expect(out).toContain('width="1190"')
    expect(out).toContain('height="592.2"')
  })

  it('已有過期的 width/height(如 mindmap 殘留的 10x10)時用 viewBox 覆蓋', () => {
    const input =
      '<svg id="m" width="10" height="10" viewBox="5 5 722 461" xmlns="http://www.w3.org/2000/svg"></svg>'
    const out = normalizeSvg(input)
    expect(out).toContain('width="722"')
    expect(out).toContain('height="461"')
    expect(out).not.toContain('width="10"')
    expect(out).not.toContain('height="10"')
  })

  // mermaid 把節點標籤裡的 `<br/>` 序列化成裸 `<br>`(HTML void element)寫進
  // foreignObject。SVG 走 `<img src>` 載入時是嚴格 XML 解析,裸 `<br>` 讓整份文件
  // 解析失敗 —— 瀏覽器不報錯、請求也是 200,圖只是變成沒有固有尺寸的一條細線。
  it('把 foreignObject 裡的裸 <br> 補成自閉合,否則 <img> 的 XML 解析會整份失敗', () => {
    const input =
      '<svg id="m" viewBox="0 0 320 180" xmlns="http://www.w3.org/2000/svg">' +
      '<foreignObject><div>第一行<br>第二行</div></foreignObject></svg>'
    const out = normalizeSvg(input)
    expect(out).toContain('第一行<br/>第二行')
    expect(out).not.toMatch(/<br(?!\/)[\s>]/)
  })
})

describe('extractMermaidDefinitions', () => {
  it('抽出所有 mermaid fence,忽略其他語言與 frontmatter', () => {
    const md = [
      '---',
      'title: t',
      '---',
      '',
      '```mermaid',
      'graph TD',
      '  A-->B',
      '```',
      '',
      '```js',
      'const x = 1',
      '```',
      '',
      '```mermaid',
      'sequenceDiagram',
      '  A->>B: hi',
      '```',
    ].join('\n')
    const defs = extractMermaidDefinitions(md)
    expect(defs).toHaveLength(2)
    expect(defs[0]).toContain('graph TD')
    expect(defs[1]).toContain('sequenceDiagram')
  })
})

describe('parseSvgRootDimensions', () => {
  // producer(render 寫檔前)與 consumer(rehype 產生 <img>)共用同一個實作是刻意的:
  // 兩邊各一套 parser 會出現「producer 過關、consumer 仍解析失敗」的縫隙。
  it('抽出小數尺寸(mermaid 的 viewBox 幾乎都是小數,現有 10 組有 7 組)', () => {
    const svg =
      '<svg height="461.63739013671875" width="722.8872680664062" viewBox="0 0 722.8872680664062 461.63739013671875"></svg>'
    expect(parseSvgRootDimensions(svg)).toEqual({
      width: 722.8872680664062,
      height: 461.63739013671875,
    })
  })

  it('屬性順序與夾雜的其他屬性不影響抽取', () => {
    const svg = '<svg id="mmd-abc-dark" class="classDiagram" width="650" role="img" height="355">'
    expect(parseSvgRootDimensions(svg)).toEqual({ width: 650, height: 355 })
  })

  it('缺 width 或缺 height 回傳 null', () => {
    expect(parseSvgRootDimensions('<svg height="10"></svg>')).toBeNull()
    expect(parseSvgRootDimensions('<svg width="10"></svg>')).toBeNull()
  })

  it('非數字(例如未被清掉的 width="100%")回傳 null', () => {
    expect(parseSvgRootDimensions('<svg width="100%" height="10"></svg>')).toBeNull()
  })

  it('零或負值回傳 null —— 零尺寸保留不了版位,與缺尺寸同樣有害', () => {
    expect(parseSvgRootDimensions('<svg width="0" height="10"></svg>')).toBeNull()
    expect(parseSvgRootDimensions('<svg width="10" height="-5"></svg>')).toBeNull()
  })

  // consumer 會 Math.round 後寫進 HTML 屬性,所以不變量必須是「取整後仍為正」。
  // 只檢查原始值 > 0 的話,0.4 會通過 parser 卻輸出 width="0"。
  it('取整後會變成 0 的尺寸回傳 null', () => {
    expect(parseSvgRootDimensions('<svg width="0.4" height="10"></svg>')).toBeNull()
    expect(parseSvgRootDimensions('<svg width="10" height="0.49"></svg>')).toBeNull()
    // 0.5 取整是 1,仍然可用 —— 邊界不能連坐。
    expect(parseSvgRootDimensions('<svg width="0.5" height="10"></svg>')).toEqual({
      width: 0.5,
      height: 10,
    })
  })

  // Number() 接受 JS 數字字面值,但 SVG 的 <length> 只有十進位寫法。
  it('hex / binary 等非 SVG 十進位寫法回傳 null', () => {
    expect(parseSvgRootDimensions('<svg width="0x10" height="0b10"></svg>')).toBeNull()
    expect(parseSvgRootDimensions('<svg width="1_0" height="10"></svg>')).toBeNull()
  })

  // 直接對整段搜尋 ` width="` 會抓到別的屬性值裡的假字串。
  it('屬性值內含假的 width= 字串時不被穿透', () => {
    expect(
      parseSvgRootDimensions(`<svg data-note=' width="999"' width="10" height="20"></svg>`)
    ).toEqual({ width: 10, height: 20 })
  })

  // 根元素不是 <svg> 的文件不能當成可直接餵給 <img> 的資源。
  it('svg 不是文件第一個元素時回傳 null', () => {
    expect(parseSvgRootDimensions('<wrapper><svg width="10" height="20"></svg></wrapper>')).toBeNull()
  })

  it('沒有 svg 根標籤回傳 null', () => {
    expect(parseSvgRootDimensions('<html><body>nope</body></html>')).toBeNull()
  })

  // mermaid 只輸出雙引號。單引號能通過是「引號感知掃描」的副產物 —— 為了不被
  // `data-note='…'` 這類屬性誤導,掃描本來就必須認得兩種引號,額外再去拒絕單引號的
  // width/height 只會多一條沒人需要的規則。這裡把這個副產物釘住,避免日後誤以為是 bug。
  it('單引號的 width/height 也能解析(引號感知掃描的副產物)', () => {
    expect(parseSvgRootDimensions("<svg width='10' height='20'></svg>")).toEqual({
      width: 10,
      height: 20,
    })
  })
})

describe('themes', () => {
  it('兩套主題都用 base + 品牌青,且背景相異', () => {
    expect(LIGHT_THEME.theme).toBe('base')
    expect(DARK_THEME.theme).toBe('base')
    expect(LIGHT_THEME.themeVariables.background).not.toBe(DARK_THEME.themeVariables.background)
  })
})
