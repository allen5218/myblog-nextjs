import LanguageSwitcher from '@/components/i18n/LanguageSwitcher'
import Link from '@/components/Link'
import { Dictionary, Locale } from '@/lib/i18n'
import type { ReactNode } from 'react'

// 字典的 about.body 是純字串陣列,這裡只支援最小限度的 markdown 連結語法
// [文字](網址),讓文案可以指到站內文章而不用把整頁改成 MDX。
const MARKDOWN_LINK = /\[([^\]]+)\]\(([^)\s]+)\)/g

function renderParagraph(text: string) {
  const nodes: ReactNode[] = []
  let lastIndex = 0

  for (const match of text.matchAll(MARKDOWN_LINK)) {
    const [raw, label, href] = match
    const index = match.index ?? 0
    if (index > lastIndex) {
      nodes.push(text.slice(lastIndex, index))
    }
    nodes.push(
      <Link key={index} href={href}>
        {label}
      </Link>
    )
    lastIndex = index + raw.length
  }

  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex))
  }

  return nodes
}

type AboutPageProps = {
  dictionary: Dictionary
  locale: Locale
}

export default function AboutPage({ dictionary, locale }: AboutPageProps) {
  const { about, common } = dictionary

  return (
    <div className="post-shell about-shell">
      <article className="post-container about-container" lang={locale}>
        <LanguageSwitcher
          ariaLabel={common.languageSwitcherLabel}
          currentLocale={locale}
          labels={common.languageNames}
          path="/about/"
        />
        <header className="about-profile">
          <p className="about-name">{about.profile.name}</p>
          <p className="about-role">{about.profile.role}</p>
          <p className="about-location">{about.profile.location}</p>
        </header>
        <div className="prose dark:prose-invert max-w-none">
          {about.body.map((paragraph) => (
            <p key={paragraph}>{renderParagraph(paragraph)}</p>
          ))}
        </div>
      </article>
    </div>
  )
}
