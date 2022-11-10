import fs from 'fs'
import { join } from 'path'
import matter from 'gray-matter'
import locales from '../../../public/locales/index'

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

export function getPostSlugs(locale: 'en' | 'ru' = 'ru'): string[] {
  try {
    return fs.readdirSync(`${postsDirectory}/${locale}`)
  } catch (_) {
    return []
  }
}

export function getPostBySlug<F extends keyof Post>(slug: string, fields: F[] = [], locale: 'en' | 'ru' = 'ru'): Pick<Post, 'published' | F> {
  const realSlug = slug.replace(/\.md$/, '')
  const fullPath = join(`${postsDirectory}/${locale}`, `${realSlug}.md`)
  const fileContents = fs.readFileSync(fullPath, 'utf8')
  const fileStats = fs.statSync(fullPath)
  const { data, content } = matter(fileContents)

  const item: unknown = { published: new Date(data.published).toJSON() }

  fields.forEach((field) => {
    switch (field) {
      case "slug":
        item[field] = realSlug
        break
      case "content":
        item[field] = content
        break
      case "author":
        item[field] = {
          firstName: locales[locale]['FIRSTNAME'],
          lastName: locales[locale]['LASTNAME'],
          fullName: locales[locale]['FULL_NAME'],
          username: 'batyshkaLenin',
          gender: 'male',
        }
        break
      case "modified":
        item[field] = fileStats.mtime.toJSON()
        break
      case "created":
      case "published":
        item[field] = new Date(data[field]).toJSON()
        break
      case "tags":
        try {
          item[field] = data[field] || []
        } catch (_) {
          item[field] = []
        }
        break
      default:
        item[field] = data[field]
    }
  })

  return <Pick<Post, 'published' | F>>item
}

export function getAllPosts<F extends keyof Post>(fields: F[] = [], locale: 'en' | 'ru' = 'ru'): Pick<Post, "published" | F>[] {
  const slugs = getPostSlugs(locale)
  const posts = slugs
    .map((slug) => getPostBySlug<F>(slug, fields, locale))
    .sort((post1, post2) => (post1.published > post2.published ? -1 : 1))
  return posts
}
