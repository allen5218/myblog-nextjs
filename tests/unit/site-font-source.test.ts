import { describe, expect, it } from 'vitest'
import {
  loadSourceMetadata,
  verifySha256,
} from '../../scripts/site-font-source.mjs'

describe('Chiron site font source metadata', () => {
  it('pins a concrete Google Fonts revision and source digest', async () => {
    const metadata = await loadSourceMetadata(process.cwd())

    expect(metadata).toMatchObject({
      schemaVersion: 1,
      family: 'Chiron Sung HK',
      axes: { wght: { min: 200, max: 900 } },
      license: 'OFL-1.1',
    })
    expect(metadata.revision).toMatch(/^[0-9a-f]{40}$/)
    expect(metadata.sha256).toMatch(/^[0-9a-f]{64}$/)
    expect(metadata.sha256).not.toMatch(/^0{64}$/)
    expect(metadata.url).toContain(metadata.revision)
    expect(metadata.url).not.toContain('/main/')
  })

  it('rejects bytes that do not match the pinned digest', async () => {
    const metadata = await loadSourceMetadata(process.cwd())

    expect(() => verifySha256(Buffer.from('wrong'), metadata.sha256)).toThrow(/SHA-256/)
  })
})
