import { createHash } from 'node:crypto'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { checkSiteFont } from '../../scripts/check-site-font.mjs'
import { collectSiteFontCorpus } from '../../scripts/site-font-text.mjs'

const roots: string[] = []
const sha256 = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex')

async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'site-font-check-'))
  roots.push(root)
  await Promise.all([
    fs.mkdir(path.join(root, 'public/static/fonts/chiron'), { recursive: true }),
    fs.mkdir(path.join(root, 'font-data/chiron'), { recursive: true }),
    fs.mkdir(path.join(root, 'css'), { recursive: true }),
    fs.mkdir(path.join(root, 'data/blog'), { recursive: true }),
    fs.mkdir(path.join(root, 'dictionaries'), { recursive: true }),
    fs.mkdir(path.join(root, 'data'), { recursive: true }),
  ])
  await fs.writeFile(path.join(root, 'package.json'), '{}\n')
  await fs.writeFile(path.join(root, 'data/siteMetadata.js'), 'module.exports = {}\n')
  await fs.writeFile(path.join(root, 'dictionaries/zh-TW.json'), '{}\n')
  await fs.writeFile(path.join(root, 'dictionaries/en.json'), '{}\n')
  await fs.writeFile(path.join(root, 'data/blog/post.md'), 'A')
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
  supported.add(0x2603) // historical core extras are intentionally valid
  const codePoints = [...supported]
    .sort((a, b) => a - b)
    .map((value) => value.toString(16).toUpperCase().padStart(4, '0'))
  await fs.writeFile(
    path.join(root, 'font-data/chiron/core-codepoints.txt'),
    `${codePoints.join('\n')}\n`
  )
  const core = Buffer.from('wOF2-core')
  const artifacts = [
    {
      role: 'core',
      bucket: null,
      file: 'core.0123456789abcdef.woff2',
      sha256: sha256(core),
      bytes: core.length,
      codePoints,
    },
  ]
  const manifest = {
    schemaVersion: 1,
    sourceSha256: source.sha256,
    policy: {
      core: 'committed-monotonic',
      bucketCount: 8,
      bucketFunction: 'codePoint % 8',
      axes: source.axes,
    },
    core: codePoints,
    buckets: Array.from({ length: 8 }, (_, bucket) => ({
      bucket,
      codePoints: [],
    })),
    artifacts,
  }
  await Promise.all([
    fs.writeFile(path.join(root, 'public/static/fonts/chiron/core.0123456789abcdef.woff2'), core),
    fs.writeFile(
      path.join(root, 'public/static/fonts/chiron/manifest.json'),
      `${JSON.stringify(manifest)}\n`
    ),
    fs.writeFile(
      path.join(root, 'css/chiron-font.generated.css'),
      artifacts
        .map(
          ({ file }) => `@font-face { src: url('/static/fonts/chiron/${file}') format('woff2'); }`
        )
        .join('\n')
    ),
  ])
  return { root, manifest }
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
  it('fails when an artifact is missing', async () => {
    const { root } = await fixture()
    await fs.rm(path.join(root, 'public/static/fonts/chiron/core.0123456789abcdef.woff2'))
    await expect(checkSiteFont({ root })).rejects.toThrow(/missing/i)
  })

  it('fails when an artifact SHA-256 is wrong', async () => {
    const { root } = await fixture()
    await fs.writeFile(
      path.join(root, 'public/static/fonts/chiron/core.0123456789abcdef.woff2'),
      'wOF2-bad!'
    )
    await expect(checkSiteFont({ root })).rejects.toThrow(/SHA-256/)
  })

  it('fails when generated CSS does not reference every artifact exactly once', async () => {
    const { root, manifest } = await fixture()
    await fs.writeFile(path.join(root, 'css/chiron-font.generated.css'), '')
    await expect(checkSiteFont({ root })).rejects.toThrow(/CSS reference/)
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
      "@font-face { src: url('/static/fonts/chiron/core.0123456789abcdef.woff2') format('woff2'); }"
    )
    await expect(checkSiteFont({ root })).rejects.toThrow(/corpus.*stale/i)
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
    manifest.schemaVersion = 2
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
      if (args.includes('--version')) return { stdout: 'ok' }
      if (command === 'woff2_decompress') {
        await fs.writeFile(args[0].replace(/\.woff2$/, '.ttf'), 'ttf')
        return { stdout: '' }
      }
      if (command === 'hb-shape') return { stdout: '[.notdef=0+500]' }
      return { stdout: command === 'hb-info' ? '' : 'ok' }
    }
    await expect(checkSiteFont({ root, full: true, runner })).rejects.toThrow(/\.notdef/)
  })

  it('rejects an incorrect variable weight axis', async () => {
    const { root, manifest } = await fixture()
    const runner = async (command: string, args: string[]) => {
      if (args.includes('--version')) return { stdout: 'ok' }
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
