---
name: publishing-image-posts
description: Use when 要為部落格撰寫帶圖片的新文章、需要把圖片上傳到 img.allenspace.de 圖床、或文章圖片出現 404 / CSP 擋圖 / OG font check 失敗時
---

# 撰寫帶圖片的部落格文章（含圖床上傳）

## 總覽

文章圖片一律走自有圖床 `img.allenspace.de`（CSP `img-src` 只允許它）。
圖床本體是 GitHub repo **`allen57218/picx-images-hosting`**（注意：不是部落格的
`allen5218` 帳號；`allen5218` 已是協作者，可直接 push）。push 到 `master` 會觸發
GitHub Pages workflow 自動部署，1–2 分鐘後 `https://img.allenspace.de/<檔名>` 生效。

## 鐵則：每張圖都要目視檢查

**下載後必須用 Read 工具實際看過每一張圖才能使用。** 只憑檔名或搜尋結果標題選圖
出過事：Commons 上標題為「Vault Boy」的檔案實際是裸體彩繪照片，差點進了正式文章。
檔名、wiki 標題、縮圖描述都不可信，看過才算數。

## 圖片來源與授權

| 來源 | 用途 | 注意 |
|------|------|------|
| Wikimedia Commons | 照片、實物圖 | 記下授權與作者，寫進圖說（CC BY 要署名） |
| Fandom wiki | 遊戲截圖 | 圖說標注 © 原公司 + 評論用途；URL 加 `/revision/latest/scale-to-width-down/1280` 取縮圖 |

Commons / Fandom 都是 MediaWiki，用 API 搜檔案再取直連與授權：

```bash
# 搜尋（srnamespace=6 = File namespace）
curl -s "https://commons.wikimedia.org/w/api.php?action=query&list=search&srnamespace=6&srlimit=8&format=json&srsearch=關鍵字"
# 取直連 URL + 授權
curl -s "https://commons.wikimedia.org/w/api.php?action=query&prop=imageinfo&iiprop=url|extmetadata&iiurlwidth=1280&format=json&titles=File:檔名.jpg"
```

## 上傳流程

1. clone `https://github.com/allen57218/picx-images-hosting`（淺層即可）
2. 轉 webp、模仿 PicX 命名 `描述名.隨機10碼.webp`：
   ```bash
   h=$(python3 -c "import random,string;print(''.join(random.choices(string.ascii_lowercase+string.digits,k=10)))")
   cwebp -quiet -q 82 input.jpg -o "描述名.$h.webp"
   ```
3. 放進 repo 根目錄，commit + push `master`
4. 用 curl 輪詢 `https://img.allenspace.de/<檔名>` 直到 200 再寫進文章

**不要用 PicX 網頁介面上傳同一批圖**：它會重新產生 hash 檔名，跟文章裡已寫的 URL
對不上。

**刪圖注意**：從 repo 刪除後源站才 404，但 (a) Cloudflare 邊緣快取要等 TTL 過期或
手動 purge；(b) 檔案仍留在 git 歷史，要徹底清除需改寫歷史。

## 文章慣例

Frontmatter 參考既有文章（`data/blog/`）：`layout: post`、`title`、`subtitle`、
`date`、`author`、`headerImg`（圖床完整 URL，headerImg 是 CSS 背景圖，受 CSP 管、
不走 next/image）、`headerMask: 0.6`、`catalog: true`、`tags`（中英混用皆可）。

文風（使用者明確要求過，2026-07-14 大改一輪後的定案）：
- **不用「——」破折號**，改逗號、冒號或斷句
- 避免 AI 腔的浮誇修飾（「漂亮的」「教科書級」「史詩級」「不可思議」）與箭頭鏈（A → B → C）
- 粗體節制，只留每段真正的關鍵句
- **留白重於解釋**：觀點寫出來就停，不要接著解釋它（「之所以…是因為…」「這裡高明的
  地方在於…」「才有那麼重的份量」都被退過稿）。情緒不點名（「答案很溫柔」這種
  標籤句直接砍，讓畫面自己扛）；提煉過的短句（文眼）單獨成段，效果強過粗體
- 標題/副標不預告論點：論點在內文帶出，標題用勾人的問句或有餘韻的句子，
  副標可用劇中台詞
- 心得類文章開頭先給作品背景（是什麼、誰做的、什麼日常），不要一上來就切主題
- **CJK 粗體陷阱**：`**…。**` 後面直接接中文字會無法閉合、渲染成字面星號
  （CommonMark flanking 規則），句號要放在 `**` 外面：`**…**。`
- 人名、作品名用台灣官方譯名（查巴哈姆特 ACG 資料庫），版權方名稱保留原文
- 圖說：斜體行放圖片下方，格式「可選的場景描述句。Photo Credit：來源」，
  **授權細節（© 版權方、CC 條款、評論用途聲明）不放圖說**，集中在文末 `---`
  之後的一段斜體「圖片來源：…」裡（CC 圖的攝影者與條款務必列齊）
- 內文 Markdown `![]()` 渲染成普通 `<img>` 滿版；文章其實是 MDX 管線
  （contentlayer `contentType: 'mdx'`），直式大圖可用 JSX 縮小置中：
  `<img src="…" alt="…" width="420" style={{display: 'block', margin: '0 auto'}} />`

### GitHub 風格提示框

文章支援 `remark-github-blockquote-alert`。要讓需要掃讀辨識的補充資訊更醒目時,使用
GitHub Alert 語法;第一行的類型必須大寫,內文每一行都要保留 `>`。

依內容選擇類型:

| 類型 | 使用時機 |
|------|----------|
| `NOTE` | 背景、定義、容易略過但值得知道的補充 |
| `TIP` | 讓操作更快、更容易的技巧 |
| `IMPORTANT` | 讀者完成目標前必須知道的關鍵資訊 |
| `WARNING` | 不立刻注意就可能出錯的事項 |
| `CAUTION` | 可能造成資料遺失、安全問題或不可逆後果的操作 |

```markdown
> [!NOTE]
> 這是即使快速瀏覽也值得知道的補充資訊。

> [!TIP]
> 先把圖片轉成 WebP,可減少下載大小。

> [!IMPORTANT]
> 圖片 URL 必須等圖床回應 200 後才能寫進文章。

> [!WARNING]
> 外部圖片網域若未加入 CSP,production 會擋圖。

> [!CAUTION]
> 從圖床 repo 刪圖後,引用該 URL 的既有文章會永久失去圖片。
```

多段內容要在空白引用行保留 `>`:

```markdown
> [!NOTE]
> 第一段補充。
>
> 第二段仍屬於同一個提示框。
```

不要用 alert 取代一般段落,也不要為了顏色連續堆疊提示框。同一段只選一種最符合
後果嚴重度的類型。

## 驗證與提交

1. `yarn build` 若因 `Missing OG glyphs` 失敗 → `yarn update:og-font` 再 build，
   **產出的兩個 OG 字型檔要一起 commit**（`app/tag-data.json` 也會被 build 更新）
2. `yarn lint`、`yarn test:unit`
3. production serve 目測（不要用 dev server 驗互動，見 AGENTS.md）：確認 hero 圖、
   內文圖、圖說、目錄都正常
4. **審稿閘門：文章草稿必須先給使用者過目、明確同意後才能 push 分支與開 PR。**
   驗證通過後停在本地 commit，把文章內容（或 production serve 預覽）給使用者看，
   等回覆再走下一步；不要自行開 PR，更不要自行合併（2026-07-13 踩過：直接開了
   PR 被使用者撤回）。
5. Git 流程照 AGENTS.md：fetch 確認不落後 → 分支 → PR → 等必過檢查 `ci`、`check`
   綠燈 → 合併（squash，Vercel 自動部署 main）

## 常見錯誤

| 症狀 | 原因 |
|------|------|
| 文章圖片全部不顯示（production） | 圖床網域不在 CSP `img-src`；圖片必須先上圖床，別直連外部網站 |
| 圖片 404 但 repo 裡有檔案 | Pages 還沒部署完（等 1–2 分鐘）或檔名 hash 對不上 |
| build 炸 `Missing OG glyphs` | 新標題含字體子集沒有的字 → `yarn update:og-font` |
| push 圖床被拒 403 | 用錯帳號；repo 在 `allen57218` 名下，確認 `allen5218` 協作者身分還在 |
| serve 看到舊內容 | `next start` 掛著舊 build，重啟 serve |
