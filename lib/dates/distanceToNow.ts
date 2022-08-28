import formatDistanceToNowStrict from 'date-fns/formatDistanceToNowStrict'
import { ru } from 'date-fns/locale'

export function distanceToNow(dateTime) {
  return formatDistanceToNowStrict(dateTime, {
    addSuffix: true,
    locale: ru,
  })
}
