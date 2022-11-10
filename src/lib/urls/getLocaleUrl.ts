import { NextRouter } from 'next/router'
import { getHost } from './getHost'

export const getLocaleUrl = (router: NextRouter, locale: 'en' | 'ru') => {
    const { asPath: path } = router
    const host = getHost()
    return locale === 'ru' ? host + path : host + '/en' + path
}
