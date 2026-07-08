import 'server-only'

import siteMetadata from '@/data/siteMetadata'

export const locales = ['zh-TW', 'en'] as const
export type Locale = (typeof locales)[number]

export const defaultLocale: Locale = 'zh-TW'

export type Dictionary = {
  common: {
    languageSwitcherLabel: string
    languageNames: Record<Locale, string>
  }
  about: {
    title: string
    description: string
    ogLocale: string
    headerImg: string
    headerMask: number
    profile: {
      name: string
      role: string
      location: string
    }
    body: string[]
  }
}

const dictionaries: Record<Locale, () => Promise<Dictionary>> = {
  'zh-TW': () => import('@/dictionaries/zh-TW.json').then((module) => module.default),
  en: () => import('@/dictionaries/en.json').then((module) => module.default),
}

export function isLocale(locale: string): locale is Locale {
  return locales.includes(locale as Locale)
}

export async function getDictionary(locale: Locale = defaultLocale) {
  return dictionaries[locale]()
}

export function localizedPath(locale: Locale, path: string) {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`
  const trailingPath = normalizedPath === '/' ? '/' : normalizedPath.replace(/\/?$/, '/')

  if (locale === defaultLocale) return trailingPath

  return `/${locale}${trailingPath}`
}

export function localizedUrl(locale: Locale, path: string) {
  return `${siteMetadata.siteUrl}${localizedPath(locale, path)}`
}

export function alternateLanguages(path: string) {
  return {
    'zh-TW': localizedPath('zh-TW', path),
    en: localizedPath('en', path),
    'x-default': localizedPath(defaultLocale, path),
  }
}
