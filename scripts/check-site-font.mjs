import { createHash } from 'node:crypto'
import { execFile } from 'node:child_process'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import { fileURLToPath } from 'node:url'

import { canSkipDynamicSiteFontChecks } from './site-font-check-policy.mjs'
import { renderSiteFontCss } from './site-font-css.mjs'
import {
  buildFontPlan,
  homepageFromGeneratedBlogs,
  parseAssignments,
  parseCodepoints,
} from './site-font-plan.mjs'
import { loadSourceMetadata } from './site-font-source.mjs'
import { classifySiteFontCodePoint, collectSiteFontCorpus } from './site-font-text.mjs'

const execFileAsync = promisify(execFile)
const FONT_DIRECTORY = 'public/static/fonts/chiron'
const DYNAMIC_COMMANDS = ['hb-shape', 'hb-subset', 'hb-info', 'woff2_compress', 'woff2_decompress']
const USAGE_PROBE_COMMANDS = new Set(['woff2_compress', 'woff2_decompress'])
const WARNING_BYTES = 341_550
const HOMEPAGE_BUDGET_BYTES = 350_000
const HOMEPAGE_BUDGET_REQUESTS = 2
const ARTICLE_BUDGET_BYTES = 550_000
const ARTICLE_BUDGET_REQUESTS = 3
const PLACEMENT_POLICY = [
  'max-cooccurrence',
  'max-touched-pages',
  'min-artifact-bytes',
  'lowest-bucket-id',
]
const hex = (value) => value.toString(16).toUpperCase().padStart(4, '0')
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex')

/**
 * @typedef {(command: string, args: string[]) => Promise<string | void | {
 *   stdout?: string,
 *   stderr?: string,
 * }>} SiteFontCheckRunner
 */

/**
 * @typedef {object} SiteFontCheckOptions
 * @property {string} [root]
 * @property {boolean} [full]
 * @property {Partial<NodeJS.ProcessEnv>} [env]
 * @property {SiteFontCheckRunner} [runner]
 * @property {string} [baseAssignmentsPath]
 * @property {any[]} [budgetBlogs]
 */

async function defaultRunner(command, args) {
  return execFileAsync(command, args, { maxBuffer: 64 * 1024 * 1024 })
}

function requireCondition(condition, message) {
  if (!condition) throw new Error(`Chiron site font ${message}`)
}

export function validateCanonicalSiteFontCss(css, artifacts) {
  requireCondition(
    css === renderSiteFontCss(artifacts),
    'generated CSS disagrees with canonical CSS derived from the manifest'
  )
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

export function validateAssignmentHistory({ baseAssignments, assignments, core }) {
  for (const [codePoint, bucket] of baseAssignments) {
    if (core.has(codePoint)) continue
    requireCondition(
      assignments.has(codePoint),
      `historical assignment U+${hex(codePoint)} was removed`
    )
    requireCondition(
      assignments.get(codePoint) === bucket,
      `historical assignment U+${hex(codePoint)} changed bucket`
    )
  }
}

export function validateFixedSeedCore({ fixedSeed, core }) {
  for (const codePoint of fixedSeed) {
    requireCondition(core.has(codePoint), `fixed UI seed U+${hex(codePoint)} must be in core`)
  }
}

export function validatePageBudgets({ homepage, articles }) {
  requireCondition(
    homepage.bytes <= HOMEPAGE_BUDGET_BYTES && homepage.requests <= HOMEPAGE_BUDGET_REQUESTS,
    `homepage budget exceeds ${HOMEPAGE_BUDGET_BYTES} bytes or ${HOMEPAGE_BUDGET_REQUESTS} requests`
  )
  for (const article of articles) {
    requireCondition(
      article.bytes <= ARTICLE_BUDGET_BYTES,
      `article ${article.name} budget exceeds ${ARTICLE_BUDGET_BYTES} bytes`
    )
    requireCondition(
      article.requests <= ARTICLE_BUDGET_REQUESTS,
      `article ${article.name} budget exceeds ${ARTICLE_BUDGET_REQUESTS} requests`
    )
  }
}

async function loadBudgetBlogs(root) {
  const modelPath = path.join(root, '.contentlayer/generated/Blog/_index.json')
  let blogs
  try {
    blogs = JSON.parse(await fs.readFile(modelPath, 'utf8'))
  } catch (error) {
    throw new Error(`Chiron site font budget model is missing or malformed: ${error.message}`)
  }
  requireCondition(Array.isArray(blogs), 'budget model must be an array')
  requireCondition(blogs.length > 0, 'budget model must contain at least one article')
  return blogs
}

const belongsToChiron = (codePoint) => classifySiteFontCodePoint(codePoint).kind === 'included'

function validateManifestSchema(manifest) {
  requireCondition(manifest?.schemaVersion === 2, 'manifest schemaVersion must be 2')
  requireCondition(
    typeof manifest.sourceSha256 === 'string',
    'manifest source SHA-256 schema is invalid'
  )
  requireCondition(
    manifest.policy?.core === 'committed-monotonic-homepage',
    'manifest core policy is invalid'
  )
  requireCondition(manifest.policy?.bucketCount === 5, 'manifest bucket count must be 5')
  requireCondition(
    manifest.policy?.assignment === 'committed-cooccurrence-v2',
    'manifest assignment policy is invalid'
  )
  requireCondition(
    JSON.stringify(manifest.policy?.newCharacterPlacement) === JSON.stringify(PLACEMENT_POLICY),
    'manifest new-character placement policy is invalid'
  )
  requireCondition(
    Array.isArray(manifest.buckets) && manifest.buckets.length === 5,
    'manifest must retain five buckets'
  )
  requireCondition(
    Array.isArray(manifest.artifacts) && manifest.artifacts.length > 0,
    'manifest artifacts schema is invalid'
  )
}

async function discover(runner) {
  const missing = []
  for (const command of DYNAMIC_COMMANDS) {
    const args = USAGE_PROBE_COMMANDS.has(command) ? [] : ['--version']
    try {
      await runner(command, args)
    } catch (error) {
      if (error?.code === 'ENOENT') {
        missing.push(command)
        continue
      }
      const usageProbeSucceeded =
        USAGE_PROBE_COMMANDS.has(command) && typeof error?.code === 'number'
      if (!usageProbeSucceeded) {
        throw new Error(`Chiron site font ${command} probe failed: ${error.message}`)
      }
    }
  }
  return missing
}

function parseUnicodeList(stdout) {
  const values = new Set()
  for (const match of String(stdout).matchAll(/U\+([0-9A-Fa-f]{4,6})\b/g)) {
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

/** @param {SiteFontCheckOptions} [options] */
export async function checkSiteFont({
  root,
  full = false,
  env = process.env,
  runner = defaultRunner,
  baseAssignmentsPath,
  budgetBlogs,
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
  const assignmentPath = path.join(root, 'font-data/chiron/supplemental-assignments.json')
  let assignmentBytes
  try {
    assignmentBytes = await fs.readFile(assignmentPath)
  } catch (error) {
    throw new Error(`Chiron site font assignment file is missing: ${error.message}`)
  }
  requireCondition(
    digest(assignmentBytes) === manifest.assignmentSha256,
    'assignment SHA-256 disagrees with authoritative assignment file'
  )
  const assignments = parseAssignments(assignmentBytes.toString('utf8'))
  const committedCore = parseCodepoints(
    await fs.readFile(path.join(root, 'font-data/chiron/core-codepoints.txt'), 'utf8')
  )
  for (const codePoint of committedCore) {
    requireCondition(belongsToChiron(codePoint), `excluded core code point U+${hex(codePoint)}`)
  }
  requireCondition(sameSet(core, committedCore), 'manifest core disagrees with committed core')
  const buckets = new Map()
  const union = new Set(core)
  for (let index = 0; index < 5; index += 1) {
    const entry = manifest.buckets[index]
    requireCondition(entry?.bucket === index, 'manifest buckets are not stable and ordered')
    const values = parseList(entry.codePoints, `bucket ${index}`)
    for (const value of values) {
      requireCondition(!union.has(value), `core/bucket overlap at U+${hex(value)}`)
      requireCondition(
        assignments.get(value) === index,
        `bucket ${index} disagrees with assignments`
      )
      union.add(value)
    }
    buckets.set(index, values)
  }
  requireCondition(
    assignments.size === [...buckets.values()].reduce((sum, values) => sum + values.size, 0),
    'manifest buckets omit historical assignments'
  )
  for (const codePoint of assignments.keys()) {
    requireCondition(
      belongsToChiron(codePoint),
      `excluded assignment code point U+${hex(codePoint)}`
    )
    requireCondition(!core.has(codePoint), `core/assignment overlap at U+${hex(codePoint)}`)
  }
  if (baseAssignmentsPath) {
    const baseAssignments = parseAssignments(await fs.readFile(baseAssignmentsPath, 'utf8'))
    validateAssignmentHistory({ baseAssignments, assignments, core })
  }

  const collectedCorpus = await collectSiteFontCorpus(root)
  validateFixedSeedCore({ fixedSeed: collectedCorpus.fixedSeed, core })
  const blogs = budgetBlogs ?? (await loadBudgetBlogs(root))
  requireCondition(
    Array.isArray(blogs) && blogs.length > 0,
    'budget model must contain at least one article'
  )
  const homepage = homepageFromGeneratedBlogs(blogs)
  const supplementalBytes = Array.from(
    { length: 5 },
    (_, bucket) =>
      manifest.artifacts.find(
        (artifact) => artifact.role === 'supplemental' && artifact.bucket === bucket
      )?.bytes ?? 0
  )
  const expectedPlan = buildFontPlan({
    corpus: collectedCorpus,
    committedCore,
    committedAssignments: assignments,
    artifactBytes: supplementalBytes,
    rebuildCore: false,
  })
  for (let index = 0; index < 5; index += 1) {
    requireCondition(
      sameSet(buckets.get(index), expectedPlan.buckets.get(index)),
      `corpus plan is stale in bucket ${index}`
    )
  }
  const expectedSets = [{ role: 'core', bucket: null, values: core }]
  for (let index = 0; index < 5; index += 1) {
    if (buckets.get(index).size)
      expectedSets.push({
        role: 'supplemental',
        bucket: index,
        values: buckets.get(index),
      })
  }
  requireCondition(
    manifest.artifacts.length === expectedSets.length,
    'artifact count disagrees with nonempty sets'
  )
  const css = await fs.readFile(path.join(root, 'css/chiron-font.generated.css'), 'utf8')
  validateCanonicalSiteFontCss(css, manifest.artifacts)
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
    const stem = artifact.role === 'core' ? 'core' : `supplement-${artifact.bucket}`
    const expectedFile = `${stem}.${artifact.sha256.slice(0, 16)}.woff2`
    requireCondition(
      artifact.file === expectedFile,
      `artifact filename must match ${stem} and its SHA-256: expected ${expectedFile}`
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
    artifactBytes += artifact.bytes
  }

  const coreArtifact = manifest.artifacts.find(({ role }) => role === 'core')
  const warnings = []
  if (coreArtifact.bytes > WARNING_BYTES) {
    warnings.push(
      `core is ${coreArtifact.bytes} bytes, ${coreArtifact.bytes - WARNING_BYTES} bytes above the ${WARNING_BYTES}-byte warning threshold`
    )
  }

  const pageCost = (values) => {
    const touched = new Set()
    for (const value of values) {
      const bucket = assignments.get(value)
      if (bucket !== undefined) touched.add(bucket)
    }
    return {
      bytes:
        coreArtifact.bytes +
        [...touched].reduce((sum, bucket) => sum + supplementalBytes[bucket], 0),
      requests: 1 + touched.size,
    }
  }
  const homepageCost = pageCost(homepage)
  const pages = []
  for (const [name, values] of collectedCorpus.documents) {
    const cost = pageCost(values)
    pages.push({ name, ...cost })
  }
  validatePageBudgets({ homepage: homepageCost, articles: pages })
  const result = {
    skipped: [],
    artifactBytes,
    warnings,
    pages: [{ name: 'homepage', ...homepageCost }, ...pages],
  }
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
  const baseArgument = process.argv.find((argument) => argument.startsWith('--base-assignments='))
  const result = await checkSiteFont({
    root: process.cwd(),
    full: process.argv.includes('--full'),
    baseAssignmentsPath: baseArgument?.slice('--base-assignments='.length),
  })
  for (const warning of result.warnings) console.warn(`WARNING: ${warning}`)
  if (result.skipped.length)
    console.warn(`Skipping dynamic Chiron checks: ${result.skipped.join(', ')}`)
  console.log(`Verified Chiron site font artifacts (${result.artifactBytes} bytes)`)
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  await main()
}
