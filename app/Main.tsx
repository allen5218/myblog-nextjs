import siteMetadata from '@/data/siteMetadata'
import HuxHero from '@/components/hux/HuxHero'
import HuxPostCard from '@/components/hux/HuxPostCard'
import HuxPager from '@/components/hux/HuxPager'

const MAX_DISPLAY = 5

export default function Home({ posts }) {
  return (
    <>
      <HuxHero variant="home" title={siteMetadata.title} subtitle={siteMetadata.description} />
      <div className="hux-home-list">
        <div className="hux-post-list">
          {!posts.length && 'No posts found.'}
          {posts.slice(0, MAX_DISPLAY).map((post) => (
            <HuxPostCard key={post.path} post={post} />
          ))}
        </div>
      </div>
      {posts.length > MAX_DISPLAY && (
        <div className="hux-home-list">
          <HuxPager next={{ path: 'blog', title: 'Older Posts' }} />
        </div>
      )}
    </>
  )
}
