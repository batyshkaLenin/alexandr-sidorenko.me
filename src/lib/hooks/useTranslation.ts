import { useRouter } from 'next/router'
import { useCallback, useMemo } from 'react'
import locales from '../locales'
import { Locale, LocalesKeys } from '../types'

type TranslationHook = {
  locale: Locale
  t: (locale: LocalesKeys) => string
  setLocale: (locale: Locale) => void
  isForeign: boolean
}

export default function useTranslation(): TranslationHook {
  const router = useRouter()
  const locale: Locale = <Locale>router?.locale
  const asPath = router?.asPath

  const setLocale = useCallback(
    (locale: Locale) => {
      router.push(asPath, asPath, { locale })
    },
    [asPath],
  )

  const t = useCallback(
    (keyString: LocalesKeys) => <string>locales[locale][keyString],
    [router, locale],
  )

  const isForeign = useMemo(() => locale !== 'ru', [locale])

  return { t, locale, setLocale, isForeign }
}
