import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import { collectSiteFontCorpus } from '../../scripts/site-font-text.mjs'

const fixtureRoots: string[] = []

afterEach(async () => {
  await Promise.all(
    fixtureRoots.splice(0).map((root) => rm(root, { recursive: true, force: true }))
  )
})

async function fixtureRoot({ includeFlag = false } = {}) {
  const root = await mkdtemp(path.join(tmpdir(), 'site-font-text-'))
  fixtureRoots.push(root)
  await Promise.all([
    mkdir(path.join(root, 'data/blog/nested'), { recursive: true }),
    mkdir(path.join(root, 'dictionaries'), { recursive: true }),
  ])
  await writeFile(path.join(root, 'package.json'), '{"type":"commonjs"}')
  await writeFile(
    path.join(root, 'data/siteMetadata.js'),
    "module.exports = { title: 'Metadata 正', description: 'Site description' }\n"
  )
  await writeFile(path.join(root, 'dictionaries/zh-TW.json'), '{"nav":{"home":"首頁"}}')
  await writeFile(path.join(root, 'dictionaries/en.json'), '{"nav":{"home":"Home"}}')
  await writeFile(
    path.join(root, 'data/blog/one.md'),
    `# 臺共共\ne\u0301 😀\ufe0f${includeFlag ? ' 🇹🇼' : ''}\u0001`
  )
  await writeFile(path.join(root, 'data/blog/nested/two.mdx'), '# 共\né')
  await writeFile(path.join(root, 'data/blog/nested/three.markdown'), '# Third')
  return root
}

describe('collectSiteFontCorpus', () => {
  function expectSeedToCover(seed: Set<number>, text: string) {
    for (const character of text) expect(seed).toContain(character.codePointAt(0))
  }

  it('collects the fixed seed and complete nested Markdown documents as code points', async () => {
    const corpus = await collectSiteFontCorpus(await fixtureRoot())

    expect(corpus.fixedSeed).toContain('A'.codePointAt(0))
    expectSeedToCover(
      corpus.fixedSeed,
      'Previous Next Search articles Theme switcher Light Dark System Toggle navigation'
    )
    expectSeedToCover(
      corpus.fixedSeed,
      '離線閱讀過的頁面可以在離線時訪問哦 ;)已瀏覽過的頁面仍會從快取顯示,重新連線後即可繼續閱讀其他文章。回首頁 →'
    )
    expect(corpus.fixedSeed).toContain('首'.codePointAt(0))
    expect(corpus.fixedSeed).toContain('正'.codePointAt(0))
    expect(corpus.documents.get('data/blog/one.md')).toContain('臺'.codePointAt(0))
    expect(corpus.documents.has('data/blog/nested/two.mdx')).toBe(true)
    expect(corpus.documents.has('data/blog/nested/three.markdown')).toBe(true)
  })

  it('normalizes NFC and counts a code point at most once per document', async () => {
    const corpus = await collectSiteFontCorpus(await fixtureRoot())

    expect(corpus.documents.get('data/blog/one.md')).toContain('é'.codePointAt(0))
    expect(corpus.documents.get('data/blog/one.md')).not.toContain('e'.codePointAt(0))
    expect(corpus.occurrences.get('共'.codePointAt(0))?.size).toBe(2)
    expect(corpus.occurrences.get('é'.codePointAt(0))?.size).toBe(2)
  })

  it('records emoji, variation selectors, and controls as explicit exclusions', async () => {
    const corpus = await collectSiteFontCorpus(await fixtureRoot({ includeFlag: true }))

    expect(corpus.excluded.get('emoji')).toContain('😀'.codePointAt(0))
    expect(corpus.excluded.get('emoji')).toContain('🇹'.codePointAt(0))
    expect(corpus.excluded.get('emoji')).toContain('🇼'.codePointAt(0))
    expect(corpus.excluded.get('variation-selector')).toContain(0xfe0f)
    expect(corpus.excluded.get('control')).toContain(1)
  })

  it('rejects categories that are neither supported nor explicitly excluded', async () => {
    const root = await fixtureRoot()
    await writeFile(path.join(root, 'data/blog/unknown.md'), '\u20dd')

    await expect(collectSiteFontCorpus(root)).rejects.toThrow(/unknown Unicode category/i)
  })

  it('fails closed for private-use code points with a U+ diagnostic', async () => {
    const root = await fixtureRoot()
    await writeFile(path.join(root, 'data/blog/private-use.md'), '\ue000')

    await expect(collectSiteFontCorpus(root)).rejects.toThrow(/U\+E000/)
  })

  it('fails closed for unassigned code points with a U+ diagnostic', async () => {
    const root = await fixtureRoot()
    await writeFile(path.join(root, 'data/blog/unassigned.md'), '\u0378')

    await expect(collectSiteFontCorpus(root)).rejects.toThrow(/U\+378/)
  })
})
