import locales from '../locales'
import { Locale, TriggerWarning } from '../types'

export function getTriggerWarningText(
  tw: TriggerWarning,
  locale: Locale = Locale.RU,
) {
  switch (tw) {
    case TriggerWarning.Adulthood:
      return locales[locale]['TW_ADULTHOOD']
    case TriggerWarning.Religion:
      return locales[locale]['TW_RELIGION']
    case TriggerWarning.Addiction:
      return locales[locale]['TW_ADDICTION']
    case TriggerWarning.Translation:
      return locales[locale]['TW_TRANSLATION']
    default:
      return undefined
  }
}
