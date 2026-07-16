import { promises as fs } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { collectSiteFontCorpus } from './site-font-text.mjs'

const BUCKET_COUNT = 8
const HIGH_FREQUENCY_DOCUMENTS = 5

const sortedCodePoints = (codePoints) => [...codePoints].sort((left, right) => left - right)
const formatCodePoint = (codePoint) => codePoint.toString(16).toUpperCase().padStart(4, '0')
const bucketFor = (codePoint) => codePoint % BUCKET_COUNT

export function parseCodepoints(text) {
  const codePoints = new Set()
  for (const value of text.split(/\s+/).filter(Boolean)) {
    if (!/^[0-9A-Fa-f]+$/.test(value)) throw new Error(`Invalid code point: ${value}`)
    const codePoint = Number.parseInt(value, 16)
    if (codePoint > 0x10ffff) throw new Error(`Invalid code point: ${value}`)
    codePoints.add(codePoint)
  }
  return codePoints
}

export function serializeCodepoints(codePoints) {
  const lines = sortedCodePoints(codePoints).map(formatCodePoint)
  return lines.length === 0 ? '' : `${lines.join('\n')}\n`
}

export function buildFontPlan({ corpus, committedCore, rebuildCore }) {
  const core = new Set(committedCore)
  const promoted = new Set()

  if (rebuildCore) {
    const candidates = new Set(corpus.fixedSeed)
    for (const [codePoint, documents] of corpus.occurrences) {
      if (documents.size >= HIGH_FREQUENCY_DOCUMENTS) candidates.add(codePoint)
    }
    for (const codePoint of candidates) {
      if (!core.has(codePoint)) promoted.add(codePoint)
      core.add(codePoint)
    }
  }

  const buckets = new Map(Array.from({ length: BUCKET_COUNT }, (_, bucket) => [bucket, new Set()]))
  const supportedCorpus = new Set(corpus.fixedSeed)
  for (const codePoints of corpus.documents.values()) {
    for (const codePoint of codePoints) supportedCorpus.add(codePoint)
  }
  for (const codePoint of supportedCorpus) {
    if (!core.has(codePoint)) buckets.get(bucketFor(codePoint)).add(codePoint)
  }

  return { core, buckets, promoted }
}

export function compressUnicodeRanges(codePoints) {
  const values = sortedCodePoints(codePoints)
  const ranges = []
  for (let index = 0; index < values.length; ) {
    const start = values[index]
    let end = start
    while (index + 1 < values.length && values[index + 1] === end + 1) {
      index += 1
      end = values[index]
    }
    ranges.push(
      start === end
        ? `U+${formatCodePoint(start)}`
        : `U+${formatCodePoint(start)}-${formatCodePoint(end)}`
    )
    index += 1
  }
  return ranges.join(',')
}

async function rebuildCommittedCore() {
  if (!process.argv.includes('--rebuild-core') || !process.argv.includes('--write-core')) {
    throw new Error('Usage: node scripts/site-font-plan.mjs --rebuild-core --write-core')
  }

  const root = process.cwd()
  const corePath = path.join(root, 'font-data/chiron/core-codepoints.txt')
  let committedCore = new Set()
  try {
    committedCore = parseCodepoints(await fs.readFile(corePath, 'utf8'))
  } catch (error) {
    if (error.code !== 'ENOENT') throw error
  }

  const corpus = await collectSiteFontCorpus(root)
  const plan = buildFontPlan({ corpus, committedCore, rebuildCore: true })
  await fs.mkdir(path.dirname(corePath), { recursive: true })
  await fs.writeFile(corePath, serializeCodepoints(plan.core))
  console.log(
    `Chiron core code points: ${committedCore.size} -> ${plan.core.size} (${plan.promoted.size} promoted)`
  )
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  await rebuildCommittedCore()
}
