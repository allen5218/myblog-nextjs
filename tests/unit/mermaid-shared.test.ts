import { describe, expect, it } from 'vitest'
import {
  hashDiagram,
  normalizeDefinition,
  svgFileName,
  normalizeSvg,
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
      '<svg id="m" width="10" height="10" viewBox="0 0 722 461" xmlns="http://www.w3.org/2000/svg"></svg>'
    const out = normalizeSvg(input)
    expect(out).toContain('width="722"')
    expect(out).toContain('height="461"')
    expect(out).not.toContain('width="10"')
    expect(out).not.toContain('height="10"')
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

describe('themes', () => {
  it('兩套主題都用 base + 品牌青,且背景相異', () => {
    expect(LIGHT_THEME.theme).toBe('base')
    expect(DARK_THEME.theme).toBe('base')
    expect(LIGHT_THEME.themeVariables.background).not.toBe(DARK_THEME.themeVariables.background)
  })
})
