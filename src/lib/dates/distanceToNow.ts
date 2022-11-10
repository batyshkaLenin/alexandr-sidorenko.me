import formatDistanceToNowStrict from 'date-fns/formatDistanceToNowStrict'
import { ru, enUS } from 'date-fns/locale'

export function distanceToNow(dateTime, locale = 'ru') {
  return formatDistanceToNowStrict(dateTime, {
    addSuffix: true,
    locale: locale === 'ru' ? ru : enUS,
  })
}
