import Image from '@/components/Image'
import Link from '@/components/Link'
import HuxSocial from '@/components/hux/HuxSocial'
import siteMetadata from '@/data/siteMetadata'

type SidebarPost = {
  tags?: string[]
}

type HuxSidebarProps = {
  posts: SidebarPost[]
}

const friends = [{ title: 'Hux Blog', href: 'http://huangxuan.me/' }]

export default function HuxSidebar({ posts }: HuxSidebarProps) {
  const featuredTags = Object.entries(
    posts.reduce<Record<string, number>>((counts, post) => {
      post.tags?.forEach((tag) => {
        counts[tag] = (counts[tag] || 0) + 1
      })
      return counts
    }, {})
  )
    .filter(([, count]) => count > 1)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([name, count]) => ({ name, count }))

  return (
    <aside className="sidebar-container" aria-label="Homepage sidebar">
      {!!featuredTags.length && (
        <section>
          <h5>
            <Link href="/archive/">FEATURED TAGS</Link>
          </h5>
          <div className="tags">
            {featuredTags.map((tag) => (
              <Link
                data-sort={String(posts.length - tag.count).padStart(4, '0')}
                href={`/archive/?tag=${encodeURIComponent(tag.name)}`}
                key={tag.name}
                rel={String(tag.count)}
                title={tag.name}
              >
                {tag.name}
              </Link>
            ))}
          </div>
        </section>
      )}

      <section className="short-about-section">
        <hr />
        <h5>
          <Link href="/about/">ABOUT ME</Link>
        </h5>
        <div className="short-about">
          <Image
            alt={`${siteMetadata.title} 作者頭像`}
            className="short-about-avatar"
            height={160}
            src="https://img.allenspace.de/20250820060315_ada51ln5j8.8ado5b4i6s.webp"
            width={160}
          />
          <p>
            分享技術和生活
            <br />
            聯絡信箱: <Link href={`mailto:${siteMetadata.email}`}>{siteMetadata.email}</Link>
          </p>
          <HuxSocial className="sidebar-social" />
        </div>
      </section>

      {!!friends.length && (
        <section>
          <hr />
          <h5>FRIENDS</h5>
          <ul className="list-inline">
            {friends.map((friend) => (
              <li key={friend.href}>
                <Link href={friend.href}>{friend.title}</Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </aside>
  )
}
