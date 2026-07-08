import HuxHero from '@/components/hux/HuxHero'
import LanguageSwitcher from '@/components/i18n/LanguageSwitcher'
import { Dictionary, Locale } from '@/lib/i18n'

type AboutPageProps = {
  dictionary: Dictionary
  locale: Locale
}

export default function AboutPage({ dictionary, locale }: AboutPageProps) {
  const { about, common } = dictionary

  return (
    <>
      <HuxHero
        variant="home"
        title={about.title}
        subtitle={about.description}
        headerImg={about.headerImg}
        headerMask={about.headerMask}
      />
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
              <p key={paragraph}>{paragraph}</p>
            ))}
          </div>
        </article>
      </div>
    </>
  )
}
