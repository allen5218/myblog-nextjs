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

// 掃連結前先剝掉「看得到但不生效」的區域。註解掉的 pointer,與寫在 fenced block 裡當範例
// 的 pointer,對 agent 而言都不是路由,但字串還在 —— 不剝的話這支測試就是除錯守則第 7 條
// 說的那型空包彈:「保留了這個字串,卻讓它不再生效」。2026-08-09 實測:把 mermaid pointer
// 整段包進 `<!-- -->`,三條斷言原本全數照樣綠。
const scannableSource = agentsSource
  .replace(/<!--[\s\S]*?-->/g, '')
  .replace(/^```[\s\S]*?^```/gm, '')

/**
 * `AGENTS.md` 連出去的 `docs/lessons/` 檔名。
 *
 * 刻意只認 inline markdown 連結 —— code span 與 reference-style 連結不算數,因為 pointer
 * 的價值在於 agent 點得進去。放寬的只有可選的 `./` 前綴、anchor 與 title:那三種都是同一個
 * 連結的合法寫法,不放寬會製造假失敗。
 */
const linkedLessons = new Set(
  [
    ...scannableSource.matchAll(
      /\]\(\.?\/?docs\/lessons\/([^)#\s]+\.md)(?:#[^)\s]*)?(?:\s+"[^"]*")?\)/g
    ),
  ].map((match) => match[1])
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

  // 預算算的是本檔的 bytes,而 `@path` import 的內容一樣進每個 session 的 context。
  // 2026-08-09 實測:一行 30 bytes 的 `@docs/lessons/chiron-font.md` 能把 5,402 bytes
  // 搬進 context,而預算斷言完全看不到 —— 保留了「檔案很小」這個事實,卻讓它不再代表
  // 「context 很小」。這是繞過預算最便宜的一條路,所以獨立守住。
  test('不用 @import 把內容繞過預算搬進 context', () => {
    const imports = agentsSource
      .split('\n')
      .filter((line) => /^@\S/.test(line))

    expect(
      imports,
      `AGENTS.md 有 @import:${imports.join('、')}\n` +
        '這些內容一樣進每個 session 的 context,只是預算斷言量不到。\n' +
        '要引用 docs/lessons/ 請用一般 markdown 連結,讓 agent 依觸發條件自己決定要不要讀。'
    ).toEqual([])
  })

  test('每個 docs/lessons/ 頁面都有來自 AGENTS.md 的 inbound link', () => {
    const orphans = lessonFiles.filter((name) => !linkedLessons.has(name))

    expect(
      orphans,
      `docs/lessons/ 有孤兒頁:${orphans.join('、')}\n` +
        '沒有 inbound link 的文件被 agent 翻到的機率不到 10%,等於刪掉它。\n' +
        '請在 AGENTS.md 加 pointer,並且必須寫出觸發條件(什麼時候該讀)與反向邊界\n' +
        '(什麼時候不必讀)——少了反向邊界,agent 會保險起見每次都讀,等於沒搬。\n' +
        '如果你已經加了:pointer 必須是 inline markdown 連結 `[文字](docs/lessons/x.md)`。\n' +
        'code span、reference-style 連結、註解或 fenced block 裡的連結,這支測試都不算數。'
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
