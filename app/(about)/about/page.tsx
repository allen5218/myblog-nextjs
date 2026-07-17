import AboutPage from '@/components/about/AboutPage'
import { alternateLanguages, defaultLocale, getDictionary } from '@/lib/i18n'
import { genPageMetadata } from 'app/seo'

export async function generateMetadata() {
  const dictionary = await getDictionary(defaultLocale)

  return genPageMetadata({
    title: dictionary.about.title,
    description: dictionary.about.description,
    locale: dictionary.about.ogLocale,
    alternates: {
      canonical: '/about/',
      languages: alternateLanguages('/about/'),
    },
  })
}

export default async function Page() {
  const dictionary = await getDictionary(defaultLocale)

  return <AboutPage dictionary={dictionary} locale={defaultLocale} />
}
