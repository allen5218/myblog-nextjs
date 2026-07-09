'use client'

import Giscus from '@giscus/react'
import { useTheme } from 'next-themes'
import { useEffect, useState } from 'react'
import siteMetadata from '@/data/siteMetadata'

// 直接使用 @giscus/react,取代 Pliny 的包裝:
// 1) 立即載入 —— 移除原本的「Load Comments」延遲按鈕,並用 loading="eager"(Pliny 硬編 lazy)。
// 2) 主題即時跟隨 —— @giscus/react 會在 theme prop 改變時 postMessage 通知 iframe 切換,
//    修正原本「載入時深色、切成淺色不同步」的問題。
// 3) mounted gate —— 掛載後才渲染,確保首屏就用正確的深/淺色系載入 iframe。
export default function Comments({ slug }: { slug: string }) {
  const [mounted, setMounted] = useState(false)
  const { resolvedTheme } = useTheme()

  useEffect(() => setMounted(true), [])

  // provider 是 CommentsConfig 的判別欄位,先比對再取 giscusConfig 才能被 TS 收斂為 GiscusConfig
  const comments = siteMetadata.comments
  if (comments?.provider !== 'giscus') {
    return null
  }
  if (!mounted) {
    return null
  }

  const giscus = comments.giscusConfig
  const theme = giscus.themeURL || (resolvedTheme === 'dark' ? giscus.darkTheme : giscus.theme)

  return (
    <Giscus
      id="comments-container"
      repo={giscus.repo as `${string}/${string}`}
      repoId={giscus.repositoryId}
      category={giscus.category}
      categoryId={giscus.categoryId}
      mapping={giscus.mapping}
      term={slug}
      reactionsEnabled={giscus.reactions}
      emitMetadata={giscus.metadata}
      inputPosition="top"
      theme={theme}
      lang={giscus.lang}
      loading="eager"
    />
  )
}
