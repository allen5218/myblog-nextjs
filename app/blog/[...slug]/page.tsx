import { allBlogs } from 'contentlayer/generated'
import { notFound, permanentRedirect } from 'next/navigation'
import { findReachableByAlias, selectPostViews } from '@/lib/post-publication'

const publicationMode = process.env.NODE_ENV === 'development' ? 'preview' : 'production'
const views = selectPostViews(allBlogs, publicationMode)

export const generateStaticParams = async () => []

export default async function Page(props: { params: Promise<{ slug: string[] }> }) {
  const params = await props.params
  const alias = decodeURI(params.slug.join('/'))
  const post = findReachableByAlias(views, alias)

  if (!post) {
    return notFound()
  }

  permanentRedirect(`/${post.legacyPath}/`)
}
