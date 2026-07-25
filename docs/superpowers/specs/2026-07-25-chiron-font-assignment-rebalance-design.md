# Chiron supplemental assignment 一次性重排設計

> 日期:2026-07-25。狀態:待實作。
> 前置文件:`docs/superpowers/specs/2026-07-16-chiron-site-font-subsetting-design.md`(以下稱「原始設計」)。
> 本文件取代交接文件 `docs/handoff-site-font-budget.md`(實作完成後刪除該檔)。

## 背景

新文章 `data/blog/2026-07-25-openwiki-tame-agents-md.md` 讓 `yarn build` 的 `check:site-font`
失敗。交接文件把根因記為「bucket 4 過胖」,**該診斷不完整**。以目前 committed 產物實測
(corpus 用 `collectSiteFontCorpus`,即預算檢查實際使用的那一份):

```
core 311,360 B / 798 cp
桶 B: [b0 70,280] [b1 65,404] [b2 57,224] [b3 63,444] [b4 175,376]
18 份文件中 10 份超標(上限 550,000 B / 3 req)
```

## 根因

**這是 assignment 分配品質的問題,不是預算或用字量的問題。**

三項實測證據:

1. **預算餘裕充足。** 每篇文章可負擔的 supplemental 上限約 467 cp
   (`(550,000 − 311,360) / 510.9`),而實際用量最大的文章只有 290 cp。沒有任何一篇文章
   的用字量本身超過預算 —— 理想的分桶必然存在。

2. **成本由「碰到幾個桶」主導,與用字量幾乎無關。** `check-site-font.mjs` 的成本模型是
   `bytes = core + Σ(碰到的桶)`、`requests = 1 + 碰到的桶數`,整包下載。所以
   `hidden/2025-08-16-blockquote-test.md` 只用 9 個 supplemental 字元,成本卻和用了
   223 個字元的文章一樣是 552,140 B。

3. **新文章多付 4 個桶,只為了 33 個字。** 這 33 個字全部是 HEAD 就存在的舊 assignment,
   沒有一個是本次新增:

   | 桶 | 字元數 | 字元 |
   |---|---|---|
   | b0 | 7 | 價 剩 叫 律 脆 餘 黑 |
   | b1 | 4 | 剪 擺 蓋 麻 |
   | b2 | 10 | 吐 擋 斂 眼 紀 耗 討 譯 迭 順 |
   | b3 | 12 | 冗 巨 循 急 浪 煩 職 責 踩 遵 騰 |

   33 個常用字 = 256,352 bytes + 4 個 request。

劣化機制:`placeNewAssignments` 的 `max-cooccurrence` 是**逐字貪婪、且永不回頭**。長期
累積下,b4 收了 365 cp(其他桶 109–130),並被全部 16 篇文章碰到,形同「第二核心」。

## 目標

- `yarn build` 綠燈:18 份文件全部 ≤ 550,000 B / 3 req、首頁 ≤ 350,000 B / 2 req、
  core 不超過 341,550 警告線。
- 重排後留下明確餘裕,讓後續文章不會立刻再撞線。
- 把「刻意重排」變成**顯式、進版控、可審計、未來可重複使用**的機制。

## 非目標

- 不改 `ARTICLE_BUDGET_BYTES` / `ARTICLE_BUDGET_REQUESTS` / `HOMEPAGE_BUDGET_*`。護欄維持原值。
- 不改 bucket 數(維持 5)。
- 不改 `placeNewAssignments` 的線上放置政策(見「已知未處理問題」)。
- 不改 `HIGH_FREQUENCY_DOCUMENTS`(見「已知未處理問題」)。
- 不改寫新文章的用字。

## 與原始設計的關係

原始設計第 72 行已預期本情境並規定流程:

> 若日後實測五個 bucket 的請求或 bytes 不理想,調整 bucket 數或 placement policy 屬架構
> 版本變更,需新 manifest schema、production 網路量測和明確 cache-bust rollout,
> **不可由更新腳本自動重平衡**。

本設計遵守它:

- **不自動重平衡** —— 重排只在人類明確傳入 `--rebalance` 時發生,與 `--rebuild-core` 同級。
- **production 網路量測** —— 沿用既有的 `tests/playwright/site-font-loading.spec.ts`,
  它已經在 production build 上量測每頁實際 font request 數與 bytes。
- **cache-bust rollout** —— woff2 檔名是內容 hash,重排必然產生新檔名,快取自然失效。
- **明確的架構版本記錄** —— 以 `manifest.policy.assignmentEpoch` 記錄重排世代。

**刻意不 bump `schemaVersion` 2 → 3。** 本次沒有改變 bucket 數、assignment 檔案 schema
形狀、或新字元放置政策,manifest 只是**加一個欄位**。用 epoch 表達「第 N 次重排」比
bump schema version 更精確,也避免 checker 的 v2 驗證路徑整條分岔。

## 架構

四個元件。

### 1. `rebalanceAssignments()` — 新增於 `scripts/site-font-plan.mjs`

```
rebalanceAssignments({ corpus, core, bucketCount = 5, maxBucketsPerDocument = 2 })
  -> Map<codePoint, bucket>
```

不讀寫檔案、不呼叫子程序,純函式,可單元測試。

**結構觀察(決定了演算法形狀):** 16 篇文章中幾乎每一對都共用至少一個 supplemental
字元(實測只有 20 對完全不共用)。因此各文件的「桶集合」必須**兩兩相交**。在 2-子集族中
兩兩相交只有兩種形狀:全部含同一個共同桶(sunflower),或三個桶構成的三角。本設計採
sunflower。

**演算法(必須完全確定性):**

1. **決策變數是文件,不是字元。** bucket 0 保留為共用桶;其餘 4 個桶各專屬一群文件。
   每份文件被指派到一群。字元只出現在同一群的文件裡 → 進該群的桶;跨群或已離開 corpus
   → 進共用桶。**「每份文件 ≤2 桶」由結構自動保證**,不需要額外約束檢查。
2. **種子化重啟 + 爬山。** 以常數 seed 的 LCG 產生固定次數的重啟(`REBALANCE_RESTARTS`);
   restart 0 用確定性的輪流分群當基準。每次重啟以固定掃描順序做爬山,只在**嚴格改善**時
   接受移動。
3. **目標是最小化最壞單頁成本**(以 cp 數代理 bytes)。碰桶數是硬約束、不是目標 ——
   把它當目標會得到「全部塞進同一個桶」這種形式最佳、實質最差的解。
4. **選優。** 跨重啟取最小 worst;嚴格小於才取代,平手保留較早的 restart,同輸入必得同輸出。
5. **失敗要大聲。** 最終驗證每份文件實際碰到的桶數,超過 `maxBucketsPerDocument` 就
   `throw` —— 不得靜默輸出一個超標的 plan。

> **為什麼不用「對每個字元選桶」的表述:** 實測過,那是 196 維且約束隱晦,貪婪會收斂到
> 退化解 —— 要嘛全部塞一桶(每頁 1 request 但要下載整套字型),要嘛把共用字元集中到
> 最壞單頁 616 cp。改用文件分群後降為 16 維,實測最壞單頁 447 cp。

**Planner 優化的是 proxy,不是真實 bytes。** Planner 拿不到還沒建出來的 woff2 大小,
所以用 cp 數當代理。真實 bytes 由 `check:site-font` 在重建後認定。工作流程因此是
**重排 → 重建 → 檢查**;若檢查仍失敗,要調的是 planner 的約束(收緊
`maxBucketsPerDocument`,或引入 bytes/cp 常數),不是放寬預算。

### 2. `--rebalance` 旗標 — `scripts/update-site-font.mjs`

- 帶 `--rebalance` 時,以 `rebalanceAssignments` 的結果取代 `buildFontPlan` 的增量 assignment,
  其餘流程(subset、woff2、manifest、CSS、交易式換檔)完全不變。
- 與 `--rebuild-core` 正交,可同時使用。本次 rollout **只用 `--rebalance`**,core 維持現狀。
- 必須同時把 `font-data/chiron/assignment-epoch.txt` 遞增 1 並寫回。

### 3. Assignment epoch — 新增 `font-data/chiron/assignment-epoch.txt`

單一非負整數加換行。用途:讓 CI 的歷史檢查知道「這次是刻意重排」。

`checkSiteFont` 新增選項 `baseEpochPath`,CLI 新增 `--base-epoch=`:

- 現行 epoch 一律從 `font-data/chiron/assignment-epoch.txt` 讀;檔案缺失或非整數 → 失敗。
- base epoch 在 `origin/main` 上不存在時視為 `0`(initial rollout,與既有
  `--base-assignments` 的處理一致)。
- `current < base` → **失敗**(epoch 必須單調不減)。
- `current === base` → 照常執行 `validateAssignmentHistory`。
- `current > base` → **跳過** `validateAssignmentHistory`,並推入一則 warning
  (`assignment history check skipped: epoch <base> -> <current>`),讓它出現在 CI log。
- `validateCoreHistory` **不受 epoch 影響**。core 的單調政策不變,重排不會從 core 移除字元。

`.github/workflows/og-font-check.yml` 依既有 `--base-assignments` / `--base-core` 的同一
模式,從 `origin/main` 取出 base epoch 並傳入。

> 已知取捨:單獨 bump epoch 而不重排,會讓那一次 PR 的歷史檢查靜默失效。緩解是
> warning 會出現在 CI log,且 epoch 檔在 PR diff 中只有一行、極易審閱。單人 repo 下
> 這個代價相稱。

### 4. Manifest 記錄

`generateSiteFontArtifacts` 在 `manifest.policy` 加 `assignmentEpoch: <整數>`。
`validateManifestSchema` 驗證它是非負整數,且與 `assignment-epoch.txt` 相符 ——
和既有的 `assignmentSha256` 一樣,確保產物與 assignment 資料同步。

## 檔案邊界

**新增**

- `font-data/chiron/assignment-epoch.txt`

**修改**

- `scripts/site-font-plan.mjs` — 加 `rebalanceAssignments`
- `scripts/update-site-font.mjs` — 加 `--rebalance`、epoch 遞增、manifest 欄位
- `scripts/check-site-font.mjs` — 加 epoch 讀取/比對、manifest 驗證、CLI 參數
- `.github/workflows/og-font-check.yml` — 傳 `--base-epoch`
- `tests/unit/site-font-plan.test.ts`、`tests/unit/site-font-check.test.ts`
- 產物整組:`public/static/fonts/chiron/*.woff2`、`manifest.json`、
  `font-data/chiron/supplemental-assignments.json`、`css/chiron-font.generated.css`
- `AGENTS.md`、`docs/functionality-settings-manual.zh-TW.md`、
  `docs/functionality-settings-manual.md`、`openwiki/`

**刪除**

- `docs/handoff-site-font-budget.md`

## 失敗處理

- `rebalanceAssignments` 找不到滿足約束的解 → throw,訊息含最佳候選的超標文件清單。
- epoch 檔缺失、非整數、或倒退 → checker 失敗(fail loud,與 repo 既有風格一致)。
- 重建後 `check:site-font` 仍超標 → 不放寬預算;收緊 planner 約束後重跑。

## 測試與驗收

**先寫會失敗的回歸測試,再實作。**

### Unit(`tests/unit/site-font-plan.test.ts`)

- 相同輸入跑兩次得到完全相同的 assignment(確定性)。
- 輸出覆蓋且只覆蓋所有 non-core supported code point;不含任何 core 字元。
- 每份文件碰到的桶數 ≤ `maxBucketsPerDocument`。
- 同一文件簽名的字元必定同桶。
- 建構一個必然無解的 fixture,確認它 throw 而不是回傳超標 plan。

### Unit(`tests/unit/site-font-check.test.ts`)

- `current === base` → 跑歷史檢查(改動既有 bucket 會失敗)。
- `current > base` → 跳過歷史檢查並產生 warning。
- `current < base` → 失敗。
- base epoch 檔不存在 → 視為 0。
- manifest `assignmentEpoch` 與 epoch 檔不符 → 失敗。

### 整合驗收

1. `yarn update:site-font --rebalance` 產出整組產物。
2. `yarn check:site-font` 通過(18 份文件全部在預算內)—— **這是權威判準**。
3. `yarn build` 完整通過。
4. `yarn test:unit` 全綠。
5. production build 跑 `tests/playwright/site-font-loading.spec.ts`,確認真實每頁
   font request 數與 bytes 符合預算(滿足原始設計要求的 production 網路量測)。
6. 目視確認幾篇代表文章的中文字沒有缺字或 fallback。

## Rollout

單一 PR,產物整組一起 commit(AGENTS.md 明令不得只 commit 一部分)。

1. 先實作 planner + checker + 測試(不含產物),確認測試會失敗再讓它們通過。
2. 跑 `yarn update:site-font --rebalance` 生成產物與 epoch=1。
3. 跑完整驗收清單。
4. 更新文件,刪除 handoff。
5. 開 PR;CI 的 `check` job 應顯示歷史檢查被 epoch 跳過的 warning。

## Rollback

`git revert` 整個 PR。woff2 是內容定址,舊檔名會隨 revert 一起回來;epoch 回到 0 後
歷史檢查自動恢復比對。不得在 production 手改 generated CSS 或 manifest。

## 已否決替代方案

- **調高 `ARTICLE_BUDGET_*` 到 750,000 / 6** —— 新文章需要 6 req / 743,088 B 才過。等於
  廢掉效能護欄,且結構問題原封不動,下一篇長文照樣撞牆。
- **降 `HIGH_FREQUENCY_DOCUMENTS` 到 4** —— 實測讓 65 個字進 core,core 來到約 344,570 B
  超過 341,550 警告線,而且吃掉文章的 leftover 讓雙桶文章更緊。單獨用救不了任何一篇。
- **改寫新文章避開那 33 個字** —— 那是常用字(眼/紀/討/譯/順/循/職/訓/責…),自然行文
  幾乎不可能避開,而且只治標。
- **增加 bucket 數(5 → 8)** —— 不會減少「每頁碰幾個桶」,反而傾向增加;且違反原始設計
  對 bucket 數變更的規定。
- **重跑既有的 `migrateAssignmentsV2`** —— 實測反而更差(超標 14/16),它的 dominance-biased
  掃描把共用字群集中推向單一桶。

## 已知未處理問題(刻意留下)

1. **`placeNewAssignments` 的逐字貪婪仍會長期劣化。** 重排後餘裕大(290 vs 467 cp),
   劣化會很慢。把 `--rebalance` 當成「`check:site-font` 失敗時就跑」的常備維護操作,
   比預先設計一套更聰明的線上放置策略簡單得多。
2. **`HIGH_FREQUENCY_DOCUMENTS = 5` 目前是死規則。** 全站沒有任何 supplemental 字元出現在
   ≥5 份文件(分佈停在 4 份),所以 `--rebuild-core` 只會從 homepage + fixedSeed 長 core。
   文章數變多後它會自然開始生效,現在不動。
