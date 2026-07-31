import 'css/prism.css'
import 'katex/dist/katex.css'

import { components } from '@/components/MDXComponents'
import { MDXLayoutRenderer } from 'pliny/mdx-components'
import { coreContent } from 'pliny/utils/contentlayer'
import { allBlogs, allAuthors } from 'contentlayer/generated'
import type { Authors } from 'contentlayer/generated'
import PostSimple from '@/layouts/PostSimple'
import PostLayout from '@/layouts/PostLayout'
import PostBanner from '@/layouts/PostBanner'
import { Metadata } from 'next'
import siteMetadata from '@/data/siteMetadata'
import { notFound } from 'next/navigation'
import { postSocialImagePath } from '@/lib/social-card'
import {
  findReachableByLegacyPath,
  publishedPostStaticParams,
  resolvePostNeighbors,
  selectPostViews,
} from '@/lib/post-publication'
import { legacyPathFromParams, type LegacyParams } from '@/lib/legacy-url'

const defaultLayout = 'PostLayout'
const layouts = {
  PostSimple,
  PostLayout,
  PostBanner,
}

// NODE_ENV 在 runtime 固定,所以 views 只算一次。
const publicationMode = process.env.NODE_ENV === 'development' ? 'preview' : 'production'
const views = selectPostViews(allBlogs, publicationMode)

export async function generateMetadata(props: {
  params: Promise<LegacyParams>
}): Promise<Metadata | undefined> {
  const params = await props.params
  const post = findReachableByLegacyPath(views, legacyPathFromParams(params))

  if (!post) {
    return
  }

  const authorList = post?.authors || ['default']
  const authorDetails = authorList.map((author) => {
    const authorResults = allAuthors.find((p) => p.slug === author)
    return coreContent(authorResults as Authors)
  })
  const publishedAt = new Date(post.date).toISOString()
  const modifiedAt = new Date(post.lastmod || post.date).toISOString()
  const authors = authorDetails.map((author) => author.name)
  const canonicalPath = `/${post.legacyPath}/`
  const socialImage = new URL(postSocialImagePath(post.legacyPath), siteMetadata.siteUrl).href

  return {
    title: post.title,
    description: post.summary,
    alternates: {
      canonical: canonicalPath,
    },
    openGraph: {
      title: post.title,
      description: post.summary,
      siteName: siteMetadata.title,
      locale: 'zh_TW',
      type: 'article',
      publishedTime: publishedAt,
      modifiedTime: modifiedAt,
      url: canonicalPath,
      images: [socialImage],
      authors: authors.length > 0 ? authors : [siteMetadata.author],
    },
    twitter: {
      card: 'summary_large_image',
      title: post.title,
      description: post.summary,
      images: [socialImage],
    },
  }
}

export const generateStaticParams = async () => publishedPostStaticParams(views)

export default async function Page(props: { params: Promise<LegacyParams> }) {
  const params = await props.params
  const legacyPath = legacyPathFromParams(params)
  const post = findReachableByLegacyPath(views, legacyPath)

  if (!post) {
    return notFound()
  }

  const neighbors = resolvePostNeighbors(views, legacyPath)
  const prev = neighbors.prev && coreContent(neighbors.prev)
  const next = neighbors.next && coreContent(neighbors.next)
  const authorList = post?.authors || ['default']
  const authorDetails = authorList.map((author) => {
    const authorResults = allAuthors.find((p) => p.slug === author)
    return coreContent(authorResults as Authors)
  })
  const mainContent = coreContent(post)
  const jsonLd = post.structuredData
  jsonLd['author'] = authorDetails.map((author) => {
    return {
      '@type': 'Person',
      name: author.name,
    }
  })

  const Layout = layouts[post.layout || defaultLayout] || layouts[defaultLayout]

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <Layout content={mainContent} authorDetails={authorDetails} next={next} prev={prev}>
        <MDXLayoutRenderer code={post.body.code} components={components} toc={post.toc} />
      </Layout>
    </>
  )
}
