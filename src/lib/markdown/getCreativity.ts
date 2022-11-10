import fs from 'fs'
import {join} from 'path'
import matter from 'gray-matter'
import locales from "../../../public/locales";

const creativityDirectory = join(process.cwd(), '_content/creativity')

export enum TriggerWarning {
    Adulthood = '18',
    Addiction = 'addict',
    Religion = 'religion',
    Translation = 'deepl',
}

export enum CreativeWriting {
    Poem = 'poem',
    Poetry = 'poetry',
    Story = 'story',
}

export enum CreativeMusic {
    Single = 'single',
    EP = 'ep',
    Album = 'album'
}

export type CreativityType = CreativeWriting | CreativeMusic

type Author = {
    firstName: string
    lastName: string
    fullName: string
    username: string
    gender: 'male' | 'female'
}

export type Creativity = {
    slug: string
    title: string
    description: string
    published: string
    created: string
    content: string
    author: Author
    modified: string
    preview?: string
    creativityType: CreativityType
    audio?: string[]
    tw: TriggerWarning[]
}

export function getCreativitySlugs(locale: 'ru' | 'en' = 'ru'): string[] {
    return fs.readdirSync(`${creativityDirectory}/${locale}`)
}

export function getCreativityBySlug<F extends keyof Creativity>(slug: string, fields: F[] = [], locale: 'ru' | 'en' = 'ru'): Pick<Creativity, 'published' | F> {
    const realSlug = slug.replace(/\.md$/, '')
    const fullPath = join(`${creativityDirectory}/${locale}`, `${realSlug}.md`)
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
                    username: 'unborned',
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
            case "tw":
            case "audio":
                item[field] = data[field] || []
                break
            default:
                item[field] = data[field]
        }
    })

    return <Pick<Creativity, 'published' | F>>item
}

export function getAllCreativity<F extends keyof Creativity>(fields: F[] = [], locale: 'ru' | 'en' = 'ru'): Pick<Creativity, "published" | F>[] {
    const slugs = getCreativitySlugs(locale)
    return slugs
        .map((slug) => getCreativityBySlug<F>(slug, fields, locale))
        .sort((creativity1, creativity2) => (creativity1.published > creativity2.published ? -1 : 1))
}
