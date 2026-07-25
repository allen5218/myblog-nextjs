import { promises as fs } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { classifySiteFontCodePoint } from './site-font-text.mjs'

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

export function parseAssignmentEpoch(text) {
  const value = String(text).trim()
  if (!/^\d+$/.test(value)) throw new Error(`Invalid assignment epoch: ${JSON.stringify(text)}`)
  return Number.parseInt(value, 10)
}

export function serializeAssignmentEpoch(epoch) {
  if (!Number.isInteger(epoch) || epoch < 0) {
    throw new Error(`Invalid assignment epoch: ${epoch}`)
  }
  return `${epoch}\n`
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

const REBALANCE_RESTARTS = 256
const REBALANCE_SEED = 20260725
const SHARED_BUCKET = 0

function seededRandom(seed) {
  let state = seed % 2147483647
  if (state <= 0) state += 2147483646
  return () => {
    state = (state * 16807) % 2147483647
    return (state - 1) / 2147483646
  }
}

// 幾乎每一對文件都共用字元,所以各文件的「桶集合」必須兩兩相交。2-子集族兩兩相交
// 只有兩種形狀:全部含同一個共同桶,或三個桶的三角。這裡採共同桶(sunflower):
// bucket 0 收所有跨群字元,其餘每個 bucket 專屬一群文件。這讓決策變數從「每個字元
// 選一個桶」(196 維、約束隱晦)降為「每份文件選一群」(16 維、≤2 桶由結構保證)。
function rebalanceModel({ corpus, core, committedAssignments }) {
  const documents = [...corpus.documents.keys()]
  const documentIndex = new Map(documents.map((name, index) => [name, index]))
  const candidates = new Set(
    [...supportedCorpus(corpus)].filter((codePoint) => !core.has(codePoint))
  )
  for (const codePoint of committedAssignments.keys()) {
    if (!core.has(codePoint)) candidates.add(codePoint)
  }
  const entries = sortedCodePoints(candidates).map((codePoint) => ({
    codePoint,
    pages: [...(corpus.occurrences.get(codePoint) ?? [])]
      .map((name) => documentIndex.get(name))
      .filter((index) => index !== undefined)
      .sort((left, right) => left - right),
  }))
  return { entries, documentCount: documents.length }
}

// 字元只出現在同一群的文件裡 → 該群專屬桶;跨群或無文件 → 共同桶。
function bucketForEntry(entry, groupOf) {
  if (entry.pages.length === 0) return SHARED_BUCKET
  const group = groupOf[entry.pages[0]]
  for (const page of entry.pages) {
    if (groupOf[page] !== group) return SHARED_BUCKET
  }
  return group + 1
}

function evaluateGrouping({ entries, documentCount, bucketCount, groupOf }) {
  const bucketSizes = Array(bucketCount).fill(0)
  const documentBuckets = Array.from({ length: documentCount }, () => new Set())
  for (const entry of entries) {
    const bucket = bucketForEntry(entry, groupOf)
    bucketSizes[bucket] += 1
    for (const page of entry.pages) documentBuckets[page].add(bucket)
  }
  let worst = 0
  for (const touched of documentBuckets) {
    let cost = 0
    for (const bucket of touched) cost += bucketSizes[bucket]
    if (cost > worst) worst = cost
  }
  return { worst, bucketSizes, documentBuckets }
}

export function rebalanceAssignments({
  corpus,
  core,
  committedAssignments = new Map(),
  bucketCount = BUCKET_COUNT,
  maxBucketsPerDocument = 2,
}) {
  const { entries, documentCount } = rebalanceModel({ corpus, core, committedAssignments })
  const groupCount = bucketCount - 1
  const evaluate = (groupOf) => evaluateGrouping({ entries, documentCount, bucketCount, groupOf })

  let best = null
  for (let restart = 0; restart < REBALANCE_RESTARTS; restart += 1) {
    const random = seededRandom(REBALANCE_SEED + restart)
    // restart 0 用確定性的輪流分群當基準,其餘用固定 seed 的隨機起點。
    const groupOf = Array.from({ length: documentCount }, (_, index) =>
      restart === 0 ? index % groupCount : Math.floor(random() * groupCount)
    )
    let current = evaluate(groupOf)
    // 爬山:固定的掃描順序,只在嚴格改善時才接受,確保完全確定性。
    let improved = true
    while (improved) {
      improved = false
      for (let page = 0; page < documentCount; page += 1) {
        const original = groupOf[page]
        // 掃完所有候選後才落定。還原成 original 而非「目前已接受的那一個」會讓
        // groupOf 與 current 脫鉤 —— 評分與約束驗證就會用到不是最終輸出的那組分群。
        let accepted = original
        for (let group = 0; group < groupCount; group += 1) {
          if (group === original) continue
          groupOf[page] = group
          const candidate = evaluate(groupOf)
          if (candidate.worst < current.worst) {
            current = candidate
            accepted = group
            improved = true
          }
        }
        groupOf[page] = accepted
      }
    }
    // 嚴格小於才取代 → 平手時保留較早的 restart,結果與重啟次數無關。
    if (!best || current.worst < best.result.worst)
      best = { result: current, groupOf: [...groupOf] }
  }

  for (const touched of best.result.documentBuckets) {
    if (touched.size > maxBucketsPerDocument) {
      throw new Error(
        `Chiron rebalance could not keep every document within ${maxBucketsPerDocument} buckets (needed ${touched.size})`
      )
    }
  }

  const assignments = new Map()
  for (const entry of entries) {
    assignments.set(entry.codePoint, bucketForEntry(entry, best.groupOf))
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
  rebalance = false,
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
  const assignments = rebalance
    ? rebalanceAssignments({ corpus, core, committedAssignments: retainedAssignments })
    : placeNewAssignments({
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
  const result = new Set()
  for (const character of text.normalize('NFC')) {
    const codePoint = character.codePointAt(0)
    const classification = classifySiteFontCodePoint(codePoint)
    if (classification.kind === 'included') result.add(codePoint)
    else if (classification.kind === 'unknown') {
      throw new Error(`Unknown Unicode category for U+${formatCodePoint(codePoint)}`)
    }
  }
  return result
}

export function corpusFromGeneratedBlogs(blogs) {
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

export function homepageFromGeneratedBlogs(blogs) {
  const listed = blogs.filter((blog) => blog.listed !== false)
  const cards = listed.sort((left, right) => right.date.localeCompare(left.date)).slice(0, 5)
  // 側欄 Featured Tags 與 HuxSidebar 同邏輯:所有 listed 文章中出現超過一次的標籤
  // 都會渲染在首頁,不只前五張卡片的標籤。
  const tagCounts = new Map()
  for (const blog of listed) {
    for (const tag of blog.tags ?? []) tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1)
  }
  const featuredTags = [...tagCounts].filter(([, count]) => count > 1).map(([tag]) => tag)
  return codePointsIn(
    [
      ...cards.map((blog) =>
        [
          blog.title,
          blog.subtitle,
          blog.preview || (blog.summary !== blog.subtitle ? blog.summary : undefined),
          blog.author,
          ...(blog.tags ?? []),
        ]
          .filter(Boolean)
          .join('\n')
      ),
      ...featuredTags,
    ].join('\n')
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
