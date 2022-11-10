import formatDistanceToNowStrict from 'date-fns/formatDistanceToNowStrict'
import { enUS, ru } from 'date-fns/locale'
import { Locale } from '../types'

export function distanceToNow(
  dateTime: number | Date,
  locale: Locale = Locale.RU,
): string {
  return formatDistanceToNowStrict(dateTime, {
    addSuffix: true,
    locale: locale === Locale.RU ? ru : enUS,
  })
}
