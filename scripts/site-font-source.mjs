import { createHash } from 'node:crypto'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

/**
 * @typedef {object} SourceMetadata
 * @property {1} schemaVersion
 * @property {'Chiron Sung HK'} family
 * @property {string} revision
 * @property {string} url
 * @property {string} sha256
 * @property {{ wght: { min: 200, max: 900 } }} axes
 * @property {'OFL-1.1'} license
 */

/** @returns {Promise<SourceMetadata>} */
export async function loadSourceMetadata(root) {
  const metadataPath = path.join(root, 'font-data/chiron/source.json')
  return JSON.parse(await fs.readFile(metadataPath, 'utf8'))
}

export function verifySha256(bytes, expected) {
  const actual = createHash('sha256').update(bytes).digest('hex')
  if (actual !== expected) {
    throw new Error(`Chiron source SHA-256 mismatch: ${actual}`)
  }
}

export async function ensureSourceFont(root) {
  const metadata = await loadSourceMetadata(root)
  const cacheDirectory = path.join(os.tmpdir(), 'chiron-site-font')
  const cachePath = path.join(cacheDirectory, `${metadata.sha256}.ttf`)

  await fs.mkdir(cacheDirectory, { recursive: true })

  try {
    const cachedBytes = await fs.readFile(cachePath)
    verifySha256(cachedBytes, metadata.sha256)
    return cachePath
  } catch {
    await fs.rm(cachePath, { force: true })
  }

  const response = await fetch(metadata.url)
  if (!response.ok) {
    throw new Error(`Failed to download Chiron source font: HTTP ${response.status}`)
  }

  const downloadedBytes = Buffer.from(await response.arrayBuffer())
  verifySha256(downloadedBytes, metadata.sha256)

  const temporaryPath = `${cachePath}.${process.pid}.${Date.now()}.tmp`
  try {
    await fs.writeFile(temporaryPath, downloadedBytes)
    await fs.rename(temporaryPath, cachePath)
  } finally {
    await fs.rm(temporaryPath, { force: true })
  }

  return cachePath
}
