import { useRouter } from "next/router";
import {useCallback, useMemo} from "react";
import locales from "../../../public/locales/index";

type Locales = 'en' | 'ru'

type TranslationHook = {
    locale: Locales
    t: (locale: keyof typeof locales['ru'] | keyof typeof locales['en']) => string
    setLocale: (locale: Locales) => void
    isForeign: boolean
}

export default function useTranslation(): TranslationHook {
    const router = useRouter();
    const locale: Locales = <Locales>router.locale;
    const asPath = router.asPath;

    const setLocale = useCallback(
        (locale) => {
            router.push(asPath, asPath, { locale });
        },
        [asPath]
    );

    const t = useCallback(
        (keyString) => {
            return locales[locale][keyString];
        },
        [locales, locale]
    );

    const isForeign = useMemo(() => locale !== 'ru', [locale])

    return { t, locale, setLocale, isForeign };
}
