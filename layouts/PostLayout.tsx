import { ReactNode } from 'react'
import { CoreContent } from 'pliny/utils/contentlayer'
import type { Blog, Authors } from 'contentlayer/generated'
import Comments from '@/components/Comments'
import siteMetadata from '@/data/siteMetadata'
import HuxHero from '@/components/hux/HuxHero'
import HuxPager from '@/components/hux/HuxPager'
import SideCatalog from '@/components/hux/SideCatalog'

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
          headerImg={headerImg}
          headerBgCss={headerBgCss}
          headerMask={headerMask as number | string | undefined}
          iframe={(content as CoreContent<Blog> & { iframe?: string }).iframe}
        />
        <div className="post-shell">
          <div className="post-container">
            <div className="prose dark:prose-invert max-w-none">{children}</div>
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
