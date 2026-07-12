import { NextResponse, type NextRequest } from 'next/server'

const legacyAboutLanguages = new Set(['en', 'zh', 'zh-TW'])

export function proxy(request: NextRequest) {
  const { nextUrl } = request
  const lang = nextUrl.searchParams.get('lang')

  if (!lang || !legacyAboutLanguages.has(lang)) return NextResponse.next()

  const url = nextUrl.clone()
  url.pathname = lang === 'en' ? '/en/about/' : '/about/'
  url.search = ''

  return NextResponse.redirect(url, 308)
}

export const config = {
  matcher: ['/about/:path*'],
}
