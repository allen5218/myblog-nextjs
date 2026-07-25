# Chiron supplemental assignment 一次性重排 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 用一次刻意的、確定性的 supplemental bucket 重排,讓 `yarn build` 的 `check:site-font` 重新通過,並把「刻意重排」變成進版控、可審計的機制。

**Architecture:** 在 `scripts/site-font-plan.mjs` 新增純函式 `rebalanceAssignments()`(依文件簽名分組 + 種子化重啟貪婪),由 `yarn update:site-font --rebalance` 明確觸發;新增 `font-data/chiron/assignment-epoch.txt`,讓 `check-site-font.mjs` 在 epoch 遞增時跳過 `validateAssignmentHistory`,CI 照既有 `--base-assignments` 模式傳入 base epoch。

**Tech Stack:** Node ESM 腳本(`.mjs`)、vitest(`yarn test:unit`)、Playwright(production 量測)、HarfBuzz `hb-subset` + `woff2_compress`。

## Global Constraints

- 預算常數**不得更動**:`HOMEPAGE_BUDGET_BYTES` 350,000 / `HOMEPAGE_BUDGET_REQUESTS` 2 / `ARTICLE_BUDGET_BYTES` 550,000 / `ARTICLE_BUDGET_REQUESTS` 3 / `WARNING_BYTES` 341,550。
- `BUCKET_COUNT` 維持 `5`;manifest `schemaVersion` 維持 `2`。
- 不改 `placeNewAssignments` 的既有放置政策,也不改 `HIGH_FREQUENCY_DOCUMENTS`(維持 `5`)。
- 重排**只能**由明確的 `--rebalance` 觸發,絕不可自動發生(原始設計 `docs/superpowers/specs/2026-07-16-chiron-site-font-subsetting-design.md` 第 72 行)。
- `rebalanceAssignments` 必須**完全確定性**:相同輸入必得完全相同輸出。
- 字型產物必須**整組一起 commit**:`public/static/fonts/chiron/*.woff2`、`manifest.json`、`font-data/chiron/supplemental-assignments.json`、`font-data/chiron/core-codepoints.txt`、`font-data/chiron/assignment-epoch.txt`、`css/chiron-font.generated.css`。
- **絕不**把 `next-env.d.ts` 加進任何 commit;一律用明確的 `git add <檔案清單>`。
- 對 HarfBuzz 傳非 ASCII 一律走 `--text-file`,不走 argv。
- 分支:`fix/chiron-font-assignment-rebalance`(已建立,設計文件已提交)。

---

### Task 1: Assignment epoch 的解析與序列化

**Files:**
- Modify: `scripts/site-font-plan.mjs`
- Test: `tests/unit/site-font-plan.test.ts`

**Interfaces:**
- Consumes: 無
- Produces: `parseAssignmentEpoch(text: string): number`、`serializeAssignmentEpoch(epoch: number): string`

- [ ] **Step 1: 寫會失敗的測試**

加到 `tests/unit/site-font-plan.test.ts` 檔尾:

```ts
describe('assignment epoch', () => {
  test('解析十進位整數並容忍尾端換行', () => {
    expect(parseAssignmentEpoch('0\n')).toBe(0)
    expect(parseAssignmentEpoch('7')).toBe(7)
    expect(parseAssignmentEpoch('  12  \n')).toBe(12)
  })

  test('拒絕非整數、負數與空字串', () => {
    expect(() => parseAssignmentEpoch('')).toThrow(/Invalid assignment epoch/)
    expect(() => parseAssignmentEpoch('-1')).toThrow(/Invalid assignment epoch/)
    expect(() => parseAssignmentEpoch('1.5')).toThrow(/Invalid assignment epoch/)
    expect(() => parseAssignmentEpoch('abc')).toThrow(/Invalid assignment epoch/)
  })

  test('序列化為單行加換行,並拒絕非法輸入', () => {
    expect(serializeAssignmentEpoch(0)).toBe('0\n')
    expect(serializeAssignmentEpoch(3)).toBe('3\n')
    expect(() => serializeAssignmentEpoch(-1)).toThrow(/Invalid assignment epoch/)
    expect(() => serializeAssignmentEpoch(1.5)).toThrow(/Invalid assignment epoch/)
  })
})
```

在同檔最上方的 import 區塊加入 `parseAssignmentEpoch,` 與 `serializeAssignmentEpoch,`(維持字母序,放在 `parseAssignments,` 之前與 `serializeAssignments,` 之前)。

- [ ] **Step 2: 跑測試確認失敗**

Run: `yarn vitest run tests/unit/site-font-plan.test.ts -t "assignment epoch"`
Expected: FAIL,訊息類似 `parseAssignmentEpoch is not a function`。

- [ ] **Step 3: 實作**

在 `scripts/site-font-plan.mjs` 的 `serializeCodepoints` 之後加入:

```js
export function parseAssignmentEpoch(text) {
  const value = String(text).trim()
  if (!/^\d+$/.test(value)) throw new Error(`Invalid assignment epoch: ${JSON.stringify(text)}`)
  return Number.parseInt(value, 10)
}

export function serializeAssignmentEpoch(epoch) {
  if (!Number.isInteger(epoch) || epoch < 0) {
    throw new Error(`Invalid assignment epoch: ${epoch}`)
  }
  return `${epoch}\n`
}
```

- [ ] **Step 4: 跑測試確認通過**

Run: `yarn vitest run tests/unit/site-font-plan.test.ts -t "assignment epoch"`
Expected: PASS(3 個測試)。

- [ ] **Step 5: Commit**

```bash
git add scripts/site-font-plan.mjs tests/unit/site-font-plan.test.ts
git commit -m "feat(font): parse and serialize the Chiron assignment epoch"
```

---

### Task 2: `rebalanceAssignments()` 重排規劃器

**Files:**
- Modify: `scripts/site-font-plan.mjs`
- Test: `tests/unit/site-font-plan.test.ts`

**Interfaces:**
- Consumes: 既有 `supportedCorpus()`、`sortedCodePoints()`、`BUCKET_COUNT`(皆已存在於同檔)
- Produces:
  `rebalanceAssignments({ corpus, core, committedAssignments = new Map(), bucketCount = 5, maxBucketsPerDocument = 2 }): Map<number, number>`
  回傳的 Map 覆蓋「目前 corpus 的 non-core 字元」∪「committedAssignments 中尚未進 core 的歷史字元」。

- [ ] **Step 1: 寫會失敗的測試**

加到 `tests/unit/site-font-plan.test.ts` 檔尾:

```ts
describe('rebalanceAssignments', () => {
  // 五份文件各自獨佔一批字元,外加一批被全部文件共用的字元。
  const shared = [0x4e00, 0x4e01, 0x4e02]
  const documents = new Map<string, Set<number>>(
    Array.from({ length: 5 }, (_, index) => [
      `doc-${index}`,
      new Set([...shared, 0x5000 + index * 2, 0x5001 + index * 2]),
    ])
  )
  const corpus = corpusWith({ documents })
  const core = new Set<number>()

  test('每份文件碰到的桶數不超過上限', () => {
    const assignments = rebalanceAssignments({ corpus, core })
    for (const codePoints of documents.values()) {
      const touched = new Set([...codePoints].map((codePoint) => assignments.get(codePoint)))
      expect(touched.size).toBeLessThanOrEqual(2)
    }
  })

  test('相同輸入必得完全相同輸出', () => {
    const first = rebalanceAssignments({ corpus, core })
    const second = rebalanceAssignments({ corpus, core })
    expect(serializeAssignments(first)).toBe(serializeAssignments(second))
  })

  test('同一文件簽名的字元必定同桶', () => {
    const assignments = rebalanceAssignments({ corpus, core })
    for (const codePoint of shared) {
      expect(assignments.get(codePoint)).toBe(assignments.get(shared[0]))
    }
  })

  test('覆蓋所有 non-core 字元,且不含 core 字元', () => {
    const withCore = new Set([0x4e00])
    const assignments = rebalanceAssignments({ corpus, core: withCore })
    expect(assignments.has(0x4e00)).toBe(false)
    expect(assignments.has(0x4e01)).toBe(true)
    for (const codePoints of documents.values()) {
      for (const codePoint of codePoints) {
        if (!withCore.has(codePoint)) expect(assignments.has(codePoint)).toBe(true)
      }
    }
  })

  test('保留已離開 corpus 的歷史 assignment,不讓它們消失', () => {
    const assignments = rebalanceAssignments({
      corpus,
      core,
      committedAssignments: new Map([[0x9fff, 3]]),
    })
    expect(assignments.has(0x9fff)).toBe(true)
    expect(assignments.get(0x9fff)).toBeGreaterThanOrEqual(0)
    expect(assignments.get(0x9fff)).toBeLessThan(5)
  })

  test('bucket 數不足以滿足約束時大聲失敗,而不是回傳超標的 plan', () => {
    // 12 份文件,每份都獨佔一批字元且兩兩不共用 → 每份至少要自己的桶,5 個桶裝不下。
    const crowded = corpusWith({
      documents: new Map(
        Array.from({ length: 12 }, (_, index) => [
          `doc-${index}`,
          new Set([0x6000 + index]),
        ])
      ),
    })
    expect(() =>
      rebalanceAssignments({ corpus: crowded, core: new Set(), maxBucketsPerDocument: 0 })
    ).toThrow(/could not keep every document within/)
  })
})
```

在檔案最上方的 import 區塊加入 `rebalanceAssignments,`(放在 `placeNewAssignments,` 之後,維持字母序)。

- [ ] **Step 2: 跑測試確認失敗**

Run: `yarn vitest run tests/unit/site-font-plan.test.ts -t "rebalanceAssignments"`
Expected: FAIL,`rebalanceAssignments is not a function`。

- [ ] **Step 3: 實作**

> **實作已完成並提交於 commit `e325aa7`。** 演算法在實作中依真實資料修正過一次:
> 原先計畫的「對每個字元選桶 + 貪婪」被實測否決(會收斂到退化解),改為
> 「對每份文件選群 + sunflower 拓撲 + 爬山」。理由與結構論證見設計文件
> `docs/superpowers/specs/2026-07-25-chiron-font-assignment-rebalance-design.md`
> 的〈1. rebalanceAssignments()〉一節。實際程式碼見 `scripts/site-font-plan.mjs`。

- [ ] **Step 4: 跑測試確認通過**

Run: `yarn vitest run tests/unit/site-font-plan.test.ts`
Expected: PASS(整檔,含既有測試)。

- [ ] **Step 5: 用真實 corpus 驗證重排確實可行(先看數字,再繼續)**

```bash
node --input-type=module -e "
const { rebalanceAssignments, parseAssignments, parseCodepoints } = await import('./scripts/site-font-plan.mjs')
const { collectSiteFontCorpus } = await import('./scripts/site-font-text.mjs')
const fs = (await import('node:fs')).promises
const core = parseCodepoints(await fs.readFile('font-data/chiron/core-codepoints.txt','utf8'))
const committed = parseAssignments(await fs.readFile('font-data/chiron/supplemental-assignments.json','utf8'))
const corpus = await collectSiteFontCorpus(process.cwd())
const a = rebalanceAssignments({ corpus, core, committedAssignments: committed })
const sizes = [0,0,0,0,0]
for (const b of a.values()) sizes[b] += 1
console.log('桶 cp:', sizes.join(', '), '總', a.size)
for (const [name, cps] of corpus.documents) {
  const t = new Set([...cps].map(c => a.get(c)).filter(v => v !== undefined))
  console.log(String(t.size).padStart(2), '桶', name)
}
"
```

Expected:每份文件的桶數皆 ≤ 2(即 requests ≤ 3)。若有文件出現 3,**停下來回報**,不要繼續 —— 需要調整約束而不是放寬預算。

- [ ] **Step 6: Commit**

```bash
git add scripts/site-font-plan.mjs tests/unit/site-font-plan.test.ts
git commit -m "feat(font): add a deterministic supplemental assignment rebalancer"
```

---

### Task 3: Checker 的 epoch 閘門

**Files:**
- Modify: `scripts/check-site-font.mjs`
- Test: `tests/unit/site-font-check.test.ts`

**Interfaces:**
- Consumes: Task 1 的 `parseAssignmentEpoch`
- Produces: `resolveAssignmentHistoryMode({ epoch, baseEpoch }): 'compare' | 'skip'`;`checkSiteFont` 新增選項 `baseEpochPath`;CLI 新增 `--base-epoch=`

- [ ] **Step 1: 寫會失敗的測試**

先修改 `tests/unit/site-font-check.test.ts` 的 `fixture()`,讓它產出 epoch 檔與帶 epoch 的 manifest。

在 `fixture()` 內寫入 `supplemental-assignments.json` 的那段之後,加入:

```ts
  await fs.writeFile(path.join(root, 'font-data/chiron/assignment-epoch.txt'), '0\n')
```

並在 `const manifest = {` 的 `policy` 物件中,`axes: source.axes,` 之前加入:

```ts
      assignmentEpoch: 0,
```

再把 `resolveAssignmentHistoryMode` 加進檔案頂端從 `../../scripts/check-site-font.mjs` 的 import 清單。

然後加到 `describe('site font checks', ...)` 內:

```ts
  it('epoch 相同時比對歷史 assignment', () => {
    expect(resolveAssignmentHistoryMode({ epoch: 3, baseEpoch: 3 })).toBe('compare')
  })

  it('epoch 遞增時跳過歷史比對', () => {
    expect(resolveAssignmentHistoryMode({ epoch: 4, baseEpoch: 3 })).toBe('skip')
  })

  it('epoch 倒退時失敗', () => {
    expect(() => resolveAssignmentHistoryMode({ epoch: 2, baseEpoch: 3 })).toThrow(
      /assignment epoch regressed/i
    )
  })

  it('epoch 遞增時放行被改派的既有 assignment 並留下 warning', async () => {
    const { root } = await fixture()
    const basePath = path.join(root, 'base-assignments.json')
    await fs.writeFile(
      basePath,
      `${JSON.stringify({ schemaVersion: 2, bucketCount: 5, assignments: { '9FFF': 1 } }, null, 2)}\n`
    )
    // epoch 相同 → 歷史比對生效,少了 U+9FFF 就該失敗。
    await expect(checkSiteFont({ root, baseAssignmentsPath: basePath })).rejects.toThrow(
      /historical assignment U\+9FFF was removed/i
    )
    // epoch 遞增 → 跳過比對,並回報 warning。
    await fs.writeFile(path.join(root, 'font-data/chiron/assignment-epoch.txt'), '1\n')
    const manifestPath = path.join(root, 'public/static/fonts/chiron/manifest.json')
    const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'))
    manifest.policy.assignmentEpoch = 1
    await writeManifest(root, manifest)
    const baseEpochPath = path.join(root, 'base-epoch.txt')
    await fs.writeFile(baseEpochPath, '0\n')
    const result = await checkSiteFont({ root, baseAssignmentsPath: basePath, baseEpochPath })
    expect(result.warnings).toContain('assignment history check skipped: epoch 0 -> 1')
  })

  it('manifest 的 assignmentEpoch 與 committed epoch 不符時失敗', async () => {
    const { root, manifest } = await fixture()
    await writeManifest(root, {
      ...manifest,
      policy: { ...manifest.policy, assignmentEpoch: 9 },
    })
    await expect(checkSiteFont({ root })).rejects.toThrow(/assignment epoch/i)
  })
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `yarn vitest run tests/unit/site-font-check.test.ts`
Expected: FAIL —— `resolveAssignmentHistoryMode is not a function`,以及既有測試因 manifest 多了 `assignmentEpoch` 而尚未被驗證。

- [ ] **Step 3: 實作**

3a. 在 `scripts/check-site-font.mjs` 頂端的 import 清單(從 `./site-font-plan.mjs`)加入 `parseAssignmentEpoch,`。

3b. 在 `validateAssignmentHistory` 之後加入:

```js
export function resolveAssignmentHistoryMode({ epoch, baseEpoch }) {
  requireCondition(
    epoch >= baseEpoch,
    `assignment epoch regressed from ${baseEpoch} to ${epoch}`
  )
  return epoch === baseEpoch ? 'compare' : 'skip'
}
```

3c. 在 `validateManifestSchema` 內,`manifest.policy?.bucketCount === 5` 那條之後加入:

```js
  requireCondition(
    Number.isInteger(manifest.policy?.assignmentEpoch) && manifest.policy.assignmentEpoch >= 0,
    'manifest assignment epoch is invalid'
  )
```

3d. 在 `checkSiteFont` 的參數解構中加入 `baseEpochPath,`(放在 `baseCorePath,` 之後)。

3e. `warnings` 目前宣告在函式後段(`const coreArtifact = ...` 附近)。把該處的 `const warnings = []` 刪除,改宣告在 `validateManifestSchema(manifest)` 呼叫之後:

```js
  const warnings = []
```

3f. 在讀取 `assignments` 之後(`const assignments = parseAssignments(...)` 那行之後)加入 epoch 讀取與 manifest 一致性檢查:

```js
  const epochPath = path.join(root, 'font-data/chiron/assignment-epoch.txt')
  let epoch
  try {
    epoch = parseAssignmentEpoch(await fs.readFile(epochPath, 'utf8'))
  } catch (error) {
    throw new Error(`Chiron site font assignment epoch is missing or invalid: ${error.message}`)
  }
  requireCondition(
    manifest.policy.assignmentEpoch === epoch,
    `manifest assignment epoch ${manifest.policy.assignmentEpoch} disagrees with committed epoch ${epoch}`
  )
```

3g. 把既有的歷史比對區塊:

```js
  if (baseAssignmentsPath) {
    const baseAssignments = parseAssignments(await fs.readFile(baseAssignmentsPath, 'utf8'))
    validateAssignmentHistory({ baseAssignments, assignments, core })
  }
```

換成:

```js
  if (baseAssignmentsPath) {
    // base epoch 在 origin/main 尚未有此檔時視為 0(initial rollout)。
    const baseEpoch = baseEpochPath
      ? parseAssignmentEpoch(await fs.readFile(baseEpochPath, 'utf8'))
      : 0
    if (resolveAssignmentHistoryMode({ epoch, baseEpoch }) === 'compare') {
      const baseAssignments = parseAssignments(await fs.readFile(baseAssignmentsPath, 'utf8'))
      validateAssignmentHistory({ baseAssignments, assignments, core })
    } else {
      warnings.push(`assignment history check skipped: epoch ${baseEpoch} -> ${epoch}`)
    }
  }
```

3h. 在 `main()` 內加入 CLI 參數:

```js
  const baseEpochArgument = process.argv.find((argument) => argument.startsWith('--base-epoch='))
```

並在 `checkSiteFont({...})` 的引數中加入:

```js
    baseEpochPath: baseEpochArgument?.slice('--base-epoch='.length),
```

- [ ] **Step 4: 跑測試確認通過**

Run: `yarn vitest run tests/unit/site-font-check.test.ts`
Expected: PASS(整檔)。

- [ ] **Step 5: Commit**

```bash
git add scripts/check-site-font.mjs tests/unit/site-font-check.test.ts
git commit -m "feat(font): gate assignment history checks behind an explicit epoch"
```

---

### Task 4: `--rebalance` 旗標與產物生成

**Files:**
- Modify: `scripts/site-font-plan.mjs`(`buildFontPlan` 加 `rebalance` 選項)
- Modify: `scripts/update-site-font.mjs`
- Test: `tests/unit/site-font-plan.test.ts`、`tests/unit/site-font-generation.test.ts`

**Interfaces:**
- Consumes: Task 1 的 `serializeAssignmentEpoch`、Task 2 的 `rebalanceAssignments`
- Produces: `buildFontPlan({ ..., rebalance })`;`generateSiteFontArtifacts({ ..., assignmentEpoch, epochOutput })`

- [ ] **Step 1: 寫會失敗的測試**

加到 `tests/unit/site-font-plan.test.ts` 的 `describe('rebalanceAssignments', ...)` 內:

```ts
  test('buildFontPlan 帶 rebalance 時改用重排結果,不帶時維持既有 assignment', () => {
    const committed = new Map([
      [0x4e00, 4],
      [0x4e01, 4],
      [0x4e02, 4],
    ])
    const incremental = buildFontPlan({
      corpus,
      committedCore: new Set(),
      committedAssignments: committed,
      artifactBytes: bytes,
    })
    expect(incremental.assignments.get(0x4e00)).toBe(4)

    const rebalanced = buildFontPlan({
      corpus,
      committedCore: new Set(),
      committedAssignments: committed,
      artifactBytes: bytes,
      rebalance: true,
    })
    for (const codePoints of documents.values()) {
      const touched = new Set([...codePoints].map((codePoint) => rebalanced.assignments.get(codePoint)))
      expect(touched.size).toBeLessThanOrEqual(2)
    }
  })
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `yarn vitest run tests/unit/site-font-plan.test.ts -t "buildFontPlan 帶 rebalance"`
Expected: FAIL —— 未支援 `rebalance` 時仍走增量放置,某份文件的桶數會超過 2。

- [ ] **Step 3: 實作 `buildFontPlan` 的 rebalance 分支**

在 `scripts/site-font-plan.mjs` 的 `buildFontPlan` 參數解構中加入 `rebalance,`(放在 `rebuildCore,` 之後),並把:

```js
  const assignments = placeNewAssignments({
    corpus,
    core,
    committedAssignments: retainedAssignments,
    artifactBytes,
  })
```

換成:

```js
  const assignments = rebalance
    ? rebalanceAssignments({ corpus, core, committedAssignments: retainedAssignments })
    : placeNewAssignments({
        corpus,
        core,
        committedAssignments: retainedAssignments,
        artifactBytes,
      })
```

- [ ] **Step 4: 跑測試確認通過**

Run: `yarn vitest run tests/unit/site-font-plan.test.ts`
Expected: PASS。

- [ ] **Step 5: 讓生成器寫出 epoch 與 manifest 欄位**

在 `scripts/update-site-font.mjs`:

5a. 在頂端 import 清單加入 `rebalanceAssignments` 不需要(由 `buildFontPlan` 內部使用),但要加入 `parseAssignmentEpoch,` 與 `serializeAssignmentEpoch,`。

5b. `generateSiteFontArtifacts` 的參數解構加入 `assignmentEpoch,` 與 `epochOutput,`。

5c. manifest 的 `policy` 物件中,`axes,` 之前加入:

```js
        assignmentEpoch,
```

5d. 在 `const stagedAssignments = ...` 之後加入:

```js
    const stagedEpoch = epochOutput ? path.join(stagingRoot, 'assignment-epoch.txt') : undefined
    if (stagedEpoch) await fs.writeFile(stagedEpoch, serializeAssignmentEpoch(assignmentEpoch))
```

5e. 在 `outputs` 陣列的 `assignmentOutput` 區塊之後加入:

```js
      ...(epochOutput
        ? [{ staged: stagedEpoch, output: epochOutput, phase: 'during-epoch-write' }]
        : []),
```

5f. 在 `main()` 中,`const rebuildCore = ...` 之後加入:

```js
  const rebalance = process.argv.includes('--rebalance')
```

5g. 在 `const committedAssignments = ...` 之後加入:

```js
  const epochPath = path.join(root, 'font-data/chiron/assignment-epoch.txt')
  const committedEpoch = parseAssignmentEpoch(await fs.readFile(epochPath, 'utf8'))
  // 只有刻意重排才推進 epoch;普通更新沿用committed 值。
  const assignmentEpoch = rebalance ? committedEpoch + 1 : committedEpoch
```

5h. `buildFontPlan({...})` 的引數加入 `rebalance,`。

5i. `generateSiteFontArtifacts({...})` 的引數加入:

```js
    assignmentEpoch,
    epochOutput: rebalance ? epochPath : undefined,
```

5j. 把結尾的 log 換成:

```js
  console.log(
    `Generated ${manifest.artifacts.length} Chiron WOFF2 artifacts (${bytes} bytes, assignment epoch ${assignmentEpoch})`
  )
```

- [ ] **Step 6: 修既有生成測試**

`tests/unit/site-font-generation.test.ts` 有兩處要改。

6a. `input()` helper(約第 21 行)的 `axes:` 之後加入:

```ts
  assignmentEpoch: 0,
```

6b. `it('writes exact manifest hashes, codepoints, policy and CSS ranges')` 內的
`expect(manifest.policy).toEqual({...})`(約第 106 行),在 `axes: { wght: ... }` 之前加入:

```ts
      assignmentEpoch: 0,
```

Run: `yarn vitest run tests/unit/site-font-generation.test.ts`
Expected: PASS。

- [ ] **Step 7: 跑全部單元測試**

Run: `yarn test:unit`
Expected: PASS。

- [ ] **Step 8: Commit**

```bash
git add scripts/site-font-plan.mjs scripts/update-site-font.mjs tests/unit/site-font-plan.test.ts tests/unit/site-font-generation.test.ts
git commit -m "feat(font): add an explicit --rebalance mode to the site font updater"
```

---

### Task 5: CI 傳入 base epoch

**Files:**
- Modify: `.github/workflows/og-font-check.yml`

**Interfaces:**
- Consumes: Task 3 的 `--base-epoch=` CLI 參數
- Produces: 無(workflow 設定)

- [ ] **Step 1: 修改 workflow**

在 `chiron-base` 步驟裡,`base_core` 那段之後(`echo "core-path=" >> "$GITHUB_OUTPUT"` 的 `fi` 之後)加入:

```bash
          base_epoch="$RUNNER_TEMP/chiron-assignment-epoch.base.txt"
          if git cat-file -e origin/main:font-data/chiron/assignment-epoch.txt; then
            git show origin/main:font-data/chiron/assignment-epoch.txt > "$base_epoch"
            echo "epoch-path=$base_epoch" >> "$GITHUB_OUTPUT"
          else
            # Initial rollout: main does not have a committed epoch yet.
            echo "epoch-path=" >> "$GITHUB_OUTPUT"
          fi
```

在 `Check Chiron site font` 步驟的 `env:` 加入:

```yaml
          BASE_EPOCH: ${{ steps.chiron-base.outputs.epoch-path }}
```

在 `run:` 的 args 組裝中,`--base-core` 那段之後加入:

```bash
          if [[ -n "$BASE_EPOCH" ]]; then
            args+=("--base-epoch=$BASE_EPOCH")
          fi
```

- [ ] **Step 2: 驗證 YAML 合法**

Run: `python3 -c "import yaml,sys; yaml.safe_load(open('.github/workflows/og-font-check.yml')); print('ok')"`
Expected: `ok`

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/og-font-check.yml
git commit -m "ci(font): pass the base assignment epoch to the site font check"
```

---

### Task 6: 生成重排產物並完整驗收

**Files:**
- Create: `font-data/chiron/assignment-epoch.txt`
- Modify(產物): `font-data/chiron/supplemental-assignments.json`、`public/static/fonts/chiron/*.woff2`、`public/static/fonts/chiron/manifest.json`、`css/chiron-font.generated.css`

**Interfaces:**
- Consumes: Task 1–5 全部
- Produces: 通過預算的字型產物

- [ ] **Step 1: 建立初始 epoch 檔**

```bash
printf '0\n' > font-data/chiron/assignment-epoch.txt
```

- [ ] **Step 2: 確認 HarfBuzz / woff2 CLI 齊備**

Run: `hb-subset --version && woff2_compress 2>&1 | head -1 && woff2_decompress 2>&1 | head -1 && hb-info --version`
Expected: 四個指令都存在(缺的話依 `openwiki/operations/runbook.md` 安裝)。

> 現行 committed manifest 還沒有 `assignmentEpoch`,所以在下一步重新生成之前,
> `yarn check:site-font` 會失敗 —— 這是預期的。**絕不手改 generated manifest/CSS** 去繞過它。

- [ ] **Step 4: 執行重排並重建全部產物**

Run: `yarn update:site-font --rebalance`
Expected: 輸出 `Generated 6 Chiron WOFF2 artifacts (... bytes, assignment epoch 1)`;`font-data/chiron/assignment-epoch.txt` 變成 `1`。

- [ ] **Step 5: 跑權威判準**

Run: `yarn check:site-font`
Expected: 通過,無 budget 錯誤。若仍超標,**停下來回報** —— 依設計文件,此時要收緊 planner 約束,不得放寬預算。

- [ ] **Step 6: 記錄實際數字**

```bash
node --input-type=module -e "
const fs = (await import('node:fs')).promises
const m = JSON.parse(await fs.readFile('public/static/fonts/chiron/manifest.json','utf8'))
for (const a of m.artifacts) console.log(a.role, a.bucket ?? '', a.bytes)
console.log('epoch', m.policy.assignmentEpoch)
"
```

- [ ] **Step 7: 完整 build**

Run: `yarn build`
Expected: 完整通過。(若在沙箱內超過約 120 秒沒有輸出,依 AGENTS.md 申請沙箱外重跑,不要診斷成 Next 16 效能退化。)

- [ ] **Step 8: 全部單元測試**

Run: `yarn test:unit`
Expected: PASS。

- [ ] **Step 9: production 網路量測(原始設計的硬性要求)**

Run: `yarn test:parity tests/playwright/site-font-loading.spec.ts`
Expected: PASS —— 真實每頁 font request 數與 bytes 都在預算內。

- [ ] **Step 10: 目視確認**

啟動 production server,開 2–3 篇代表文章(含新文章 `/2026/07/25/openwiki-tame-agents-md`),確認中文沒有缺字或 fallback 字體。驗證完關閉 server。

- [ ] **Step 11: Commit(產物整組一起)**

```bash
git add font-data/chiron/assignment-epoch.txt \
        font-data/chiron/supplemental-assignments.json \
        font-data/chiron/core-codepoints.txt \
        css/chiron-font.generated.css \
        public/static/fonts/chiron
git commit -m "perf(font): rebalance Chiron supplemental buckets to fit the article budget"
```

> 注意:`git add` 必須明確列出檔案。**不要** `git add -A` —— 工作樹裡有 `next-env.d.ts` 與 OG 字型、mermaid SVG 等其他未提交變更。

---

### Task 7: 文件更新與交接文件清除

**Files:**
- Modify: `AGENTS.md`(等同 `CLAUDE.md` 的來源)
- Modify: `docs/functionality-settings-manual.zh-TW.md`
- Modify: `docs/functionality-settings-manual.md`
- Delete: `docs/handoff-site-font-budget.md`
- Modify: `openwiki/`(由 `openwiki code --update` 生成)

**Interfaces:**
- Consumes: Task 1–6 的最終行為
- Produces: 無

- [ ] **Step 1: 更新 AGENTS.md**

在既有的 Chiron 字型守則段落後補上(維持既有條列風格):

- `yarn update:site-font --rebalance` 是**刻意的一次性重排**,會改派既有 code point 並讓所有讀者的字型快取失效。只有在 `check:site-font` 因文章預算失敗、且確認不是單純 corpus 過期時才用。
- 重排必須同時遞增 `font-data/chiron/assignment-epoch.txt`(由 `--rebalance` 自動處理),CI 才會跳過 `validateAssignmentHistory`。**不要**為了讓 CI 過而單獨手動 bump epoch —— 那會讓該次 PR 的歷史保護靜默失效。
- 成本模型是「每頁碰到的桶整包下載」,所以**碰幾個桶**比用幾個字重要得多。診斷預算問題時先看每頁碰桶數,不要先看 bucket 大小。

- [ ] **Step 2: 更新兩份手冊**

兩份都要改,各兩處。

2a. `docs/functionality-settings-manual.zh-TW.md`
- 約第 331 行,`yarn update:site-font` 的段落(講 `--rebuild-core` 那條)後面補一條:
  `--rebalance` 是刻意的一次性重排,會改派既有 code point、遞增
  `font-data/chiron/assignment-epoch.txt`,並讓所有讀者的字型快取失效;只在
  `check:site-font` 因文章預算失敗時使用。
- 約第 364 行的指令表格,`yarn update:site-font` 那列的說明補上 `--rebalance`。

2b. `docs/functionality-settings-manual.md`(英文)
- 約第 377–379 行的對應段落補同一條。
- 約第 411 行的指令表格對應列補上 `--rebalance`。

- [ ] **Step 3: 刪除交接文件**

```bash
git rm docs/handoff-site-font-budget.md
```

- [ ] **Step 4: Commit 文件**

```bash
git add AGENTS.md docs/functionality-settings-manual.zh-TW.md docs/functionality-settings-manual.md
git commit -m "docs: document the Chiron assignment rebalance and epoch gate"
```

- [ ] **Step 5: 更新 OpenWiki(必須在 commit 之後)**

```bash
openwiki code --update --print
```

Expected:工作樹乾淨時才會做 noop 判斷;若自上次更新後只有 `openwiki/` 異動會自動 skip。

- [ ] **Step 6: Commit OpenWiki 產物(若有變動)**

```bash
git add openwiki
git commit -m "docs(openwiki): refresh site font pages after the assignment rebalance"
```

- [ ] **Step 7: 開 PR**

```bash
git push -u origin fix/chiron-font-assignment-rebalance
```

然後開 PR。CI 的 `check` job 應出現 warning:`assignment history check skipped: epoch 0 -> 1`。等 `ci` 與 `check` 兩個必過檢查綠燈才可合併。

---

## 附註:工作樹既有的未提交變更

這個分支上還有**先前 session 留下、與本計畫無關**的未提交變更,**不要**把它們混進上述任何 commit:

- `app/tag-data.json`、`public/static/fonts/ChironSungHK-OG-*.ttf`(`yarn update:og-font` 的產物)
- `public/mermaid/*.svg`(新文章的 mermaid 快取)
- `data/blog/2026-07-25-openwiki-tame-agents-md.md`(新文章本身)
- `next-env.d.ts`(**永遠排除**)

這些屬於「發布新文章」的變更,應該在本計畫完成後、或另一個 commit 中處理。實作到 Task 6 時,新文章檔案**必須存在於工作樹**(重排要把它納入 corpus),但不要在字型產物的 commit 裡一起 add。
