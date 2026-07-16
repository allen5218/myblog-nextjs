import { spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

async function defaultRunner(command, args) {
  await new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: 'inherit' })
    child.once('error', reject)
    child.once('exit', (code, signal) => {
      if (code === 0) resolve()
      else
        reject(new Error(`${command} exited with ${signal ? `signal ${signal}` : `code ${code}`}`))
    })
  })
}

export async function runUpdateSiteFontCommand({
  args = process.argv.slice(2),
  runner = defaultRunner,
} = {}) {
  await runner('yarn', ['contentlayer2', 'build'])
  await runner(process.execPath, ['./scripts/update-site-font.mjs', ...args])
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  await runUpdateSiteFontCommand()
}
