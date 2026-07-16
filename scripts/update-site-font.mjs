import { createHash, randomUUID } from 'node:crypto'
import { execFile } from 'node:child_process'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { promisify } from 'node:util'
import { fileURLToPath } from 'node:url'

import {
  buildFontPlan,
  compressUnicodeRanges,
  corpusFromGeneratedBlogs,
  homepageFromGeneratedBlogs,
  parseAssignments,
  parseCodepoints,
  serializeAssignments,
  serializeCodepoints,
} from './site-font-plan.mjs'
import { ensureSourceFont, loadSourceMetadata } from './site-font-source.mjs'
import { classifySiteFontCodePoint, collectSiteFontCorpus } from './site-font-text.mjs'

const execFileAsync = promisify(execFile)
const sorted = (values) => [...values].sort((a, b) => a - b)
const hex = (value) => value.toString(16).toUpperCase().padStart(4, '0')
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex')

/**
 * @typedef {object} SiteFontGenerationOptions
 * @property {string} root
 * @property {string} sourcePath
 * @property {string} sourceSha256
 * @property {any} axes
 * @property {Set<number>} core
 * @property {Map<number, Set<number>>} buckets
 * @property {Buffer} assignmentBytes
 * @property {string} [assignmentOutput]
 * @property {(command: string, args: string[]) => Promise<void>} [runner]
 * @property {string} [coreOutput]
 * @property {(phase: string) => Promise<void>} [commitHook]
 */

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

/** @param {SiteFontGenerationOptions} options */
export async function generateSiteFontArtifacts({
  root,
  sourcePath,
  sourceSha256,
  axes,
  core,
  buckets,
  assignmentBytes,
  assignmentOutput,
  runner = defaultRunner,
  coreOutput,
  commitHook = async () => {},
}) {
  for (const codePoint of [...core, ...[...buckets.values()].flatMap((values) => [...values])]) {
    if (classifySiteFontCodePoint(codePoint).kind !== 'included') {
      throw new Error(`Excluded code point U+${hex(codePoint)} cannot enter Chiron artifacts`)
    }
  }
  const stagingRoot = await fs.mkdtemp(path.join(root, '.site-font-stage-'))
  const stagedFonts = path.join(stagingRoot, 'fonts')
  const stagedCss = path.join(stagingRoot, 'chiron-font.generated.css')
  const outputFonts = path.join(root, 'public/static/fonts/chiron')
  const outputCss = path.join(root, 'css/chiron-font.generated.css')

  try {
    await fs.mkdir(stagedFonts, { recursive: true })
    const sets = [{ role: 'core', bucket: null, codePoints: core }]
    for (let bucket = 0; bucket < 5; bucket += 1) {
      sets.push({
        role: 'supplemental',
        bucket,
        codePoints: buckets.get(bucket) ?? new Set(),
      })
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
        '--no-layout-closure',
        '--no-bidi-closure',
        '--name-IDs=*',
        '--name-languages=*',
        '--glyph-names',
      ])
      await runner('woff2_compress', [ttfFile])
      const temporaryWoff = ttfFile.replace(/\.ttf$/, '.woff2')
      const bytes = await fs.readFile(temporaryWoff)
      if (bytes.subarray(0, 4).toString('ascii') !== 'wOF2') {
        throw new Error(`woff2_compress produced invalid WOFF2 magic for ${stem}`)
      }
      const validationDirectory = path.join(stagingRoot, 'validation', stem)
      await fs.mkdir(validationDirectory, { recursive: true })
      const validationWoff = path.join(validationDirectory, `${stem}.woff2`)
      await fs.copyFile(temporaryWoff, validationWoff)
      await runner('woff2_decompress', [validationWoff])
      const decompressed = await fs.readFile(path.join(validationDirectory, `${stem}.ttf`))
      if (decompressed.length === 0)
        throw new Error(`woff2_decompress produced an empty TTF for ${stem}`)
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
      schemaVersion: 2,
      sourceSha256,
      assignmentSha256: digest(assignmentBytes),
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
        axes,
      },
      core: sorted(core).map(hex),
      buckets: Array.from({ length: 5 }, (_, bucket) => ({
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
    const stagedCore = coreOutput ? path.join(stagingRoot, 'core-codepoints.txt') : undefined
    if (stagedCore) await fs.writeFile(stagedCore, serializeCodepoints(core))
    const stagedAssignments = assignmentOutput
      ? path.join(stagingRoot, 'supplemental-assignments.json')
      : undefined
    if (stagedAssignments) await fs.writeFile(stagedAssignments, assignmentBytes)

    await fs.mkdir(path.dirname(outputFonts), { recursive: true })
    await fs.mkdir(path.dirname(outputCss), { recursive: true })
    if (coreOutput) await fs.mkdir(path.dirname(coreOutput), { recursive: true })
    const transactionId = randomUUID()
    const outputs = [
      { staged: stagedFonts, output: outputFonts, phase: 'after-fonts-swap' },
      { staged: stagedCss, output: outputCss, phase: 'after-css-swap' },
      ...(coreOutput
        ? [{ staged: stagedCore, output: coreOutput, phase: 'during-core-write' }]
        : []),
      ...(assignmentOutput
        ? [
            {
              staged: stagedAssignments,
              output: assignmentOutput,
              phase: 'during-assignment-write',
            },
          ]
        : []),
    ].map((entry) => ({
      ...entry,
      backup: `${entry.output}.backup-${transactionId}`,
      hadOld: false,
      installed: false,
    }))

    try {
      for (const entry of outputs) {
        try {
          await fs.rename(entry.output, entry.backup)
          entry.hadOld = true
        } catch (error) {
          if (error.code !== 'ENOENT') throw error
        }
      }
      for (const entry of outputs) {
        await fs.rename(entry.staged, entry.output)
        entry.installed = true
        await commitHook(entry.phase)
      }
    } catch (error) {
      for (const entry of [...outputs].reverse()) {
        if (entry.installed) await fs.rm(entry.output, { recursive: true, force: true })
        if (entry.hadOld) await fs.rename(entry.backup, entry.output)
      }
      throw error
    }

    // Cleanup is outside the transaction: committed outputs are already consistent.
    await Promise.all(
      outputs
        .filter(({ hadOld }) => hadOld)
        .map(({ backup }) => fs.rm(backup, { recursive: true, force: true }).catch(() => {}))
    )

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
  const assignmentsPath = path.join(root, 'font-data/chiron/supplemental-assignments.json')
  const committedCore = parseCodepoints(await fs.readFile(corePath, 'utf8'))
  const committedAssignmentBytes = await fs.readFile(assignmentsPath)
  const committedAssignments = parseAssignments(committedAssignmentBytes.toString('utf8'))
  const blogs = JSON.parse(
    await fs.readFile(path.join(root, '.contentlayer/generated/Blog/_index.json'), 'utf8')
  )
  const corpus = corpusFromGeneratedBlogs(blogs)
  corpus.fixedSeed = (await collectSiteFontCorpus(root)).fixedSeed
  const homepage = homepageFromGeneratedBlogs(blogs)
  let artifactBytes = Array(5).fill(0)
  try {
    const previous = JSON.parse(
      await fs.readFile(path.join(root, 'public/static/fonts/chiron/manifest.json'), 'utf8')
    )
    artifactBytes = Array.from(
      { length: 5 },
      (_, bucket) =>
        previous.artifacts.find(
          (artifact) => artifact.role === 'supplemental' && artifact.bucket === bucket
        )?.bytes ?? 0
    )
  } catch {
    // A first generation has no committed artifact-byte tie-break data yet.
  }
  const plan = buildFontPlan({
    corpus,
    homepage,
    committedCore,
    committedAssignments,
    artifactBytes,
    rebuildCore,
  })
  const assignmentBytes = Buffer.from(serializeAssignments(plan.assignments))
  const manifest = await generateSiteFontArtifacts({
    root,
    sourcePath,
    sourceSha256: metadata.sha256,
    axes: metadata.axes,
    core: plan.core,
    buckets: plan.buckets,
    assignmentBytes,
    assignmentOutput: assignmentsPath,
    coreOutput: rebuildCore ? corePath : undefined,
  })
  const bytes = manifest.artifacts.reduce((sum, artifact) => sum + artifact.bytes, 0)
  console.log(`Generated ${manifest.artifacts.length} Chiron WOFF2 artifacts (${bytes} bytes)`)
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  await main()
}
