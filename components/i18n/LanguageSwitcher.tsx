import Link from '@/components/Link'
import { Locale, localizedPath, locales } from '@/lib/i18n'

type LanguageSwitcherProps = {
  currentLocale: Locale
  labels: Record<Locale, string>
  ariaLabel: string
  path: string
}

export default function LanguageSwitcher({
  currentLocale,
  labels,
  ariaLabel,
  path,
}: LanguageSwitcherProps) {
  return (
    <nav aria-label={ariaLabel} className="language-switcher">
      {locales.map((locale) => (
        <Link
          aria-current={locale === currentLocale ? 'page' : undefined}
          className="language-switcher-link"
          href={localizedPath(locale, path)}
          hrefLang={locale}
          key={locale}
        >
          {labels[locale]}
        </Link>
      ))}
    </nav>
  )
}
