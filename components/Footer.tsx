import Link from './Link'
import siteMetadata from '@/data/siteMetadata'
import SocialIcon from '@/components/social-icons'
import BackTop from './hux/BackTop'

export default function Footer() {
  return (
    <>
      <footer className="hux-full-bleed hux-footer">
        <div className="footer-inner">
          <div className="footer-social">
            <SocialIcon kind="mail" href={`mailto:${siteMetadata.email}`} size={6} />
            <SocialIcon kind="github" href={siteMetadata.github} size={6} />
            <SocialIcon kind="facebook" href={siteMetadata.facebook} size={6} />
            <SocialIcon kind="youtube" href={siteMetadata.youtube} size={6} />
            <SocialIcon kind="linkedin" href={siteMetadata.linkedin} size={6} />
            <SocialIcon kind="twitter" href={siteMetadata.twitter} size={6} />
            <SocialIcon kind="bluesky" href={siteMetadata.bluesky} size={6} />
            <SocialIcon kind="x" href={siteMetadata.x} size={6} />
            <SocialIcon kind="instagram" href={siteMetadata.instagram} size={6} />
            <SocialIcon kind="threads" href={siteMetadata.threads} size={6} />
            <SocialIcon kind="medium" href={siteMetadata.medium} size={6} />
          </div>
          <div className="copyright">
            <div>{siteMetadata.author}</div>
            <div>{` | `}</div>
            <div>{`© ${new Date().getFullYear()}`}</div>
            <div>{` | `}</div>
            <Link href="/">{siteMetadata.title}</Link>
          </div>
        </div>
      </footer>
      <BackTop />
    </>
  )
}
