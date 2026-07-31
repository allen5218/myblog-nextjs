import { spawn } from 'node:child_process'

let contentlayerWatcher
let nextDev
let stopping = false

function runYarn(args, env) {
  // Windows 上執行 yarn.cmd 必須帶 shell:true —— CVE-2024-27980 修補後的 Node
  // (含本專案要求的 20.9+)對 .cmd/.bat 直接 spawn 會拋 EINVAL。
  return spawn('yarn', args, {
    stdio: 'inherit',
    shell: process.platform === 'win32',
    env: env ? { ...process.env, ...env } : process.env,
  })
}

function stopChild(child, signal = 'SIGTERM') {
  if (child && !child.killed) {
    child.kill(signal)
  }
}

function stop(signal) {
  if (stopping) return

  stopping = true
  // blocking build 階段就收到訊號時,watcher/nextDev 還是 undefined,
  // 要一併終止 contentlayerBuild 才不會留下孤兒程序。
  stopChild(contentlayerBuild, signal)
  stopChild(contentlayerWatcher, signal)
  stopChild(nextDev, signal)
  process.exit(0)
}

// 本機 authoring 才看得到 draft。production build 不設這個變數,fail-closed 成 production。
const contentlayerBuild = runYarn(['contentlayer2', 'build'], {
  BLOG_PUBLICATION_MODE: 'preview',
})

contentlayerBuild.once('exit', (code, signal) => {
  if (code !== 0 || signal) {
    process.exitCode = code ?? 1
    return
  }

  contentlayerWatcher = runYarn(['contentlayer2', 'dev'], {
    BLOG_PUBLICATION_MODE: 'preview',
  })
  nextDev = runYarn(['next', 'dev'])

  contentlayerWatcher.once('exit', (watcherCode, watcherSignal) => {
    if (!stopping && (watcherCode !== 0 || watcherSignal)) {
      stopChild(nextDev)
      process.exit(watcherCode ?? 1)
    }
  })

  nextDev.once('exit', (nextCode, nextSignal) => {
    if (!stopping) {
      stopChild(contentlayerWatcher)
      process.exit(nextCode ?? (nextSignal ? 1 : 0))
    }
  })
})

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => stop(signal))
}
