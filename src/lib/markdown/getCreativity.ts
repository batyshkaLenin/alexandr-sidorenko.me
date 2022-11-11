import fs from 'fs'
import { join } from 'path'
import matter from 'gray-matter'
import locales from '../locales'
import { Creativity, Locale } from '../types'

const creativityDirectory = join(process.cwd(), '_content/creativity')

export function getCreativitySlugs(locale: Locale = Locale.RU): string[] {
  try {
    return fs.readdirSync(`${creativityDirectory}/${locale}`)
  } catch (_) {
    return []
  }
}

export function getCreativityBySlug<F extends keyof Creativity>(
  slug: string,
  fields: F[] = [],
  locale: Locale = Locale.RU,
): Pick<Creativity, 'published' | F> {
  const realSlug = slug.replace(/\.md$/, '')
  const fullPath = join(`${creativityDirectory}/${locale}`, `${realSlug}.md`)
  const fileContents = fs.readFileSync(fullPath, 'utf8')
  const fileStats = fs.statSync(fullPath)
  const { data, content } = matter(fileContents)

  const item: Partial<Creativity> & Record<string, unknown> = {
    published: new Date(data.published).toJSON(),
  }

  fields.forEach((field: string) => {
    switch (field) {
      case 'slug':
        item[field] = realSlug
        break
      case 'content':
        item[field] = content
        break
      case 'author':
        item[field] = {
          firstName: locales[locale]['FIRSTNAME'],
          lastName: locales[locale]['LASTNAME'],
          fullName: locales[locale]['FULL_NAME'],
          username: 'unborned',
          gender: 'male',
        }
        break
      case 'modified':
        item[field] = fileStats.mtime.toJSON()
        break
      case 'created':
      case 'published':
        item[field] = new Date(data[field]).toJSON()
        break
      case 'tw':
      case 'audio':
        item[field] = data[field] || []
        break
      default:
        item[field] = data[field]
    }
  })

  return <Pick<Creativity, 'published' | F>>item
}

export function getAllCreativity<F extends keyof Creativity>(
  fields: F[] = [],
  locale: Locale = Locale.RU,
): Pick<Creativity, 'published' | F>[] {
  const slugs = getCreativitySlugs(locale)
  return slugs
    .map((slug) => getCreativityBySlug<F>(slug, fields, locale))
    .sort((creativity1, creativity2) =>
      creativity1.published > creativity2.published ? -1 : 1,
    )
}

export function getAllLocalesCreativity<F extends keyof Creativity>(
  fields: F[] = [],
): (Pick<Creativity, 'published' | F> & { locale: Locale })[] {
  const postsRU = getAllCreativity(fields, Locale.RU).map((item) => ({
    ...item,
    locale: Locale.RU,
  }))
  const postsEN = getAllCreativity(fields, Locale.EN).map((item) => ({
    ...item,
    locale: Locale.EN,
  }))
  return postsEN.concat(postsRU)
}
