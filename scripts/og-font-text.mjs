import { promises as fs } from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import matter from 'gray-matter'

const ALWAYS_INCLUDED = [
  'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
  'abcdefghijklmnopqrstuvwxyz',
  '0123456789',
  "Allen's Blog Archive Tags About Page",
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

function dictionaryStrings(value) {
  if (typeof value === 'string') return [value]
  if (Array.isArray(value)) return value.flatMap(dictionaryStrings)
  if (value && typeof value === 'object') return Object.values(value).flatMap(dictionaryStrings)
  return []
}

function supportedCharacters(text) {
  return Array.from(text)
    .filter((character) => /[\p{L}\p{N}\p{P}\p{Sm}\p{Zs}]/u.test(character))
    .join('')
}

export async function collectOgFontText(root) {
  const files = await markdownFiles(path.join(root, 'data/blog'))
  const frontmatter = await Promise.all(
    files.map(async (file) => {
      const { data } = matter(await fs.readFile(file, 'utf8'))
      return [data.title, data.subtitle, data.summary].filter(Boolean).join(' ')
    })
  )
  const dictionaries = await Promise.all(
    ['zh-TW.json', 'en.json'].map(async (file) =>
      dictionaryStrings(
        JSON.parse(await fs.readFile(path.join(root, 'dictionaries', file), 'utf8'))
      )
    )
  )
  const requireFromRoot = createRequire(path.join(root, 'package.json'))
  const siteMetadata = requireFromRoot(path.join(root, 'data/siteMetadata.js'))
  const metadataText = [siteMetadata.title, siteMetadata.description].filter(Boolean)

  return [...ALWAYS_INCLUDED, ...frontmatter, ...dictionaries.flat(), ...metadataText]
    .map(supportedCharacters)
    .join('\n')
}
