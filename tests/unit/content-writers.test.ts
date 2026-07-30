import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest'
import { createSearchIndex, createTagCount } from '../../contentlayer.config'
import { selectPostViews, type PublicationPost } from '../../lib/post-publication'

const TAG_DATA = './app/tag-data.json'
const SEARCH_INDEX = './public/search.json'

// 這些測試刻意斷言真實產物內容(spy 參數看不到 writer 內部的二次過濾),
// 但 app/tag-data.json 被 git 追蹤。先快照、跑完還原,避免測試污染工作樹。
const snapshots = new Map<string, string>()

beforeAll(() => {
  for (const file of [TAG_DATA, SEARCH_INDEX]) {
    if (existsSync(file)) snapshots.set(file, readFileSync(file, 'utf8'))
  }
})

afterAll(() => {
  // public/search.json 沒被 git 追蹤,乾淨 checkout 上跑到這裡之前根本不存在
  // (要等真的 contentlayer2 build 才會生出來),所以不會進 snapshots。若這裡只
  // 還原 snapshots 裡有的檔案,這種情況下測試產生的 fixture 會被留在工作目錄。
  // 還原成「開始前的樣子」:beforeAll 沒記錄到的檔案,代表當初不存在,測試結束
  // 就該刪掉。
  for (const file of [TAG_DATA, SEARCH_INDEX]) {
    if (snapshots.has(file)) {
      writeFileSync(file, snapshots.get(file) as string)
    } else if (existsSync(file)) {
      rmSync(file)
    }
  }
})

// 明確標註回傳型別與 PublicationPost 交叉,滿足 TypeScript 的 weak type 檢查
// (PublicationPost 全部欄位都是 optional,單靠推論會被判定為零重疊而拒絕)。
type PostFixture = PublicationPost & {
  date: string
  legacyPath: string
  path: string
  slug: string
  title: string
  tags: string[]
  body: { raw: string; code: string }
  _raw: Record<string, unknown>
  _id: string
}

const post = (overrides: Record<string, unknown> = {}): PostFixture =>
  ({
    date: '2026-07-25T00:00:00.000Z',
    legacyPath: '2026/07/25/normal',
    path: '2026/07/25/normal',
    slug: 'normal',
    title: 'Normal Post',
    tags: ['normal-tag'],
    body: { raw: '', code: '' },
    _raw: {},
    _id: 'normal',
    ...overrides,
  }) as PostFixture

const normal = post()
const hidden = post({
  legacyPath: '2026/07/24/hidden',
  path: '2026/07/24/hidden',
  slug: 'hidden',
  title: 'Hidden Sentinel Title',
  tags: ['hidden-sentinel-tag'],
  hidden: true,
  listed: false,
  _id: 'hidden',
})
const draft = post({
  legacyPath: '2026/07/23/draft',
  path: '2026/07/23/draft',
  slug: 'draft',
  title: 'Draft Sentinel Title',
  tags: ['draft-sentinel-tag'],
  draft: true,
  _id: 'draft',
})
const all = [normal, hidden, draft]

function readTagData() {
  return readFileSync(TAG_DATA, 'utf8')
}

function readSearchIndex() {
  return readFileSync(SEARCH_INDEX, 'utf8')
}

describe('derived output writers are pure', () => {
  test('傳入 listed view 時,產物不含 hidden 的 sentinel', async () => {
    const views = selectPostViews(all, 'production')
    await createTagCount(views.listed)
    createSearchIndex(views.listed)
    expect(readTagData()).not.toContain('hidden-sentinel-tag')
    expect(readSearchIndex()).not.toContain('Hidden Sentinel Title')
  })

  // 這是 view-swap mutation 唯一的鑑別點:production 下 draft 同時不在 reachable
  // 也不在 listed,兩個 view 的輸出完全相同,只有 hidden 能分辨傳錯了 view。
  test('傳入 reachable view 時,產物會含 hidden 的 sentinel', async () => {
    const views = selectPostViews(all, 'production')
    await createTagCount(views.reachable)
    createSearchIndex(views.reachable)
    expect(readTagData()).toContain('hidden-sentinel-tag')
    expect(readSearchIndex()).toContain('Hidden Sentinel Title')
  })

  // 只證明 writer 不會自己把傳入清單裡的 draft 無條件拿掉——不是「排除 isProduction
  // 判斷」的鑑別測試。Vitest 執行期 NODE_ENV 固定是 'test',若 writer 內部還原成
  // module 層 `const isProduction = process.env.NODE_ENV === 'production'` 的舊寫法,
  // `!isProduction` 恆真,這條照樣綠燈、抓不到那個 bug。真正的鑑別測試在下面,
  // 靠動態 import 在 NODE_ENV=production 下重新載入 module。
  test('preview view 含 draft 時,writer 必須照寫', async () => {
    const views = selectPostViews(all, 'preview')
    await createTagCount(views.listed)
    createSearchIndex(views.listed)
    expect(readTagData()).toContain('draft-sentinel-tag')
    expect(readSearchIndex()).toContain('Draft Sentinel Title')
  })

  // 鑑別測試:重現舊版 bug 的確切觸發條件——module 頂層讀一次 NODE_ENV 算出
  // isProduction,只有在真的是 production 時才會誤觸發內部過濾。舊版程式碼是
  // `const isProduction = process.env.NODE_ENV === 'production'`(module scope,
  // import 當下只求值一次),所以測試執行期才呼叫 vi.stubEnv 沒有用——contentlayer.config
  // 早就被上面的靜態 import 載入並求值過了,stub 環境變數不會讓那個已經算好的
  // isProduction 常數重新計算。必須先 stubEnv 把 NODE_ENV 換成 'production',
  // 再用 vi.resetModules() 清掉 module registry 的快取,然後動態 import 同一份
  // contentlayer.config,才能讓它以全新 module instance、在換過的 NODE_ENV 下
  // 重新求值那個 module 層常數。之後不論斷言成功與否都要還原環境變數並重置
  // module registry,否則會污染同一輪執行的後續測試——所以放進 try/finally。
  // 不要為了「簡化」把它改回單純的 vi.stubEnv,那樣測不到這個 bug。
  test('即使 NODE_ENV=production,writer 也不得自行排除 draft', async () => {
    try {
      vi.stubEnv('NODE_ENV', 'production')
      vi.resetModules()
      const { createTagCount: freshTagCount, createSearchIndex: freshSearchIndex } =
        await import('../../contentlayer.config')
      const views = selectPostViews(all, 'preview')
      await freshTagCount(views.listed)
      freshSearchIndex(views.listed)
      expect(readTagData()).toContain('draft-sentinel-tag')
      expect(readSearchIndex()).toContain('Draft Sentinel Title')
    } finally {
      vi.unstubAllEnvs()
      vi.resetModules()
    }
  })
})
