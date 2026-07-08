import siteMetadata from '@/data/siteMetadata'
import HuxHero from '@/components/hux/HuxHero'
import HuxPostCard from '@/components/hux/HuxPostCard'
import HuxPager from '@/components/hux/HuxPager'
import HuxSidebar from '@/components/hux/HuxSidebar'

const MAX_DISPLAY = 5

export default function Home({ posts }) {
  return (
    <>
      <HuxHero variant="home" title={siteMetadata.title} subtitle={siteMetadata.description} />
      <div className="hux-home-layout">
        <div className="postlist-container">
          <div className="hux-post-list">
            {!posts.length && 'No posts found.'}
            {posts.slice(0, MAX_DISPLAY).map((post) => (
              <HuxPostCard key={post.path} post={post} />
            ))}
          </div>
          {posts.length > MAX_DISPLAY && <HuxPager next={{ path: 'blog', title: 'Older Posts' }} />}
        </div>
        <HuxSidebar posts={posts} />
      </div>
    </>
  )
}
