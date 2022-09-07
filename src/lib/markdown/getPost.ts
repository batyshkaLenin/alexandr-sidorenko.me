import fs from 'fs'
import { join } from 'path'
import matter from 'gray-matter'

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

export function getPostSlugs(): string[] {
  return fs.readdirSync(postsDirectory)
}

export function getPostBySlug<F extends keyof Post>(slug: string, fields: F[] = []): Pick<Post, 'published' | F> {
  const realSlug = slug.replace(/\.md$/, '')
  const fullPath = join(postsDirectory, `${realSlug}.md`)
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
          firstName: 'Александр',
          lastName: 'Сидоренко',
          fullName: 'Александр Сидоренко',
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

export function getAllPosts<F extends keyof Post>(fields: F[] = []): Pick<Post, "published" | F>[] {
  const slugs = getPostSlugs()
  const posts = slugs
    .map((slug) => getPostBySlug<F>(slug, fields))
    .sort((post1, post2) => (post1.published > post2.published ? -1 : 1))
  return posts
}
