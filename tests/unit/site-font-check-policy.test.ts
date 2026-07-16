import { describe, expect, it } from 'vitest'
import { canSkipDynamicSiteFontChecks } from '../../scripts/site-font-check-policy.mjs'

describe('canSkipDynamicSiteFontChecks', () => {
  it('only skips missing dynamic commands on Vercel', () => {
    expect(canSkipDynamicSiteFontChecks({ VERCEL: '1' }, ['hb-shape'])).toBe(true)
    expect(canSkipDynamicSiteFontChecks({}, ['hb-shape'])).toBe(false)
    expect(canSkipDynamicSiteFontChecks({ VERCEL: '1' }, [])).toBe(false)
  })
})
