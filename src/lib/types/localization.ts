import locales from '../locales'

export enum Locale {
  RU = 'ru',
  EN = 'en',
}

export type LocalesKeys = keyof (typeof locales)[Locale]
