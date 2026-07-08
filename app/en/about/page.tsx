import AboutPage from '@/components/about/AboutPage'
import { alternateLanguages, getDictionary } from '@/lib/i18n'
import { genPageMetadata } from 'app/seo'

const locale = 'en'

export async function generateMetadata() {
  const dictionary = await getDictionary(locale)

  return genPageMetadata({
    title: dictionary.about.title,
    description: dictionary.about.description,
    locale: dictionary.about.ogLocale,
    alternates: {
      canonical: '/en/about/',
      languages: alternateLanguages('/about/'),
    },
  })
}

export default async function Page() {
  const dictionary = await getDictionary(locale)

  return <AboutPage dictionary={dictionary} locale={locale} />
}
