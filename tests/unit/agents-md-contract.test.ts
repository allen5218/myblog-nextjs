import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, test } from 'vitest'

// `AGENTS.md`(`CLAUDE.md` 是它的 symlink)是 schema 層:操作規則,加上往兩個 wiki
// (`openwiki/` 與 `docs/lessons/`)的路由。它天生只會單向增長 —— 提交前檢查清單要求每個
// session 把新教訓落地,卻沒有任何東西會叫人搬走一組。跑一年的結果是 422 行 / 33,645 bytes。
//
// 這支測試把「該搬了」從判斷題變成必過檢查,理由有三個:
//   1. 長度有實測代價。ETH Zurich 的 AGENTbench(2026-02)量到 agent 指令檔讓成功率變動
//      落在 ±4%,而成本一律上升約 20%。每一行都在收租。
//   2. Codex CLI 的 PROJECT_DOC_MAX_BYTES 舊版是 32 KiB,**從檔尾靜默截斷、沒有任何警告**
//      (openai/codex#7138、#13386)。排在檔尾的正是「提交前檢查清單」。留 8 KiB 餘裕。
//   3. 沒有 inbound link 的文件被 agent 翻到的機率不到 10%。把知識搬進 `docs/lessons/`
//      卻沒在 `AGENTS.md` 留 pointer,等於刪掉它 —— 而且是靜默的。
//
// 守不到的東西明列如下,不要以為有了這支就夠:
//   - 內容品質:重複、矛盾、過時的條目照樣過關。
//   - pointer 的三個必要成分(祈使句、觸發條件、反向邊界)。只驗連結存在,不驗它有沒有
//     告訴 agent 什麼時候該讀、什麼時候不必讀。
//   - `docs/lessons/` 各檔自己的長度。那些是按需載入的,不佔每個 session 的預算。
//   - 條目有沒有放對層。判準在 `AGENTS.md` 的「這份文件的定位與維護規則」,是人在跑的。
const ROOT = process.cwd()
const AGENTS_PATH = resolve(ROOT, 'AGENTS.md')
const LESSONS_DIR = resolve(ROOT, 'docs/lessons')

/** Codex 舊版硬上限是 32 KiB 且從檔尾靜默截斷;留 8 KiB 餘裕保護檔尾的檢查清單。 */
const BUDGET_BYTES = 24 * 1024

const agentsSource = readFileSync(AGENTS_PATH, 'utf8')

/** `AGENTS.md` 連出去的 `docs/lessons/` 檔名(markdown 連結目標,不含 anchor)。 */
const linkedLessons = new Set(
  [...agentsSource.matchAll(/\]\(docs\/lessons\/([^)#]+\.md)(?:#[^)]*)?\)/g)].map(
    (match) => match[1]
  )
)

const lessonFiles = readdirSync(LESSONS_DIR).filter((name) => name.endsWith('.md'))

describe('AGENTS.md 的 schema 層契約', () => {
  test(`不超過 ${BUDGET_BYTES / 1024} KiB 的預算`, () => {
    const actual = Buffer.byteLength(agentsSource, 'utf8')

    expect(
      actual,
      `AGENTS.md 已達預算(${actual.toLocaleString()} / ${BUDGET_BYTES.toLocaleString()} bytes)。\n` +
        '請依「## 這份文件的定位與維護規則」的三問判準,搬一組子系統知識到 docs/lessons/,\n' +
        '並在原處留下含觸發條件的 pointer。\n' +
        '**不要調高這個上限** —— 上限就是強迫分流的機制,調高它等於把這道護欄關掉。'
    ).toBeLessThanOrEqual(BUDGET_BYTES)
  })

  test('每個 docs/lessons/ 頁面都有來自 AGENTS.md 的 inbound link', () => {
    const orphans = lessonFiles.filter((name) => !linkedLessons.has(name))

    expect(
      orphans,
      `docs/lessons/ 有孤兒頁:${orphans.join('、')}\n` +
        '沒有 inbound link 的文件被 agent 翻到的機率不到 10%,等於刪掉它。\n' +
        '請在 AGENTS.md 加 pointer,並且必須寫出觸發條件(什麼時候該讀)與反向邊界\n' +
        '(什麼時候不必讀)——少了反向邊界,agent 會保險起見每次都讀,等於沒搬。'
    ).toEqual([])
  })

  test('AGENTS.md 連出的每個 docs/lessons/ 路徑都存在', () => {
    const broken = [...linkedLessons].filter((name) => !lessonFiles.includes(name))

    expect(
      broken,
      `AGENTS.md 連到不存在的檔案:${broken.join('、')}\n` +
        '斷鏈比孤兒更糟:agent 會照指示去讀,讀不到,然後在沒有那份知識的情況下繼續動手。'
    ).toEqual([])
  })
})
