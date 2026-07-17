import { describe, expect, it } from 'vitest'

import { runUpdateSiteFontCommand } from '../../scripts/update-site-font-command.mjs'

describe('site font update command', () => {
  it('freshly builds Contentlayer before updating and forwards CLI arguments', async () => {
    const calls: Array<{ command: string; args: string[] }> = []

    await runUpdateSiteFontCommand({
      args: ['--rebuild-core'],
      runner: async (command, args) => {
        calls.push({ command, args })
      },
    })

    expect(calls).toEqual([
      { command: 'yarn', args: ['contentlayer2', 'build'] },
      { command: process.execPath, args: ['./scripts/update-site-font.mjs', '--rebuild-core'] },
    ])
  })
})
