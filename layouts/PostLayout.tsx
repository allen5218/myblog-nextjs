import { ReactNode } from 'react'
import { CoreContent } from 'pliny/utils/contentlayer'
import type { Blog, Authors } from 'contentlayer/generated'
import Comments from '@/components/Comments'
import siteMetadata from '@/data/siteMetadata'
import HuxHero from '@/components/hux/HuxHero'
import HuxPager from '@/components/hux/HuxPager'
import BackTop from '@/components/hux/BackTop'
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
      <BackTop />
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
            <HuxPager next={next} prev={prev} />
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
