'use client'

import siteMetadata from '@/data/siteMetadata'
import headerNavLinks from '@/data/headerNavLinks'
import Link from './Link'
import ThemeSwitch from './ThemeSwitch'
import SearchButton from './SearchButton'
import { useState } from 'react'

const huxNavLinks = [
  { href: '/', title: 'Home' },
  { href: '/about', title: 'About' },
  { href: '/archive', title: 'Archive' },
]

const Header = () => {
  const [open, setOpen] = useState(false)

  return (
    <header className="hux-full-bleed navbar-custom">
      <nav className="navbar-inner" aria-label="Primary navigation">
        <Link href="/" aria-label={siteMetadata.headerTitle} className="navbar-brand">
          {siteMetadata.headerTitle}
        </Link>
        <button
          aria-expanded={open}
          aria-label="Toggle navigation"
          className="navbar-toggle"
          onClick={() => setOpen((current) => !current)}
          type="button"
        >
          <span className="icon-bar" />
          <span className="icon-bar" />
          <span className="icon-bar" />
        </button>
        <div className={`navbar-links ${open ? 'navbar-links-open' : ''}`}>
          <div className="navbar-tools navbar-theme-tool">
            <ThemeSwitch />
          </div>
          {(open ? headerNavLinks : huxNavLinks).map((link) => (
            <Link key={link.title} href={link.href} onClick={() => setOpen(false)}>
              {link.title}
            </Link>
          ))}
          <div className="navbar-tools navbar-search-tool">
            <SearchButton />
          </div>
        </div>
      </nav>
    </header>
  )
}

export default Header
