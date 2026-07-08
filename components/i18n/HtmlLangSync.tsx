'use client'

import { usePathname } from 'next/navigation'
import { useEffect } from 'react'
import siteMetadata from '@/data/siteMetadata'

export default function HtmlLangSync() {
  const pathname = usePathname()

  useEffect(() => {
    document.documentElement.lang = pathname?.startsWith('/en/') ? 'en' : siteMetadata.language
  }, [pathname])

  return null
}
