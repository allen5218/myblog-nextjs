import { ReactNode } from 'react'
import { CoreContent } from 'pliny/utils/contentlayer'
import type { Blog, Authors } from 'contentlayer/generated'
import Comments from '@/components/Comments'
import siteMetadata from '@/data/siteMetadata'
import HuxHero from '@/components/hux/HuxHero'
import HuxPager from '@/components/hux/HuxPager'
import PostSeriesLink from '@/components/hux/PostSeriesLink'
import SideCatalog from '@/components/hux/SideCatalog'
import ArticleToc from '@/components/hux/ArticleToc'

const postDateTemplate: Intl.DateTimeFormatOptions = {
  weekday: 'long',
  year: 'numeric',
  month: 'long',
  day: 'numeric',
}

interface LayoutProps {
  content: CoreContent<Blog>
  authorDetails: CoreContent<Authors>[]
  next?: { path: string; title: string }
  prev?: { path: string; title: string }
  children: ReactNode
}

export default function PostLayout({ content, authorDetails, next, prev, children }: LayoutProps) {
  const {
    path,
    date,
    update,
    title,
    subtitle,
    summary,
    author,
    tags,
    headerImg,
    headerBgCss,
    headerMask,
    catalog,
    toc,
  } = content
  const authorName = author || authorDetails[0]?.name || siteMetadata.author
  // headerStyle 的 contentlayer schema 欄位要到後續 task 才加,這時 Blog 型別上還沒有
  // 這個屬性,沿用 iframe 既有的暫時 cast 寫法取值。
  const headerStyle = (content as CoreContent<Blog> & { headerStyle?: 'text' }).headerStyle

  return (
    <>
      <article>
        <HuxHero
          title={title}
          subtitle={subtitle || summary}
          author={authorName}
          date={date}
          update={update}
          tags={tags}
          seriesPost={content}
          headerImg={headerImg}
          headerBgCss={headerBgCss}
          headerMask={headerMask as number | string | undefined}
          iframe={(content as CoreContent<Blog> & { iframe?: string }).iframe}
          headerStyle={headerStyle}
        />
        <div className="post-shell">
          <div className="post-container">
            <ArticleToc toc={toc} enabled={catalog !== false} />
            <div className="prose dark:prose-invert max-w-none">{children}</div>
            <PostSeriesLink placement="bottom" post={content} />
            {/* 文章間的上一篇/下一篇。HuxPager 收完整 href,這裡負責把 content path 轉成網址。 */}
            <HuxPager
              next={next && { href: `/${next.path}`, title: next.title }}
              prev={prev && { href: `/${prev.path}`, title: prev.title }}
            />
            {siteMetadata.comments && (
              <div className="comments hux-comments" id="comment">
                <Comments slug={`/${path}/`} />
              </div>
            )}
          </div>
          <SideCatalog toc={toc} enabled={catalog !== false} />
        </div>
      </article>
    </>
  )
}
