'use client'

import siteMetadata from '@/data/siteMetadata'
import Link from './Link'
import ThemeSwitch from './ThemeSwitch'
import SearchButton from './SearchButton'
import MobileNavMenu from './MobileNavMenu'

const huxNavLinks = [
  { href: '/', title: 'Home' },
  { href: '/about', title: 'About' },
  { href: '/archive', title: 'Archive' },
]

const Header = () => {
  return (
    <header className="hux-full-bleed navbar-custom">
      <nav className="navbar-inner" aria-label="Primary navigation">
        <Link href="/" aria-label={siteMetadata.headerTitle} className="navbar-brand">
          {siteMetadata.headerTitle}
        </Link>

        {/* 桌面版:維持舊站 Hux 橫排(Dark / Home / About / Archive / search) */}
        <div className="navbar-links">
          <div className="navbar-tools navbar-theme-tool">
            <ThemeSwitch />
          </div>
          {huxNavLinks.map((link) => (
            <Link key={link.title} href={link.href}>
              {link.title}
            </Link>
          ))}
          <div className="navbar-tools navbar-search-tool">
            <SearchButton />
          </div>
        </div>

        {/* 手機版:深淺切換與搜尋常駐頂欄,漢堡點擊彈出連結卡片 */}
        <div className="navbar-mobile navbar-tools">
          <ThemeSwitch />
          <SearchButton />
          <MobileNavMenu />
        </div>
      </nav>
    </header>
  )
}

export default Header
