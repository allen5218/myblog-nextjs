import { promises as fs } from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'

const PRINTABLE_ASCII = Array.from({ length: 95 }, (_, index) =>
  String.fromCodePoint(index + 0x20)
).join('')

// Keep shared, statically rendered UI copy centralized so changes are deliberate and
// do not accidentally include source-code strings. New shared UI copy must update this seed.
const SHARED_UI_TEXT = [
  "Allen's Blog",
  'Archive',
  'Tags',
  'About',
  'Search',
  'Older Posts',
  'Newer Posts',
  'Previous',
  'Next',
  'Search articles',
  'Back to top',
  'Theme switcher',
  'Light',
  'Dark',
  'System',
  'Toggle navigation',
  '離線',
  '閱讀過的頁面可以在離線時訪問哦 ;)',
  '已瀏覽過的頁面仍會從快取顯示,重新連線後即可繼續閱讀其他文章。',
  '回首頁 →',
  '分享技術和生活',
  '聯絡信箱:',
]

async function markdownFiles(directory) {
  const entries = await fs.readdir(directory, { withFileTypes: true })
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const entryPath = path.join(directory, entry.name)
      if (entry.isDirectory()) return markdownFiles(entryPath)
      return /\.(md|mdx|markdown)$/.test(entry.name) ? [entryPath] : []
    })
  )
  return nested.flat()
}

function stringsIn(value) {
  if (typeof value === 'string') return [value]
  if (Array.isArray(value)) return value.flatMap(stringsIn)
  if (value && typeof value === 'object') return Object.values(value).flatMap(stringsIn)
  return []
}

export function classifySiteFontCodePoint(codePoint) {
  const character = String.fromCodePoint(codePoint)
  if (
    (codePoint >= 0xfe00 && codePoint <= 0xfe0f) ||
    (codePoint >= 0xe0100 && codePoint <= 0xe01ef)
  ) {
    return { kind: 'excluded', category: 'variation-selector' }
  }
  if (/\p{Cc}|\p{Cf}/u.test(character)) return { kind: 'excluded', category: 'control' }
  if (
    /\p{Extended_Pictographic}|\p{Emoji_Modifier}/u.test(character) ||
    (codePoint >= 0x1f1e6 && codePoint <= 0x1f1ff) ||
    codePoint === 0x20e3
  ) {
    return { kind: 'excluded', category: 'emoji' }
  }
  if (
    (codePoint >= 0x20 && codePoint <= 0x7e) ||
    /^[\p{L}\p{N}\p{P}\p{Sm}\p{Zs}]$/u.test(character)
  ) {
    return { kind: 'included' }
  }
  return { kind: 'unknown' }
}

function collectCodePoints(text, excluded) {
  const codePoints = new Set()
  for (const character of text.normalize('NFC')) {
    const codePoint = character.codePointAt(0)
    const classification = classifySiteFontCodePoint(codePoint)
    if (classification.kind === 'excluded') {
      if (!excluded.has(classification.category)) excluded.set(classification.category, new Set())
      excluded.get(classification.category).add(codePoint)
    } else if (classification.kind === 'included') {
      codePoints.add(codePoint)
    } else {
      throw new Error(
        `Unknown Unicode category for U+${codePoint.toString(16).toUpperCase()} (${character}); deliberately classify this character category in classifySiteFontCodePoint, then run yarn update:site-font`
      )
    }
  }
  return codePoints
}

export async function collectSiteFontCorpus(root) {
  const excluded = new Map()
  const dictionaryValues = await Promise.all(
    ['zh-TW.json', 'en.json'].map(async (file) =>
      stringsIn(JSON.parse(await fs.readFile(path.join(root, 'dictionaries', file), 'utf8')))
    )
  )
  const requireFromRoot = createRequire(path.join(root, 'package.json'))
  const siteMetadata = requireFromRoot(path.join(root, 'data/siteMetadata.js'))
  const fixedSeed = collectCodePoints(
    [
      PRINTABLE_ASCII,
      ...SHARED_UI_TEXT,
      ...dictionaryValues.flat(),
      ...stringsIn(siteMetadata),
    ].join('\n'),
    excluded
  )

  const files = (
    await Promise.all(
      ['data/blog', 'data/authors'].map((directory) => markdownFiles(path.join(root, directory)))
    )
  ).flat()
  const documents = new Map()
  const occurrences = new Map()
  for (const file of files) {
    const documentName = path.relative(root, file).split(path.sep).join('/')
    const codePoints = collectCodePoints(await fs.readFile(file, 'utf8'), excluded)
    documents.set(documentName, codePoints)
    for (const codePoint of codePoints) {
      if (!occurrences.has(codePoint)) occurrences.set(codePoint, new Set())
      occurrences.get(codePoint).add(documentName)
    }
  }

  return { fixedSeed, documents, occurrences, excluded }
}
