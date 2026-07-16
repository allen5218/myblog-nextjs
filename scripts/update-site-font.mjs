import { createHash } from 'node:crypto'
import { execFile } from 'node:child_process'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { promisify } from 'node:util'
import { fileURLToPath } from 'node:url'

import {
  buildFontPlan,
  compressUnicodeRanges,
  parseCodepoints,
  serializeCodepoints,
} from './site-font-plan.mjs'
import { ensureSourceFont, loadSourceMetadata } from './site-font-source.mjs'
import { collectSiteFontCorpus } from './site-font-text.mjs'

const execFileAsync = promisify(execFile)
const sorted = (values) => [...values].sort((a, b) => a - b)
const hex = (value) => value.toString(16).toUpperCase().padStart(4, '0')
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex')

async function defaultRunner(command, args) {
  await execFileAsync(command, args)
}

function cssFor(artifacts) {
  const faces = artifacts
    .map(
      (artifact) => `@font-face {
  font-family: 'Chiron Sung HK';
  src: url('/static/fonts/chiron/${artifact.file}') format('woff2');
  font-style: normal;
  font-weight: 200 900;
  font-display: swap;
  unicode-range: ${compressUnicodeRanges(artifact.codePoints.map((value) => Number.parseInt(value, 16)))};
}`
    )
    .join('\n\n')
  return `:root { --font-chiron-sung-hk: 'Chiron Sung HK'; }\n\n${faces}\n`
}

export async function generateSiteFontArtifacts({
  root,
  sourcePath,
  sourceSha256,
  axes,
  core,
  buckets,
  runner = defaultRunner,
  coreOutput,
}) {
  const stagingRoot = await fs.mkdtemp(path.join(root, '.site-font-stage-'))
  const stagedFonts = path.join(stagingRoot, 'fonts')
  const stagedCss = path.join(stagingRoot, 'chiron-font.generated.css')
  const outputFonts = path.join(root, 'public/static/fonts/chiron')
  const outputCss = path.join(root, 'css/chiron-font.generated.css')

  try {
    await fs.mkdir(stagedFonts, { recursive: true })
    const sets = [{ role: 'core', bucket: null, codePoints: core }]
    for (let bucket = 0; bucket < 8; bucket += 1) {
      sets.push({ role: 'supplemental', bucket, codePoints: buckets.get(bucket) ?? new Set() })
    }

    const artifacts = []
    for (const set of sets.filter(({ codePoints }) => codePoints.size > 0)) {
      const stem = set.role === 'core' ? 'core' : `supplement-${set.bucket}`
      const textFile = path.join(stagingRoot, `${stem}.txt`)
      const ttfFile = path.join(stagingRoot, `${stem}.ttf`)
      await fs.writeFile(
        textFile,
        sorted(set.codePoints)
          .map((value) => String.fromCodePoint(value))
          .join('')
      )
      await runner('hb-subset', [
        sourcePath,
        `--text-file=${textFile}`,
        `--output-file=${ttfFile}`,
        '--layout-features=*',
        '--name-IDs=*',
        '--name-languages=*',
        '--glyph-names',
      ])
      await runner('woff2_compress', [ttfFile])
      const temporaryWoff = ttfFile.replace(/\.ttf$/, '.woff2')
      const bytes = await fs.readFile(temporaryWoff)
      if (bytes.length === 0) throw new Error(`woff2_compress produced an empty file for ${stem}`)
      const sha256 = digest(bytes)
      const file = `${stem}.${sha256.slice(0, 16)}.woff2`
      await fs.rename(temporaryWoff, path.join(stagedFonts, file))
      artifacts.push({
        role: set.role,
        bucket: set.bucket,
        file,
        sha256,
        bytes: bytes.length,
        codePoints: sorted(set.codePoints).map(hex),
      })
    }

    const manifest = {
      schemaVersion: 1,
      sourceSha256,
      policy: {
        core: 'committed-monotonic',
        bucketCount: 8,
        bucketFunction: 'codePoint % 8',
        axes,
      },
      core: sorted(core).map(hex),
      buckets: Array.from({ length: 8 }, (_, bucket) => ({
        bucket,
        codePoints: sorted(buckets.get(bucket) ?? []).map(hex),
      })),
      artifacts,
    }
    await fs.writeFile(
      path.join(stagedFonts, 'manifest.json'),
      `${JSON.stringify(manifest, null, 2)}\n`
    )
    await fs.writeFile(stagedCss, cssFor(artifacts))

    await fs.mkdir(path.dirname(outputFonts), { recursive: true })
    await fs.mkdir(path.dirname(outputCss), { recursive: true })
    const previousFonts = `${outputFonts}.previous-${process.pid}`
    await fs.rm(previousFonts, { recursive: true, force: true })
    try {
      await fs.rename(outputFonts, previousFonts)
    } catch (error) {
      if (error.code !== 'ENOENT') throw error
    }
    try {
      await fs.rename(stagedFonts, outputFonts)
      await fs.rename(stagedCss, outputCss)
      if (coreOutput) await fs.writeFile(coreOutput, serializeCodepoints(core))
      await fs.rm(previousFonts, { recursive: true, force: true })
    } catch (error) {
      await fs.rm(outputFonts, { recursive: true, force: true })
      try {
        await fs.rename(previousFonts, outputFonts)
      } catch {
        // There was no previous output directory to restore.
      }
      throw error
    }

    return manifest
  } finally {
    await fs.rm(stagingRoot, { recursive: true, force: true })
  }
}

async function main() {
  const root = process.cwd()
  const rebuildCore = process.argv.includes('--rebuild-core')
  const metadata = await loadSourceMetadata(root)
  const sourcePath = await ensureSourceFont(root)
  const corePath = path.join(root, 'font-data/chiron/core-codepoints.txt')
  const committedCore = parseCodepoints(await fs.readFile(corePath, 'utf8'))
  const corpus = await collectSiteFontCorpus(root)
  const plan = buildFontPlan({ corpus, committedCore, rebuildCore })
  const manifest = await generateSiteFontArtifacts({
    root,
    sourcePath,
    sourceSha256: metadata.sha256,
    axes: metadata.axes,
    core: plan.core,
    buckets: plan.buckets,
    coreOutput: rebuildCore ? corePath : undefined,
  })
  const bytes = manifest.artifacts.reduce((sum, artifact) => sum + artifact.bytes, 0)
  console.log(`Generated ${manifest.artifacts.length} Chiron WOFF2 artifacts (${bytes} bytes)`)
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  await main()
}
