import { createHash } from 'node:crypto'
import { execFile } from 'node:child_process'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import { fileURLToPath } from 'node:url'

import { canSkipDynamicSiteFontChecks } from './site-font-check-policy.mjs'
import { buildFontPlan, parseCodepoints } from './site-font-plan.mjs'
import { loadSourceMetadata } from './site-font-source.mjs'
import { collectSiteFontCorpus } from './site-font-text.mjs'

const execFileAsync = promisify(execFile)
const FONT_DIRECTORY = 'public/static/fonts/chiron'
const DYNAMIC_COMMANDS = ['hb-shape', 'hb-subset', 'hb-info', 'woff2_compress', 'woff2_decompress']
const WARNING_BYTES = 341_550
const hex = (value) => value.toString(16).toUpperCase().padStart(4, '0')
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex')

async function defaultRunner(command, args) {
  return execFileAsync(command, args, { maxBuffer: 64 * 1024 * 1024 })
}

function requireCondition(condition, message) {
  if (!condition) throw new Error(`Chiron site font ${message}`)
}

function parseList(values, label) {
  requireCondition(Array.isArray(values), `${label} must be an array`)
  const parsed = values.map((value) => {
    requireCondition(
      typeof value === 'string' && /^[0-9A-F]{4,6}$/.test(value),
      `${label} schema is invalid`
    )
    return Number.parseInt(value, 16)
  })
  requireCondition(new Set(parsed).size === parsed.length, `${label} contains duplicates`)
  requireCondition(
    parsed.every((value, index) => index === 0 || parsed[index - 1] < value),
    `${label} must be sorted`
  )
  return new Set(parsed)
}

function sameSet(left, right) {
  return left.size === right.size && [...left].every((value) => right.has(value))
}

function validateManifestSchema(manifest) {
  requireCondition(manifest?.schemaVersion === 1, 'manifest schemaVersion must be 1')
  requireCondition(
    typeof manifest.sourceSha256 === 'string',
    'manifest source SHA-256 schema is invalid'
  )
  requireCondition(
    manifest.policy?.core === 'committed-monotonic',
    'manifest core policy is invalid'
  )
  requireCondition(manifest.policy?.bucketCount === 8, 'manifest bucket count must be 8')
  requireCondition(
    manifest.policy?.bucketFunction === 'codePoint % 8',
    'manifest bucket function is invalid'
  )
  requireCondition(
    Array.isArray(manifest.buckets) && manifest.buckets.length === 8,
    'manifest must retain eight buckets'
  )
  requireCondition(
    Array.isArray(manifest.artifacts) && manifest.artifacts.length > 0,
    'manifest artifacts schema is invalid'
  )
}

async function discover(runner) {
  const missing = []
  for (const command of DYNAMIC_COMMANDS) {
    try {
      await runner(command, ['--version'])
    } catch (error) {
      if (error?.code === 'ENOENT') missing.push(command)
    }
  }
  return missing
}

function parseUnicodeList(stdout) {
  const values = new Set()
  for (const match of String(stdout).matchAll(/(?:U\+|^|\s)([0-9A-Fa-f]{4,6})(?=\s|$)/gm)) {
    values.add(Number.parseInt(match[1], 16))
  }
  return values
}

function validateAxis(stdout) {
  const line = String(stdout)
    .split('\n')
    .find((value) => /^wght\s/.test(value.trim()))
  const numbers = line?.match(/-?\d+(?:\.\d+)?/g)?.map(Number) ?? []
  requireCondition(
    numbers.length >= 3 && numbers[0] === 200 && numbers[2] === 900,
    'wght axis must span 200 to 900'
  )
}

export async function checkSiteFont({
  root,
  full = false,
  env = process.env,
  runner = defaultRunner,
} = {}) {
  root ??= process.cwd()
  const manifestPath = path.join(root, FONT_DIRECTORY, 'manifest.json')
  let manifest
  try {
    manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'))
  } catch (error) {
    throw new Error(`Chiron site font manifest is missing or invalid: ${error.message}`)
  }
  validateManifestSchema(manifest)

  const metadata = await loadSourceMetadata(root)
  requireCondition(
    manifest.sourceSha256 === metadata.sha256,
    'manifest source SHA-256 disagrees with source metadata'
  )
  requireCondition(
    JSON.stringify(manifest.policy.axes) === JSON.stringify(metadata.axes),
    'manifest axes disagree with source metadata'
  )

  const core = parseList(manifest.core, 'manifest core')
  const committedCore = parseCodepoints(
    await fs.readFile(path.join(root, 'font-data/chiron/core-codepoints.txt'), 'utf8')
  )
  requireCondition(sameSet(core, committedCore), 'manifest core disagrees with committed core')
  const buckets = new Map()
  const union = new Set(core)
  for (let index = 0; index < 8; index += 1) {
    const entry = manifest.buckets[index]
    requireCondition(entry?.bucket === index, 'manifest buckets are not stable and ordered')
    const values = parseList(entry.codePoints, `bucket ${index}`)
    for (const value of values) {
      requireCondition(value % 8 === index, `bucket ${index} violates codePoint % 8`)
      requireCondition(!union.has(value), `core/bucket overlap at U+${hex(value)}`)
      union.add(value)
    }
    buckets.set(index, values)
  }

  const corpus = await collectSiteFontCorpus(root)
  const expectedPlan = buildFontPlan({ corpus, committedCore, rebuildCore: false })
  for (let index = 0; index < 8; index += 1) {
    requireCondition(
      sameSet(buckets.get(index), expectedPlan.buckets.get(index)),
      `corpus plan is stale in bucket ${index}`
    )
  }

  const expectedSets = [{ role: 'core', bucket: null, values: core }]
  for (let index = 0; index < 8; index += 1) {
    if (buckets.get(index).size)
      expectedSets.push({ role: 'supplemental', bucket: index, values: buckets.get(index) })
  }
  requireCondition(
    manifest.artifacts.length === expectedSets.length,
    'artifact count disagrees with nonempty sets'
  )
  const css = await fs.readFile(path.join(root, 'css/chiron-font.generated.css'), 'utf8')
  let artifactBytes = 0
  for (const [index, artifact] of manifest.artifacts.entries()) {
    const expected = expectedSets[index]
    requireCondition(
      artifact?.role === expected.role && artifact?.bucket === expected.bucket,
      'artifact role/bucket schema is invalid'
    )
    requireCondition(
      typeof artifact.file === 'string' && /^[a-z0-9-]+\.[0-9a-f]+\.woff2$/.test(artifact.file),
      'artifact filename schema is invalid'
    )
    requireCondition(
      typeof artifact.sha256 === 'string' && /^[0-9a-f]{64}$/.test(artifact.sha256),
      'artifact SHA-256 schema is invalid'
    )
    requireCondition(
      Number.isInteger(artifact.bytes) && artifact.bytes > 0,
      'artifact bytes schema is invalid'
    )
    requireCondition(
      sameSet(parseList(artifact.codePoints, `artifact ${artifact.file}`), expected.values),
      `artifact ${artifact.file} code points disagree with its set`
    )
    let bytes
    try {
      bytes = await fs.readFile(path.join(root, FONT_DIRECTORY, artifact.file))
    } catch {
      throw new Error(`Chiron site font artifact is missing: ${artifact.file}`)
    }
    requireCondition(
      bytes.length === artifact.bytes,
      `artifact byte count mismatch: ${artifact.file}`
    )
    requireCondition(
      digest(bytes) === artifact.sha256,
      `artifact SHA-256 mismatch: ${artifact.file}`
    )
    const reference = `/static/fonts/chiron/${artifact.file}`
    requireCondition(
      css.split(reference).length - 1 === 1,
      `CSS reference mismatch: ${artifact.file}`
    )
    artifactBytes += artifact.bytes
  }
  const cssReferences = [...css.matchAll(/\/static\/fonts\/chiron\/([^')]+\.woff2)/g)].map(
    (match) => match[1]
  )
  requireCondition(
    cssReferences.length === manifest.artifacts.length,
    'CSS reference count mismatch'
  )

  const coreArtifact = manifest.artifacts.find(({ role }) => role === 'core')
  const warnings = []
  if (coreArtifact.bytes > WARNING_BYTES) {
    warnings.push(
      `core is ${coreArtifact.bytes} bytes, ${coreArtifact.bytes - WARNING_BYTES} bytes above the ${WARNING_BYTES}-byte warning threshold`
    )
  }

  const result = { skipped: [], artifactBytes, warnings }
  if (!full) return result

  const missing = await discover(runner)
  if (missing.length) {
    if (canSkipDynamicSiteFontChecks(env, missing)) {
      result.skipped.push('glyph', 'cmap', 'axis')
      return result
    }
    throw new Error(
      `Chiron site font dynamic checks require ${missing.join(', ')}. Install HarfBuzz and woff2 tools.`
    )
  }

  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'site-font-check-'))
  try {
    for (const artifact of manifest.artifacts) {
      const input = path.join(root, FONT_DIRECTORY, artifact.file)
      const woff = path.join(temporary, artifact.file)
      await fs.copyFile(input, woff)
      await runner('woff2_decompress', [woff])
      const ttf = woff.replace(/\.woff2$/, '.ttf')
      const textFile = path.join(temporary, `${artifact.file}.txt`)
      await fs.writeFile(
        textFile,
        artifact.codePoints
          .map((value) => String.fromCodePoint(Number.parseInt(value, 16)))
          .join('')
      )
      const shaped = await runner('hb-shape', [ttf, `--text-file=${textFile}`])
      requireCondition(
        !String(shaped?.stdout ?? shaped).includes('.notdef'),
        `.notdef found while shaping ${artifact.file}`
      )
      const unicode = await runner('hb-info', ['--list-unicodes', ttf])
      requireCondition(
        sameSet(
          parseUnicodeList(unicode?.stdout ?? unicode),
          new Set(artifact.codePoints.map((value) => Number.parseInt(value, 16)))
        ),
        `cmap mismatch: ${artifact.file}`
      )
      const variations = await runner('hb-info', ['--list-variations', ttf])
      validateAxis(variations?.stdout ?? variations)
    }
  } finally {
    await fs.rm(temporary, { recursive: true, force: true })
  }
  return result
}

async function main() {
  const result = await checkSiteFont({ root: process.cwd(), full: process.argv.includes('--full') })
  for (const warning of result.warnings) console.warn(`WARNING: ${warning}`)
  if (result.skipped.length)
    console.warn(`Skipping dynamic Chiron checks: ${result.skipped.join(', ')}`)
  console.log(`Verified Chiron site font artifacts (${result.artifactBytes} bytes)`)
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  await main()
}
