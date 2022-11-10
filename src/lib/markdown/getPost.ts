import fs from 'fs'
import { join } from 'path'
import matter from 'gray-matter'
import locales from '../locales'
import { Locale } from '../types'

const postsDirectory = join(process.cwd(), '_content/posts')

type Author = {
  firstName: string
  lastName: string
  fullName: string
  username: string
  gender: 'male' | 'female'
}

export type Post = {
  slug: string
  title: string
  description: string
  published: string
  created: string
  content: string
  author: Author
  modified: string
  preview?: string
  tags: string[]
}

export function getPostSlugs(locale: Locale = Locale.RU): string[] {
  try {
    return fs.readdirSync(`${postsDirectory}/${locale}`)
  } catch (_) {
    return []
  }
}

export function getPostBySlug<F extends keyof Post>(
  slug: string,
  fields: F[] = [],
  locale: Locale = Locale.RU,
): Pick<Post, 'published' | F> {
  const realSlug = slug.replace(/\.md$/, '')
  const fullPath = join(`${postsDirectory}/${locale}`, `${realSlug}.md`)
  const fileContents = fs.readFileSync(fullPath, 'utf8')
  const fileStats = fs.statSync(fullPath)
  const { data, content } = matter(fileContents)

  const item: Partial<Post> & Record<string, unknown> = {
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
          username: 'batyshkaLenin',
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
      case 'tags':
        item[field] = data[field] || []
        break
      default:
        item[field] = data[field]
    }
  })

  return <Pick<Post, 'published' | F>>item
}

export function getAllPosts<F extends keyof Post>(
  fields: F[] = [],
  locale: Locale = Locale.RU,
): Pick<Post, 'published' | F>[] {
  const slugs = getPostSlugs(locale)
  return slugs
    .map((slug) => getPostBySlug<F>(slug, fields, locale))
    .sort((post1, post2) => (post1.published > post2.published ? -1 : 1))
}

export function getAllLocalesPosts<F extends keyof Post>(
  fields: F[] = [],
): (Pick<Post, 'published' | F> & { locale: Locale })[] {
  const postsRU = getAllPosts(fields, Locale.RU).map((item) => ({
    ...item,
    locale: Locale.RU,
  }))
  const postsEN = getAllPosts(fields, Locale.EN).map((item) => ({
    ...item,
    locale: Locale.EN,
  }))
  return postsEN.concat(postsRU)
}
