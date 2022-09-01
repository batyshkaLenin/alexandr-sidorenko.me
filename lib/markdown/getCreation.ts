import fs from 'fs'
import { join } from 'path'
import matter from 'gray-matter'

const creationDirectory = join(process.cwd(), '_creation')

type Author = {
    firstName: string
    lastName: string
    fullName: string
    username: string
    gender: 'male' | 'female'
}

export type Creation = {
    slug: string
    title: string
    description: string
    created: string
    content: string
    author: Author
    modified: string
    preview?: string
    creationType: string
}

export function getCreationSlugs(): string[] {
    return fs.readdirSync(creationDirectory)
}

export function getCreationBySlug<F extends keyof Creation>(slug: string, fields: F[] = []): Pick<Creation, 'created' | F> {
    const realSlug = slug.replace(/\.md$/, '')
    const fullPath = join(creationDirectory, `${realSlug}.md`)
    const fileContents = fs.readFileSync(fullPath, 'utf8')
    const fileStats = fs.statSync(fullPath)
    const { data, content } = matter(fileContents)

    const item: unknown = { created: new Date(data.created).toJSON() }

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
                    username: 'unborned',
                    gender: 'male',
                }
                break
            case "modified":
                item[field] = fileStats.mtime.toJSON()
                break
            case "created":
                item[field] = new Date(data.created).toJSON()
                break
            default:
                item[field] = data[field]
        }
    })

    return <Pick<Creation, 'created' | F>>item
}

export function getAllCreation<F extends keyof Creation>(fields: F[] = []): Pick<Creation, "created" | F>[] {
    const slugs = getCreationSlugs()
    const creation = slugs
        .map((slug) => getCreationBySlug<F>(slug, fields))
        .sort((creation1, creation2) => (creation1.created > creation2.created ? -1 : 1))
    return creation
}
