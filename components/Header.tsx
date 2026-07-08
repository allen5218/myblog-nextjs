'use client'

import siteMetadata from '@/data/siteMetadata'
import headerNavLinks from '@/data/headerNavLinks'
import Link from './Link'
import ThemeSwitch from './ThemeSwitch'
import SearchButton from './SearchButton'
import { useState } from 'react'

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
          {headerNavLinks
            .filter((link) => link.href !== '/')
            .map((link) => (
              <Link key={link.title} href={link.href} onClick={() => setOpen(false)}>
                {link.title}
              </Link>
            ))}
          <div className="navbar-tools">
            <SearchButton />
            <ThemeSwitch />
          </div>
        </div>
      </nav>
    </header>
  )
}

export default Header
