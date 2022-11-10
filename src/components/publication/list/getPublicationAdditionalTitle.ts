import locales from '../../../lib/locales'
import {
  CreativeMusic,
  CreativeWriting,
  CreativityType,
} from '../../../lib/markdown'
import { Locale, PublicationType } from '../../../lib/types'

export function getPublicationAdditionalTitle(
  locale: Locale,
  type: PublicationType,
  publicationType?: CreativityType,
) {
  if (type === 'creativity') {
    switch (publicationType) {
      case CreativeWriting.Story:
        return locales[locale]['STORY']
      case CreativeWriting.Poem:
        return locales[locale]['POEM']
      case CreativeWriting.Poetry:
        return locales[locale]['POETRY']
      case CreativeMusic.Single:
        return locales[locale]['SINGLE']
      case CreativeMusic.EP:
        return locales[locale]['EP']
      case CreativeMusic.Album:
        return locales[locale]['ALBUM']
      default:
        return locales[locale]['WORK']
    }
  }
  return locales[locale]['ARTICLE']
}
