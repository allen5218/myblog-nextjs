'use client'

import { useEffect, useRef } from 'react'
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
  const headerRef = useRef<HTMLElement>(null)

  // 電腦版滾動浮動導覽(Hux 行為):向下滾動時把列藏到視窗上緣,
  // 向上滾動時以半透明固定列滑入;回到頂端則恢復透明疊在 hero 上。
  // 視覺效果由 CSS 的 @media (min-width: 768px) 控制,行動版加上 class 也不生效。
  useEffect(() => {
    const header = headerRef.current
    if (!header) return

    const headerHeight = header.offsetHeight || 61
    let previousTop = window.scrollY

    const onScroll = () => {
      const currentTop = window.scrollY
      if (currentTop < previousTop) {
        // 向上滾動
        if (currentTop > 0 && header.classList.contains('is-fixed')) {
          header.classList.add('is-visible')
        } else {
          header.classList.remove('is-visible', 'is-fixed')
        }
      } else {
        // 向下滾動
        header.classList.remove('is-visible')
        if (currentTop > headerHeight && !header.classList.contains('is-fixed')) {
          header.classList.add('is-fixed')
        }
      }
      previousTop = currentTop
    }

    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <header ref={headerRef} className="hux-full-bleed navbar-custom">
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

        {/* 手機版:深淺切換常駐頂欄,漢堡點擊彈出連結卡片(含搜尋) */}
        <div className="navbar-mobile navbar-tools">
          <ThemeSwitch />
          <MobileNavMenu />
        </div>
      </nav>
    </header>
  )
}

export default Header
