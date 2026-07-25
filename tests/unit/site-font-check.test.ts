import { createHash } from 'node:crypto'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import {
  checkSiteFont,
  validateCanonicalSiteFontCss,
  resolveAssignmentHistoryMode,
  validateAssignmentHistory,
  validateCoreHistory,
  validateFixedSeedCore,
  validatePageBudgets,
  validateRebalancedAssignments,
} from '../../scripts/check-site-font.mjs'
import { renderSiteFontCss } from '../../scripts/site-font-css.mjs'
import { collectSiteFontCorpus } from '../../scripts/site-font-text.mjs'

const roots: string[] = []
const sha256 = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex')
const CORE_FILE = 'core.48bb941a797146cd.woff2'

async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'site-font-check-'))
  roots.push(root)
  await Promise.all([
    fs.mkdir(path.join(root, 'public/static/fonts/chiron'), { recursive: true }),
    fs.mkdir(path.join(root, 'font-data/chiron'), { recursive: true }),
    fs.mkdir(path.join(root, 'css'), { recursive: true }),
    fs.mkdir(path.join(root, 'data/blog'), { recursive: true }),
    fs.mkdir(path.join(root, 'data/authors'), { recursive: true }),
    fs.mkdir(path.join(root, 'dictionaries'), { recursive: true }),
    fs.mkdir(path.join(root, 'data'), { recursive: true }),
    fs.mkdir(path.join(root, '.contentlayer/generated/Blog'), { recursive: true }),
  ])
  await fs.writeFile(path.join(root, 'package.json'), '{}\n')
  await fs.writeFile(path.join(root, 'data/siteMetadata.js'), 'module.exports = {}\n')
  await fs.writeFile(path.join(root, 'dictionaries/zh-TW.json'), '{}\n')
  await fs.writeFile(path.join(root, 'dictionaries/en.json'), '{}\n')
  await fs.writeFile(path.join(root, 'data/blog/post.md'), 'A')
  const blogs = Array.from({ length: 15 }, (_, index) => ({
    path: `post-${index}`,
    title: 'A',
    subtitle: '',
    summary: '',
    preview: '',
    author: '',
    tags: [],
    date: `2026-01-${String(index + 1).padStart(2, '0')}`,
    listed: index < 5,
    body: { raw: 'A' },
  }))
  await fs.writeFile(
    path.join(root, '.contentlayer/generated/Blog/_index.json'),
    JSON.stringify(blogs)
  )
  const source = {
    schemaVersion: 1,
    family: 'Chiron Sung HK',
    revision: 'test',
    url: 'https://example.test/font.ttf',
    sha256: 'a'.repeat(64),
    axes: { wght: { min: 200, max: 900 } },
    license: 'OFL-1.1',
  }
  await fs.writeFile(path.join(root, 'font-data/chiron/source.json'), `${JSON.stringify(source)}\n`)

  const corpus = await collectSiteFontCorpus(root)
  const supported = new Set(corpus.fixedSeed)
  for (const codePoints of corpus.documents.values()) {
    for (const codePoint of codePoints) supported.add(codePoint)
  }
  supported.add(0x3400) // historical core extras are intentionally valid
  const codePoints = [...supported]
    .sort((a, b) => a - b)
    .map((value) => value.toString(16).toUpperCase().padStart(4, '0'))
  await fs.writeFile(
    path.join(root, 'font-data/chiron/core-codepoints.txt'),
    `${codePoints.join('\n')}\n`
  )
  const assignmentBytes = Buffer.from(
    `${JSON.stringify({ schemaVersion: 2, bucketCount: 5, assignments: {} }, null, 2)}\n`
  )
  await fs.writeFile(
    path.join(root, 'font-data/chiron/supplemental-assignments.json'),
    assignmentBytes
  )
  await fs.writeFile(path.join(root, 'font-data/chiron/assignment-epoch.txt'), '0\n')
  const core = Buffer.from('wOF2-core')
  const artifacts = [
    {
      role: 'core',
      bucket: null as number | null,
      file: CORE_FILE,
      sha256: sha256(core),
      bytes: core.length,
      codePoints,
    },
  ]
  const manifest = {
    schemaVersion: 2,
    sourceSha256: source.sha256,
    assignmentSha256: sha256(assignmentBytes),
    policy: {
      core: 'committed-monotonic-homepage',
      bucketCount: 5,
      assignment: 'committed-cooccurrence-v2',
      newCharacterPlacement: [
        'max-cooccurrence',
        'max-touched-pages',
        'min-artifact-bytes',
        'lowest-bucket-id',
      ],
      assignmentEpoch: 0,
      axes: source.axes,
    },
    core: codePoints,
    buckets: Array.from({ length: 5 }, (_, bucket) => ({
      bucket,
      codePoints: [] as string[],
    })),
    artifacts,
  }
  await Promise.all([
    fs.writeFile(path.join(root, 'public/static/fonts/chiron', CORE_FILE), core),
    fs.writeFile(
      path.join(root, 'public/static/fonts/chiron/manifest.json'),
      `${JSON.stringify(manifest)}\n`
    ),
    fs.writeFile(path.join(root, 'css/chiron-font.generated.css'), renderSiteFontCss(artifacts)),
  ])
  return { root, manifest }
}

// 兩份文件各有專屬字元、外加一個兩份都用到的跨文件字元。
function rebalanceCorpus() {
  return {
    fixedSeed: new Set<number>(),
    documents: new Map([
      ['a', new Set([0x4e00, 0x4e02])],
      ['b', new Set([0x4e01, 0x4e02])],
    ]),
    occurrences: new Map([
      [0x4e00, new Set(['a'])],
      [0x4e01, new Set(['b'])],
      [0x4e02, new Set(['a', 'b'])],
    ]),
    excluded: new Map(),
  }
}

async function writeManifest(root: string, manifest: unknown) {
  await fs.writeFile(
    path.join(root, 'public/static/fonts/chiron/manifest.json'),
    `${JSON.stringify(manifest)}\n`
  )
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })))
})

describe('site font checks', () => {
  it('compares an explicit historical assignment anchor without blocking additions or promotions', () => {
    const baseAssignments = new Map([
      [0x4e00, 1],
      [0x4e01, 2],
    ])
    expect(() =>
      validateAssignmentHistory({
        baseAssignments,
        assignments: new Map([
          [0x4e00, 1],
          [0x4e02, 3],
        ]),
        core: new Set([0x4e01]),
      })
    ).not.toThrow()
  })

  it('epoch 相同時比對歷史 assignment', () => {
    expect(resolveAssignmentHistoryMode({ epoch: 3, baseEpoch: 3 })).toBe('compare')
  })

  it('epoch 遞增時跳過歷史比對', () => {
    expect(resolveAssignmentHistoryMode({ epoch: 4, baseEpoch: 3 })).toBe('skip')
  })

  it('epoch 倒退時失敗', () => {
    expect(() => resolveAssignmentHistoryMode({ epoch: 2, baseEpoch: 3 })).toThrow(
      /assignment epoch regressed/i
    )
  })

  it('epoch 遞增時放行被改派的既有 assignment 並留下 warning', async () => {
    const { root } = await fixture()
    const basePath = path.join(root, 'base-assignments.json')
    await fs.writeFile(
      basePath,
      `${JSON.stringify({ schemaVersion: 2, bucketCount: 5, assignments: { '9FFF': 1 } }, null, 2)}\n`
    )
    // epoch 相同 → 歷史比對生效,少了 U+9FFF 就該失敗。
    await expect(checkSiteFont({ root, baseAssignmentsPath: basePath })).rejects.toThrow(
      /historical assignment U\+9FFF was removed/i
    )
    // epoch 遞增 → 跳過比對,並回報 warning。
    await fs.writeFile(path.join(root, 'font-data/chiron/assignment-epoch.txt'), '1\n')
    const manifestPath = path.join(root, 'public/static/fonts/chiron/manifest.json')
    const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'))
    manifest.policy.assignmentEpoch = 1
    await writeManifest(root, manifest)
    const baseEpochPath = path.join(root, 'base-epoch.txt')
    await fs.writeFile(baseEpochPath, '0\n')
    const result = await checkSiteFont({ root, baseAssignmentsPath: basePath, baseEpochPath })
    expect(result.warnings).toContain('assignment history check skipped: epoch 0 -> 1')
  })

  it('缺少 base epoch 時仍比對歷史 assignment', async () => {
    const { root } = await fixture()
    // main 的 epoch 一旦推進過就永遠 >0,initial rollout 已結束。此時漏傳 --base-epoch
    // 不能被當成「base 是 0」而放行改派 —— 那會讓唯一的歷史保護靜默失效。
    await fs.writeFile(path.join(root, 'font-data/chiron/assignment-epoch.txt'), '1\n')
    const manifestPath = path.join(root, 'public/static/fonts/chiron/manifest.json')
    const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'))
    manifest.policy.assignmentEpoch = 1
    await writeManifest(root, manifest)
    const basePath = path.join(root, 'base-assignments.json')
    await fs.writeFile(
      basePath,
      `${JSON.stringify({ schemaVersion: 2, bucketCount: 5, assignments: { '9FFF': 1 } }, null, 2)}\n`
    )
    await expect(checkSiteFont({ root, baseAssignmentsPath: basePath })).rejects.toThrow(
      /historical assignment U\+9FFF was removed/i
    )
  })

  it('epoch 遞增時接受確定性重排產物', () => {
    expect(() =>
      validateRebalancedAssignments({
        corpus: rebalanceCorpus(),
        core: new Set(),
        // 跨文件字元進共同桶 0,各文件專屬字元進該群的桶。
        assignments: new Map([
          [0x4e00, 1],
          [0x4e01, 2],
          [0x4e02, 0],
        ]),
      })
    ).not.toThrow()
  })

  it('epoch 遞增時擋下不是重排產物的分派', () => {
    expect(() =>
      validateRebalancedAssignments({
        corpus: rebalanceCorpus(),
        core: new Set(),
        // U+4E01 被塞進別的桶:epoch 遞增不該變成「隨意改派」的萬用通行證。
        assignments: new Map([
          [0x4e00, 1],
          [0x4e01, 1],
          [0x4e02, 0],
        ]),
      })
    ).toThrow(/U\+4E01/i)
  })

  it('epoch 遞增時 checkSiteFont 仍會擋下不是重排產物的分派', async () => {
    const { root } = await fixture()
    // 新增一份帶有非 core 字元的文件:確定性重排會產出一個分派,而 committed 是空的。
    await fs.writeFile(path.join(root, 'data/blog/extra.md'), '中')
    await fs.writeFile(path.join(root, 'font-data/chiron/assignment-epoch.txt'), '1\n')
    const manifestPath = path.join(root, 'public/static/fonts/chiron/manifest.json')
    const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'))
    manifest.policy.assignmentEpoch = 1
    await writeManifest(root, manifest)
    const basePath = path.join(root, 'base-assignments.json')
    await fs.writeFile(
      basePath,
      `${JSON.stringify({ schemaVersion: 2, bucketCount: 5, assignments: {} }, null, 2)}\n`
    )
    const baseEpochPath = path.join(root, 'base-epoch.txt')
    await fs.writeFile(baseEpochPath, '0\n')
    await expect(
      checkSiteFont({ root, baseAssignmentsPath: basePath, baseEpochPath })
    ).rejects.toThrow(/deterministic rebalance produces 1/i)
  })

  it('manifest 的 assignmentEpoch 與 committed epoch 不符時失敗', async () => {
    const { root, manifest } = await fixture()
    await writeManifest(root, {
      ...manifest,
      policy: { ...manifest.policy, assignmentEpoch: 9 },
    })
    await expect(checkSiteFont({ root })).rejects.toThrow(/assignment epoch/i)
  })

  it('rejects historical core removal while allowing monotonic growth', () => {
    expect(() =>
      validateCoreHistory({ baseCore: new Set([0x41]), core: new Set([0x41, 0x42]) })
    ).not.toThrow()
    expect(() =>
      validateCoreHistory({ baseCore: new Set([0x41, 0x4e45]), core: new Set([0x41]) })
    ).toThrow(/core code point U\+4E45 was removed/i)
  })

  it('anchors the committed core against a base snapshot end to end', async () => {
    const { root } = await fixture()
    const corePath = path.join(root, 'font-data/chiron/core-codepoints.txt')
    await expect(checkSiteFont({ root, baseCorePath: corePath })).resolves.toMatchObject({
      skipped: [],
    })
    const baseCorePath = path.join(root, 'base-core-codepoints.txt')
    const current = (await fs.readFile(corePath, 'utf8')).trim()
    await fs.writeFile(baseCorePath, `${current}\n4E45\n`)
    await expect(checkSiteFont({ root, baseCorePath })).rejects.toThrow(
      /core code point U\+4E45 was removed/i
    )
  })

  it('rejects historical assignment removal and rebucketing', () => {
    const baseAssignments = new Map([[0x4e00, 1]])
    expect(() =>
      validateAssignmentHistory({ baseAssignments, assignments: new Map(), core: new Set() })
    ).toThrow(/removed/)
    expect(() =>
      validateAssignmentHistory({
        baseAssignments,
        assignments: new Map([[0x4e00, 2]]),
        core: new Set(),
      })
    ).toThrow(/changed bucket/)
  })

  it('enforces homepage requests and article bytes/requests independently', () => {
    expect(() =>
      validatePageBudgets({ homepage: { bytes: 1, requests: 3 }, articles: [] })
    ).toThrow(/homepage.*2 requests/i)
    expect(() =>
      validatePageBudgets({
        homepage: { bytes: 1, requests: 1 },
        articles: [{ name: 'large', bytes: 550_001, requests: 1 }],
      })
    ).toThrow(/large.*550000 bytes/i)
    expect(() =>
      validatePageBudgets({
        homepage: { bytes: 1, requests: 1 },
        articles: [{ name: 'scattered', bytes: 1, requests: 4 }],
      })
    ).toThrow(/scattered.*3 requests/i)
  })

  it('requires every fixed UI seed character in core, never supplemental or absent', () => {
    const fixedSeed = new Set([0x806f])
    expect(() => validateFixedSeedCore({ fixedSeed, core: new Set() })).toThrow(
      /fixed UI seed.*806F/i
    )
    expect(() => validateFixedSeedCore({ fixedSeed, core: new Set([0x4e00]) })).toThrow(
      /must be in core/i
    )
    expect(() => validateFixedSeedCore({ fixedSeed, core: new Set([0x806f]) })).not.toThrow()
  })

  it('fails clearly when the generated budget model is missing or malformed', async () => {
    const { root } = await fixture()
    const model = path.join(root, '.contentlayer/generated/Blog/_index.json')
    await fs.rm(model)
    await expect(checkSiteFont({ root })).rejects.toThrow(/budget model.*missing/i)
    await fs.writeFile(model, '{bad')
    await expect(checkSiteFont({ root })).rejects.toThrow(/budget model.*malformed/i)
    await fs.writeFile(model, '[]')
    await expect(checkSiteFont({ root })).rejects.toThrow(/at least one article/i)
  })

  it('accepts a budget model that grows beyond the current article count', async () => {
    const { root } = await fixture()
    const model = path.join(root, '.contentlayer/generated/Blog/_index.json')
    const blogs = JSON.parse(await fs.readFile(model, 'utf8'))
    blogs.push({ ...blogs[0], path: 'post-new', date: '2026-02-01' })
    await fs.writeFile(model, JSON.stringify(blogs))
    await expect(checkSiteFont({ root })).resolves.toMatchObject({ skipped: [] })
  })

  it('demands placement for characters that appear only in markdown frontmatter', async () => {
    const { root } = await fixture()
    // 「二」 lives only in the raw file's frontmatter, never in the generated blog model.
    await fs.writeFile(path.join(root, 'data/blog/post.md'), '---\ntags:\n  - 二\n---\nA')
    await expect(checkSiteFont({ root })).rejects.toThrow(/stale in bucket/i)
  })

  it('accepts artifacts that cover frontmatter-only characters via committed assignments', async () => {
    const { root, manifest } = await fixture()
    await fs.writeFile(path.join(root, 'data/blog/post.md'), '---\ntags:\n  - 二\n---\nA')
    const assignmentBytes = Buffer.from(
      `${JSON.stringify({ schemaVersion: 2, bucketCount: 5, assignments: { '4E8C': 0 } }, null, 2)}\n`
    )
    await fs.writeFile(
      path.join(root, 'font-data/chiron/supplemental-assignments.json'),
      assignmentBytes
    )
    const supplement = Buffer.from('wOF2-supplement')
    const supplementFile = `supplement-0.${sha256(supplement).slice(0, 16)}.woff2`
    await fs.writeFile(path.join(root, 'public/static/fonts/chiron', supplementFile), supplement)
    manifest.assignmentSha256 = sha256(assignmentBytes)
    manifest.buckets[0].codePoints = ['4E8C']
    manifest.artifacts.push({
      role: 'supplemental',
      bucket: 0,
      file: supplementFile,
      sha256: sha256(supplement),
      bytes: supplement.length,
      codePoints: ['4E8C'],
    })
    await writeManifest(root, manifest)
    await fs.writeFile(
      path.join(root, 'css/chiron-font.generated.css'),
      renderSiteFontCss(manifest.artifacts)
    )
    await expect(checkSiteFont({ root })).resolves.toMatchObject({ skipped: [] })
  })

  it('fails when an artifact is missing', async () => {
    const { root } = await fixture()
    await fs.rm(path.join(root, 'public/static/fonts/chiron', CORE_FILE))
    await expect(checkSiteFont({ root })).rejects.toThrow(/missing/i)
  })

  it('fails when an artifact SHA-256 is wrong', async () => {
    const { root } = await fixture()
    await fs.writeFile(path.join(root, 'public/static/fonts/chiron', CORE_FILE), 'wOF2-bad!')
    await expect(checkSiteFont({ root })).rejects.toThrow(/SHA-256/)
  })

  it('fails when the authoritative assignment file hash changes', async () => {
    const { root } = await fixture()
    await fs.writeFile(
      path.join(root, 'font-data/chiron/supplemental-assignments.json'),
      '{"schemaVersion":2,"bucketCount":5,"assignments":{"4E00":0}}\n'
    )
    await expect(checkSiteFont({ root })).rejects.toThrow(/assignment SHA-256/)
  })

  it('rejects collector-excluded characters in authoritative assignments', async () => {
    const { root, manifest } = await fixture()
    const assignmentBytes = Buffer.from(
      `${JSON.stringify({ schemaVersion: 2, bucketCount: 5, assignments: { FE0F: 4 } }, null, 2)}\n`
    )
    await fs.writeFile(
      path.join(root, 'font-data/chiron/supplemental-assignments.json'),
      assignmentBytes
    )
    manifest.assignmentSha256 = sha256(assignmentBytes)
    manifest.buckets[4].codePoints = ['FE0F']
    await writeManifest(root, manifest)
    await expect(checkSiteFont({ root })).rejects.toThrow(/excluded assignment.*FE0F/i)
  })

  it('enforces the hard homepage byte budget from manifest artifact bytes', async () => {
    const { root, manifest } = await fixture()
    const bytes = Buffer.concat([Buffer.from('wOF2'), Buffer.alloc(350_001 - 4)])
    const hash = sha256(bytes)
    const file = `core.${hash.slice(0, 16)}.woff2`
    await fs.rm(path.join(root, 'public/static/fonts/chiron', CORE_FILE))
    await fs.writeFile(path.join(root, 'public/static/fonts/chiron', file), bytes)
    Object.assign(manifest.artifacts[0], { file, sha256: hash, bytes: bytes.length })
    await writeManifest(root, manifest)
    await fs.writeFile(
      path.join(root, 'css/chiron-font.generated.css'),
      renderSiteFontCss(manifest.artifacts)
    )
    await expect(checkSiteFont({ root })).rejects.toThrow(/homepage.*350000/i)
  })

  it('fails when generated CSS does not reference every artifact exactly once', async () => {
    const { root, manifest } = await fixture()
    await fs.writeFile(path.join(root, 'css/chiron-font.generated.css'), '')
    await expect(checkSiteFont({ root })).rejects.toThrow(/canonical CSS/i)
  })

  for (const [name, mutate] of [
    ['unicode range', (css: string) => css.replace('unicode-range:', 'unicode-range: U+FFFF,')],
    ['weight', (css: string) => css.replace('font-weight: 200 900;', 'font-weight: 400;')],
    ['family', (css: string) => css.replaceAll('Chiron Sung HK', 'Wrong Family')],
    ['display', (css: string) => css.replace('font-display: swap;', 'font-display: block;')],
    ['URL', (css: string) => css.replace('/static/fonts/chiron/', '/wrong/')],
    [
      'face order',
      (css: string) => {
        const faces = css.match(/@font-face \{[\s\S]*?\n\}/g) ?? []
        return faces.length > 1
          ? css.replace(faces.join('\n\n'), [...faces].reverse().join('\n\n'))
          : `${css}\n@font-face { font-family: 'Chiron Sung HK'; }\n`
      },
    ],
  ] as const) {
    it(`rejects generated CSS with mutated ${name}`, async () => {
      const { root } = await fixture()
      const cssPath = path.join(root, 'css/chiron-font.generated.css')
      await fs.writeFile(cssPath, mutate(await fs.readFile(cssPath, 'utf8')))
      await expect(checkSiteFont({ root })).rejects.toThrow(/canonical CSS/i)
    })
  }

  it('rejects reordered canonical font faces', () => {
    const artifacts = [
      { file: 'core.0123456789abcdef.woff2', codePoints: ['0041'] },
      { file: 'supplement-0.0123456789abcdef.woff2', codePoints: ['4E00'] },
    ]
    const canonical = renderSiteFontCss(artifacts)
    const faces = canonical.match(/@font-face \{[\s\S]*?\n\}/g)!
    const reordered = canonical.replace(faces.join('\n\n'), [...faces].reverse().join('\n\n'))

    expect(() => validateCanonicalSiteFontCss(reordered, artifacts)).toThrow(/canonical CSS/i)
  })

  it('rejects a self-consistent artifact whose filename stem does not match its role', async () => {
    const { root, manifest } = await fixture()
    const fakeFile = `wrongstem.${manifest.artifacts[0].sha256.slice(0, 16)}.woff2`
    await fs.rename(
      path.join(root, 'public/static/fonts/chiron', CORE_FILE),
      path.join(root, 'public/static/fonts/chiron', fakeFile)
    )
    manifest.artifacts[0].file = fakeFile
    await writeManifest(root, manifest)
    await fs.writeFile(
      path.join(root, 'css/chiron-font.generated.css'),
      renderSiteFontCss(manifest.artifacts)
    )
    await expect(checkSiteFont({ root })).rejects.toThrow(/filename.*core/i)
  })

  it('rejects core and bucket overlap', async () => {
    const { root, manifest } = await fixture()
    manifest.buckets[0].codePoints = [manifest.core[0]]
    await writeManifest(root, manifest)
    await expect(checkSiteFont({ root })).rejects.toThrow(/overlap/)
  })

  it('rejects a stale corpus plan while allowing historical core extras', async () => {
    const { root, manifest } = await fixture()
    manifest.core = manifest.core.filter((value) => value !== '0041')
    manifest.artifacts[0].codePoints = manifest.core
    await fs.writeFile(
      path.join(root, 'font-data/chiron/core-codepoints.txt'),
      `${manifest.core.join('\n')}\n`
    )
    await writeManifest(root, manifest)
    await fs.writeFile(
      path.join(root, 'css/chiron-font.generated.css'),
      `@font-face { src: url('/static/fonts/chiron/${CORE_FILE}') format('woff2'); }`
    )
    await expect(checkSiteFont({ root })).rejects.toThrow(/fixed UI seed.*must be in core/i)
  })

  it('skips only dynamic checks on Vercel when tools are missing', async () => {
    const { root, manifest } = await fixture()
    const runner = async () => {
      const error = Object.assign(new Error('missing'), { code: 'ENOENT' })
      throw error
    }
    const result = await checkSiteFont({ root, full: true, env: { VERCEL: '1' }, runner })
    expect(result.skipped).toEqual(expect.arrayContaining(['glyph', 'cmap', 'axis']))
    expect(result.artifactBytes).toBe(9)
  })

  it('still rejects a bad manifest on Vercel before discovering tools', async () => {
    const { root, manifest } = await fixture()
    manifest.schemaVersion = 1
    await writeManifest(root, manifest)
    const runner = async () => {
      throw new Error('runner must not be called')
    }
    await expect(checkSiteFont({ root, full: true, env: { VERCEL: '1' }, runner })).rejects.toThrow(
      /schema/
    )
  })

  it('rejects .notdef shaping output', async () => {
    const { root } = await fixture()
    const runner = async (command: string, args: string[]) => {
      if (args.includes('--version') || args.length === 0) return { stdout: 'ok' }
      if (command === 'woff2_decompress') {
        await fs.writeFile(args[0].replace(/\.woff2$/, '.ttf'), 'ttf')
        return { stdout: '' }
      }
      if (command === 'hb-shape') return { stdout: '[.notdef=0+500]' }
      return { stdout: command === 'hb-info' ? '' : 'ok' }
    }
    await expect(checkSiteFont({ root, full: true, runner })).rejects.toThrow(/\.notdef/)
  })

  it('rejects a full-mode cmap mismatch after successful shaping', async () => {
    const { root } = await fixture()
    const runner = async (command: string, args: string[]) => {
      if (args.includes('--version') || args.length === 0) return { stdout: 'ok' }
      if (command === 'woff2_decompress') {
        await fs.writeFile(args[0].replace(/\.woff2$/, '.ttf'), 'ttf')
        return { stdout: '' }
      }
      if (command === 'hb-shape') return { stdout: '[space=0+500]' }
      if (args.includes('--list-unicodes')) return { stdout: 'U+0020' }
      return { stdout: 'wght 200 200 900 Weight' }
    }
    await expect(checkSiteFont({ root, full: true, runner })).rejects.toThrow(/cmap mismatch/)
  })

  it('accepts a mocked full-mode artifact with exact cmap, glyphs and axis', async () => {
    const { root, manifest } = await fixture()
    const runner = async (command: string, args: string[]) => {
      if (args.includes('--version') || args.length === 0) return { stdout: 'ok' }
      if (command === 'woff2_decompress') {
        await fs.writeFile(args[0].replace(/\.woff2$/, '.ttf'), 'ttf')
        return { stdout: '' }
      }
      if (command === 'hb-shape') return { stdout: '[space=0+500]' }
      if (args.includes('--list-unicodes')) {
        return { stdout: manifest.core.map((value) => `U+${value}`).join('\n') }
      }
      return { stdout: 'wght 200 200 900 Weight' }
    }
    await expect(checkSiteFont({ root, full: true, runner })).resolves.toMatchObject({
      skipped: [],
      artifactBytes: 9,
    })
  })

  it('reports non-ENOENT command probe failures instead of treating tools as available', async () => {
    const { root } = await fixture()
    const runner = async (command: string) => {
      if (command === 'hb-info')
        throw Object.assign(new Error('permission denied'), { code: 'EACCES' })
      return { stdout: 'ok' }
    }
    await expect(checkSiteFont({ root, full: true, runner })).rejects.toThrow(
      /hb-info.*probe.*permission denied/i
    )
  })

  it('accepts woff2 usage probes with different numeric exit codes and messages', async () => {
    const { root, manifest } = await fixture()
    const runner = async (command: string, args: string[]) => {
      if (command.startsWith('woff2_') && args.length === 0) {
        throw Object.assign(new Error('usage changed'), { code: 64, stderr: 'new usage text' })
      }
      if (args.includes('--version')) return { stdout: 'ok' }
      if (command === 'woff2_decompress') {
        await fs.writeFile(args[0].replace(/\.woff2$/, '.ttf'), 'ttf')
        return { stdout: '' }
      }
      if (command === 'hb-shape') return { stdout: '[space=0+500]' }
      if (args.includes('--list-unicodes')) {
        return { stdout: manifest.core.map((value) => `U+${value}`).join('\n') }
      }
      return { stdout: 'wght 200 200 900 Weight' }
    }

    await expect(checkSiteFont({ root, full: true, runner })).resolves.toMatchObject({ skipped: [] })
  })

  it('ignores unprefixed hexadecimal words in hb-info unicode output', async () => {
    const { root, manifest } = await fixture()
    const runner = async (command: string, args: string[]) => {
      if (args.includes('--version') || args.length === 0) return { stdout: 'ok' }
      if (command === 'woff2_decompress') {
        await fs.writeFile(args[0].replace(/\.woff2$/, '.ttf'), 'ttf')
        return { stdout: '' }
      }
      if (command === 'hb-shape') return { stdout: '[space=0+500]' }
      if (args.includes('--list-unicodes')) {
        return { stdout: `${manifest.core.map((value) => `U+${value}`).join('\n')}\nDECADE FACADE` }
      }
      return { stdout: 'wght 200 200 900 Weight' }
    }

    await expect(checkSiteFont({ root, full: true, runner })).resolves.toMatchObject({ skipped: [] })
  })

  it('rejects an incorrect variable weight axis', async () => {
    const { root, manifest } = await fixture()
    const runner = async (command: string, args: string[]) => {
      if (args.includes('--version') || args.length === 0) return { stdout: 'ok' }
      if (command === 'woff2_decompress') {
        await fs.writeFile(args[0].replace(/\.woff2$/, '.ttf'), 'ttf')
        return { stdout: '' }
      }
      if (command === 'hb-shape') return { stdout: '[space=0+500]' }
      if (args.includes('--list-unicodes')) {
        return { stdout: manifest.core.map((value) => `U+${value}`).join('\n') }
      }
      if (args.includes('--list-variations')) return { stdout: 'wght 200 200 800 Weight' }
      return { stdout: '' }
    }
    await expect(checkSiteFont({ root, full: true, runner })).rejects.toThrow(/wght.*200.*900/)
  })
})
