import { allBlogs } from 'contentlayer/generated'
import { notFound, permanentRedirect } from 'next/navigation'

export const generateStaticParams = async () => []

export default async function Page(props: { params: Promise<{ slug: string[] }> }) {
  const params = await props.params
  const slug = decodeURI(params.slug.join('/'))
  const post = allBlogs.find((p) => p.slug === slug || p.path === slug || p.legacyPath === slug)

  if (!post) {
    return notFound()
  }

  permanentRedirect(`/${post.legacyPath}/`)
}
