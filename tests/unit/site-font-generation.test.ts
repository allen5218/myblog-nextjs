import { createHash } from 'node:crypto'
import { promises as fs } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

import { generateSiteFontArtifacts } from '../../scripts/update-site-font.mjs'

const sha = (value: Buffer) => createHash('sha256').update(value).digest('hex')
const validWoff = (suffix = '') => Buffer.concat([Buffer.from('wOF2'), Buffer.from(suffix)])

async function fixture() {
  const root = await fs.mkdtemp(path.join(tmpdir(), 'site-font-generation-'))
  await fs.mkdir(path.join(root, 'public/static/fonts/chiron'), { recursive: true })
  await fs.mkdir(path.join(root, 'css'), { recursive: true })
  await fs.mkdir(path.join(root, 'font-data/chiron'), { recursive: true })
  await fs.writeFile(path.join(root, 'source.ttf'), 'source')
  return root
}

const input = (root: string) => ({
  root,
  sourcePath: path.join(root, 'source.ttf'),
  sourceSha256: 'source-sha',
  axes: { wght: { min: 200, max: 900 } },
  core: new Set([0x20, 0x41, 0x4e00]),
  assignmentBytes: Buffer.from('{"schemaVersion":2}\n'),
  buckets: new Map([
    [0, new Set<number>()],
    [1, new Set([0x4e01])],
    [2, new Set<number>()],
    [3, new Set<number>()],
    [4, new Set<number>()],
  ]),
})

describe('site font generation', () => {
  it('rejects collector-excluded emoji before producing artifacts', async () => {
    const root = await fixture()
    await expect(
      generateSiteFontArtifacts({
        ...input(root),
        core: new Set([...input(root).core, 0x1f39e]),
        runner: async () => {},
      })
    ).rejects.toThrow(/excluded code point U\+1F39E/i)
  })

  it('subsets through text files then compresses staged variable TTFs', async () => {
    const root = await fixture()
    const calls: Array<{ command: string; args: string[] }> = []
    const runner = async (command: string, args: string[]) => {
      calls.push({ command, args })
      if (command === 'hb-subset') {
        const output = args.find((arg) => arg.startsWith('--output-file='))!.slice(14)
        await fs.writeFile(output, `ttf-${calls.length}`)
      } else if (command === 'woff2_compress') {
        const ttf = args[0]
        await fs.writeFile(ttf.replace(/\.ttf$/, '.woff2'), validWoff(`${calls.length}`))
      } else {
        await fs.writeFile(args[0].replace(/\.woff2$/, '.ttf'), 'decompressed')
      }
    }

    await generateSiteFontArtifacts({ ...input(root), runner })

    expect(calls.map(({ command }) => command)).toEqual([
      'hb-subset',
      'woff2_compress',
      'woff2_decompress',
      'hb-subset',
      'woff2_compress',
      'woff2_decompress',
    ])
    for (const call of calls.filter(({ command }) => command === 'hb-subset')) {
      expect(call.args.some((arg) => arg.startsWith('--text-file='))).toBe(true)
      expect(call.args).toContain('--layout-features=*')
      expect(call.args).toContain('--no-layout-closure')
      expect(call.args).toContain('--no-bidi-closure')
      expect(call.args).not.toContain('繁體中文')
      expect(call.args.some((arg) => arg.includes('--variations'))).toBe(false)
      expect(call.args.find((arg) => arg.startsWith('--output-file='))).toContain(tmpdir())
    }
    expect(
      calls
        .filter(({ command }) => command === 'woff2_compress')
        .every((call) => call.args.length === 1)
    ).toBe(true)
  })

  it('writes exact manifest hashes, codepoints, policy and CSS ranges', async () => {
    const root = await fixture()
    const runner = async (command: string, args: string[]) => {
      if (command === 'hb-subset')
        await fs.writeFile(args.find((a) => a.startsWith('--output-file='))!.slice(14), 'ttf')
      else if (command === 'woff2_compress')
        await fs.writeFile(args[0].replace(/\.ttf$/, '.woff2'), validWoff(path.basename(args[0])))
      else await fs.writeFile(args[0].replace(/\.woff2$/, '.ttf'), 'decompressed')
    }
    await generateSiteFontArtifacts({ ...input(root), runner })
    const manifest = JSON.parse(
      await fs.readFile(path.join(root, 'public/static/fonts/chiron/manifest.json'), 'utf8')
    )
    expect(manifest.schemaVersion).toBe(2)
    expect(manifest.assignmentSha256).toBe(sha(input(root).assignmentBytes))
    expect(manifest.policy).toEqual({
      core: 'committed-monotonic-homepage',
      bucketCount: 5,
      assignment: 'committed-cooccurrence-v2',
      newCharacterPlacement: [
        'max-cooccurrence',
        'max-touched-pages',
        'min-artifact-bytes',
        'lowest-bucket-id',
      ],
      axes: { wght: { min: 200, max: 900 } },
    })
    expect(manifest.buckets).toHaveLength(5)
    expect(manifest.artifacts[0].codePoints).toEqual(['0020', '0041', '4E00'])
    for (const artifact of manifest.artifacts) {
      const bytes = await fs.readFile(path.join(root, 'public/static/fonts/chiron', artifact.file))
      expect(artifact.sha256).toBe(sha(bytes))
      expect(artifact.bytes).toBe(bytes.length)
      expect(artifact.file).toContain(artifact.sha256.slice(0, 16))
    }
    const css = await fs.readFile(path.join(root, 'css/chiron-font.generated.css'), 'utf8')
    expect(css).toContain(":root { --font-chiron-sung-hk: 'Chiron Sung HK'; }")
    expect(css).toContain('font-weight: 200 900;')
    expect(css).toContain('unicode-range: U+0020,U+0041,U+4E00;')
    expect(css).toContain('unicode-range: U+4E01;')
  })

  for (const failure of ['hb-subset', 'woff2_compress', 'woff2_decompress']) {
    it(`leaves old outputs intact when ${failure} fails`, async () => {
      const root = await fixture()
      const oldManifest = path.join(root, 'public/static/fonts/chiron/manifest.json')
      await fs.writeFile(oldManifest, 'original manifest')
      await fs.writeFile(path.join(root, 'css/chiron-font.generated.css'), 'original css')
      let matchingCalls = 0
      const runner = async (command: string, args: string[]) => {
        if (command === failure && ++matchingCalls === 2) throw new Error(`${command} failed`)
        if (command === 'hb-subset') {
          await fs.writeFile(args.find((a) => a.startsWith('--output-file='))!.slice(14), 'ttf')
        } else if (command === 'woff2_compress') {
          await fs.writeFile(args[0].replace(/\.ttf$/, '.woff2'), validWoff())
        } else {
          await fs.writeFile(args[0].replace(/\.woff2$/, '.ttf'), 'decompressed')
        }
      }
      await expect(generateSiteFontArtifacts({ ...input(root), runner })).rejects.toThrow(failure)
      expect(await fs.readFile(oldManifest, 'utf8')).toBe('original manifest')
      expect(await fs.readFile(path.join(root, 'css/chiron-font.generated.css'), 'utf8')).toBe(
        'original css'
      )
    })
  }

  it('rejects corrupt nonempty WOFF2 before writing repository outputs', async () => {
    const root = await fixture()
    const manifest = path.join(root, 'public/static/fonts/chiron/manifest.json')
    await fs.writeFile(manifest, 'original')
    const runner = async (command: string, args: string[]) => {
      if (command === 'hb-subset')
        await fs.writeFile(args.find((a) => a.startsWith('--output-file='))!.slice(14), 'ttf')
      else if (command === 'woff2_compress')
        await fs.writeFile(args[0].replace(/\.ttf$/, '.woff2'), 'not-woff2')
    }
    await expect(generateSiteFontArtifacts({ ...input(root), runner })).rejects.toThrow(
      /invalid WOFF2 magic/
    )
    expect(await fs.readFile(manifest, 'utf8')).toBe('original')
  })

  for (const phase of ['after-fonts-swap', 'after-css-swap', 'during-core-write']) {
    it(`restores fonts, CSS and core when commit fails ${phase}`, async () => {
      const root = await fixture()
      const fonts = path.join(root, 'public/static/fonts/chiron')
      const css = path.join(root, 'css/chiron-font.generated.css')
      const core = path.join(root, 'font-data/chiron/core-codepoints.txt')
      await fs.writeFile(path.join(fonts, 'manifest.json'), 'old manifest')
      await fs.writeFile(path.join(fonts, 'old.woff2'), 'old font')
      await fs.writeFile(css, 'old css')
      await fs.writeFile(core, '0041\n')
      const runner = async (command: string, args: string[]) => {
        if (command === 'hb-subset')
          await fs.writeFile(args.find((a) => a.startsWith('--output-file='))!.slice(14), 'ttf')
        else if (command === 'woff2_compress')
          await fs.writeFile(args[0].replace(/\.ttf$/, '.woff2'), validWoff())
        else await fs.writeFile(args[0].replace(/\.woff2$/, '.ttf'), 'decompressed')
      }
      await expect(
        generateSiteFontArtifacts({
          ...input(root),
          runner,
          coreOutput: core,
          commitHook: async (current: string) => {
            if (current === phase) throw new Error(`fault ${phase}`)
          },
        })
      ).rejects.toThrow(`fault ${phase}`)
      expect(await fs.readFile(path.join(fonts, 'manifest.json'), 'utf8')).toBe('old manifest')
      expect(await fs.readFile(path.join(fonts, 'old.woff2'), 'utf8')).toBe('old font')
      expect(await fs.readdir(fonts)).toEqual(['manifest.json', 'old.woff2'])
      expect(await fs.readFile(css, 'utf8')).toBe('old css')
      expect(await fs.readFile(core, 'utf8')).toBe('0041\n')
    })
  }

  it('removes only orphan WOFF2 files inside the Chiron directory', async () => {
    const root = await fixture()
    const orphan = path.join(root, 'public/static/fonts/chiron/core.deadbeefdeadbeef.woff2')
    const outside = path.join(root, 'public/static/fonts/keep.woff2')
    await fs.writeFile(orphan, 'old')
    await fs.writeFile(outside, 'outside')
    const runner = async (command: string, args: string[]) => {
      if (command === 'hb-subset')
        await fs.writeFile(args.find((a) => a.startsWith('--output-file='))!.slice(14), 'ttf')
      else if (command === 'woff2_compress')
        await fs.writeFile(args[0].replace(/\.ttf$/, '.woff2'), validWoff())
      else await fs.writeFile(args[0].replace(/\.woff2$/, '.ttf'), 'decompressed')
    }
    await generateSiteFontArtifacts({ ...input(root), runner })
    await expect(fs.stat(orphan)).rejects.toThrow()
    expect(await fs.readFile(outside, 'utf8')).toBe('outside')
  })
})
