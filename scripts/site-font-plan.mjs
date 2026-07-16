import { promises as fs } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const BUCKET_COUNT = 5
const HIGH_FREQUENCY_DOCUMENTS = 5

const sortedCodePoints = (codePoints) => [...codePoints].sort((left, right) => left - right)
const formatCodePoint = (codePoint) => codePoint.toString(16).toUpperCase().padStart(4, '0')

function assertCodePoint(codePoint, value) {
  if (
    !Number.isInteger(codePoint) ||
    codePoint < 0 ||
    codePoint > 0x10ffff ||
    (codePoint >= 0xd800 && codePoint <= 0xdfff)
  ) {
    throw new Error(`Invalid code point: ${value}`)
  }
}

export function parseCodepoints(text) {
  const codePoints = new Set()
  for (const value of text.split(/\s+/).filter(Boolean)) {
    if (!/^[0-9A-Fa-f]+$/.test(value)) throw new Error(`Invalid code point: ${value}`)
    const codePoint = Number.parseInt(value, 16)
    assertCodePoint(codePoint, value)
    codePoints.add(codePoint)
  }
  return codePoints
}

export function serializeCodepoints(codePoints) {
  const lines = sortedCodePoints(codePoints).map(formatCodePoint)
  return lines.length === 0 ? '' : `${lines.join('\n')}\n`
}

export function parseAssignments(text) {
  let data
  try {
    data = JSON.parse(text)
  } catch (error) {
    throw new Error(`Invalid assignment JSON: ${error.message}`)
  }
  if (data?.schemaVersion !== 2) throw new Error('Invalid assignment schemaVersion; expected 2')
  if (data?.bucketCount !== BUCKET_COUNT) {
    throw new Error(`Invalid assignment bucketCount; expected ${BUCKET_COUNT}`)
  }
  if (
    !data.assignments ||
    Array.isArray(data.assignments) ||
    typeof data.assignments !== 'object'
  ) {
    throw new Error('Invalid assignments object')
  }

  const assignments = new Map()
  for (const [key, bucket] of Object.entries(data.assignments)) {
    if (!/^[0-9A-Fa-f]+$/.test(key)) throw new Error(`Invalid assignment code point: ${key}`)
    const codePoint = Number.parseInt(key, 16)
    assertCodePoint(codePoint, key)
    if (assignments.has(codePoint)) throw new Error(`Duplicate assignment code point: ${key}`)
    if (!Number.isInteger(bucket) || bucket < 0 || bucket >= BUCKET_COUNT) {
      throw new Error(`Invalid assignment bucket for ${key}: ${bucket}`)
    }
    assignments.set(codePoint, bucket)
  }
  return assignments
}

export function serializeAssignments(assignments) {
  const sorted = {}
  for (const codePoint of sortedCodePoints(assignments.keys())) {
    assertCodePoint(codePoint, codePoint)
    const bucket = assignments.get(codePoint)
    if (!Number.isInteger(bucket) || bucket < 0 || bucket >= BUCKET_COUNT) {
      throw new Error(`Invalid assignment bucket for ${formatCodePoint(codePoint)}: ${bucket}`)
    }
    sorted[formatCodePoint(codePoint)] = bucket
  }
  return `${JSON.stringify({ schemaVersion: 2, bucketCount: BUCKET_COUNT, assignments: sorted }, null, 2)}\n`
}

function supportedCorpus(corpus) {
  const supported = new Set(corpus.fixedSeed)
  for (const codePoints of corpus.documents.values()) {
    for (const codePoint of codePoints) supported.add(codePoint)
  }
  return supported
}

function comparePlacement(left, right) {
  return (
    right.cooccurrence - left.cooccurrence ||
    right.touchedPages - left.touchedPages ||
    left.artifactBytes - right.artifactBytes ||
    left.bucket - right.bucket
  )
}

export function placeNewAssignments({ corpus, core, committedAssignments, artifactBytes }) {
  if (!Array.isArray(artifactBytes) || artifactBytes.length !== BUCKET_COUNT) {
    throw new Error(`Expected ${BUCKET_COUNT} committed artifact byte counts`)
  }
  const assignments = new Map(committedAssignments)
  const current = supportedCorpus(corpus)
  const newCodePoints = sortedCodePoints(current).filter(
    (codePoint) => !core.has(codePoint) && !assignments.has(codePoint)
  )

  for (const codePoint of newCodePoints) {
    const containingDocuments = [...corpus.documents.values()].filter((set) => set.has(codePoint))
    const scores = Array.from({ length: BUCKET_COUNT }, (_, bucket) => {
      let cooccurrence = 0
      let touchedPages = 0
      for (const document of containingDocuments) {
        let pageCount = 0
        for (const assignedCodePoint of document) {
          if (assignedCodePoint !== codePoint && assignments.get(assignedCodePoint) === bucket) {
            pageCount += 1
          }
        }
        cooccurrence += pageCount
        if (pageCount > 0) touchedPages += 1
      }
      return { bucket, cooccurrence, touchedPages, artifactBytes: artifactBytes[bucket] }
    })
    scores.sort(comparePlacement)
    assignments.set(codePoint, scores[0].bucket)
  }
  return assignments
}

export function buildFontPlan({
  corpus,
  homepage = new Set(),
  committedCore,
  committedAssignments = new Map(),
  artifactBytes = Array(BUCKET_COUNT).fill(0),
  rebuildCore,
}) {
  const core = new Set(committedCore)
  const promoted = new Set()
  if (rebuildCore) {
    const candidates = new Set([...corpus.fixedSeed, ...homepage])
    for (const [codePoint, documents] of corpus.occurrences) {
      if (documents.size >= HIGH_FREQUENCY_DOCUMENTS) candidates.add(codePoint)
    }
    for (const codePoint of candidates) {
      if (!core.has(codePoint)) promoted.add(codePoint)
      core.add(codePoint)
    }
  }

  const retainedAssignments = new Map(
    [...committedAssignments].filter(([codePoint]) => !core.has(codePoint))
  )
  const assignments = placeNewAssignments({
    corpus,
    core,
    committedAssignments: retainedAssignments,
    artifactBytes,
  })
  const newlyAssigned = new Set(
    [...assignments.keys()].filter((codePoint) => !committedAssignments.has(codePoint))
  )
  const buckets = new Map(
    Array.from({ length: BUCKET_COUNT }, (_, bucket) => [
      bucket,
      new Set([...assignments].filter(([, assigned]) => assigned === bucket).map(([cp]) => cp)),
    ])
  )
  return { core, buckets, assignments, promoted, newlyAssigned }
}

export function migrateAssignmentsV2({ corpus, homepage = new Set(), committedCore }) {
  const core = new Set([...committedCore, ...corpus.fixedSeed, ...homepage])
  for (const [codePoint, documents] of corpus.occurrences) {
    if (documents.size >= HIGH_FREQUENCY_DOCUMENTS) core.add(codePoint)
  }

  const documents = [...corpus.documents.values()]
  const groupsBySignature = new Map()
  for (const codePoint of sortedCodePoints(supportedCorpus(corpus))) {
    if (core.has(codePoint)) continue
    const signature = documents
      .map((document, index) => (document.has(codePoint) ? index : ''))
      .filter((value) => value !== '')
      .join(',')
    const group = groupsBySignature.get(signature) ?? []
    group.push(codePoint)
    groupsBySignature.set(signature, group)
  }
  const groups = [...groupsBySignature].map(([signature, codePoints]) => ({
    signature,
    codePoints,
    pages: signature === '' ? [] : signature.split(',').map(Number),
  }))
  groups.sort(
    (left, right) =>
      right.codePoints.length - left.codePoints.length ||
      left.signature.localeCompare(right.signature) ||
      left.codePoints[0] - right.codePoints[0]
  )

  const buckets = Array.from({ length: BUCKET_COUNT }, () => new Set())
  const pageBucketCounts = Array.from({ length: documents.length }, () =>
    Array(BUCKET_COUNT).fill(0)
  )
  const assignments = new Map()
  for (const group of groups) {
    let best
    for (let bucket = 0; bucket < BUCKET_COUNT; bucket += 1) {
      const newlyTouched = group.pages.filter((page) => pageBucketCounts[page][bucket] === 0).length
      const overlap = group.pages.reduce((total, page) => total + pageBucketCounts[page][bucket], 0)
      const key = [newlyTouched, -overlap, buckets[bucket].size, bucket]
      // This deliberately reproduces the approved optimizer's dominance-biased scan.
      if (
        !best ||
        key.some((value, index) => value !== best.key[index] && value < best.key[index])
      ) {
        best = { bucket, key }
      }
    }
    for (const codePoint of group.codePoints) {
      assignments.set(codePoint, best.bucket)
      buckets[best.bucket].add(codePoint)
    }
    for (const page of group.pages) pageBucketCounts[page][best.bucket] += group.codePoints.length
  }
  return { schemaVersion: 2, bucketCount: BUCKET_COUNT, core, assignments }
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

function codePointsIn(text) {
  return new Set(
    [...text.normalize('NFC')]
      .map((character) => character.codePointAt(0))
      .filter((codePoint) => codePoint >= 0x20)
  )
}

function corpusFromGeneratedBlogs(blogs) {
  const documents = new Map()
  const occurrences = new Map()
  for (const blog of blogs) {
    const text = [blog.title, blog.subtitle, blog.summary, blog.body.raw].filter(Boolean).join('\n')
    const codePoints = codePointsIn(text)
    documents.set(blog.path, codePoints)
    for (const codePoint of codePoints) {
      const pages = occurrences.get(codePoint) ?? new Set()
      pages.add(blog.path)
      occurrences.set(codePoint, pages)
    }
  }
  return { fixedSeed: new Set(), documents, occurrences, excluded: new Map() }
}

function homepageFromGeneratedBlogs(blogs) {
  const cards = blogs
    .filter((blog) => blog.listed !== false)
    .sort((left, right) => right.date.localeCompare(left.date))
    .slice(0, 5)
  return codePointsIn(
    cards
      .map((blog) =>
        [blog.title, blog.subtitle, blog.preview, blog.author, ...(blog.tags ?? [])]
          .filter(Boolean)
          .join('\n')
      )
      .join('\n')
  )
}

async function migrateCommand() {
  const required = ['--migrate-assignments-v2', '--write-core', '--write-assignments']
  if (!required.every((argument) => process.argv.includes(argument))) {
    throw new Error(`Usage: node scripts/site-font-plan.mjs ${required.join(' ')}`)
  }
  const root = process.cwd()
  const corePath = path.join(root, 'font-data/chiron/core-codepoints.txt')
  const assignmentsPath = path.join(root, 'font-data/chiron/supplemental-assignments.json')
  try {
    await fs.access(assignmentsPath)
    throw new Error(`Refusing to overwrite existing v2 assignment map: ${assignmentsPath}`)
  } catch (error) {
    if (error.code !== 'ENOENT') throw error
  }
  const committedCore = parseCodepoints(await fs.readFile(corePath, 'utf8'))
  const blogs = JSON.parse(
    await fs.readFile(path.join(root, '.contentlayer/generated/Blog/_index.json'), 'utf8')
  )
  const migration = migrateAssignmentsV2({
    corpus: corpusFromGeneratedBlogs(blogs),
    homepage: homepageFromGeneratedBlogs(blogs),
    committedCore,
  })
  await fs.writeFile(corePath, serializeCodepoints(migration.core))
  await fs.writeFile(assignmentsPath, serializeAssignments(migration.assignments), { flag: 'wx' })
  const counts = Array(BUCKET_COUNT).fill(0)
  for (const bucket of migration.assignments.values()) counts[bucket] += 1
  console.log(
    `Chiron v2 migration: core ${committedCore.size} -> ${migration.core.size} (${migration.core.size - committedCore.size} promoted); buckets [${counts.join(',')}]`
  )
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  await migrateCommand()
}
