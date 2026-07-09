import Link from './Link'
import siteMetadata from '@/data/siteMetadata'
import HuxSocial from './hux/HuxSocial'
import BackTop from './hux/BackTop'

export default function Footer() {
  return (
    <>
      <footer className="hux-full-bleed hux-footer">
        <div className="footer-inner">
          <HuxSocial />
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
