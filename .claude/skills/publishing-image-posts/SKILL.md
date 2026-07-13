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

文風（使用者明確要求過）：
- **不用「——」破折號**，改逗號、冒號或斷句
- 避免 AI 腔的浮誇修飾（「漂亮的」「教科書級」「史詩級」「不可思議」）與箭頭鏈（A → B → C）
- 粗體節制，只留每段真正的關鍵句
- 內文 Markdown `![]()` 渲染成普通 `<img>`；圖說用斜體行放在圖片下方，含授權署名

## 驗證與提交

1. `yarn build` 若因 `Missing OG glyphs` 失敗 → `yarn update:og-font` 再 build，
   **產出的兩個 OG 字型檔要一起 commit**（`app/tag-data.json` 也會被 build 更新）
2. `yarn lint`、`yarn test:unit`
3. production serve 目測（不要用 dev server 驗互動，見 AGENTS.md）：確認 hero 圖、
   內文圖、圖說、目錄都正常
4. Git 流程照 AGENTS.md：fetch 確認不落後 → 分支 → PR → 等必過檢查 `ci`、`check`
   綠燈 → 合併（squash，Vercel 自動部署 main）

## 常見錯誤

| 症狀 | 原因 |
|------|------|
| 文章圖片全部不顯示（production） | 圖床網域不在 CSP `img-src`；圖片必須先上圖床，別直連外部網站 |
| 圖片 404 但 repo 裡有檔案 | Pages 還沒部署完（等 1–2 分鐘）或檔名 hash 對不上 |
| build 炸 `Missing OG glyphs` | 新標題含字體子集沒有的字 → `yarn update:og-font` |
| push 圖床被拒 403 | 用錯帳號；repo 在 `allen57218` 名下，確認 `allen5218` 協作者身分還在 |
| serve 看到舊內容 | `next start` 掛著舊 build，重啟 serve |
