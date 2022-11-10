import path from 'path'
import matter from 'gray-matter'
import fs from 'fs'
import { Feed } from 'feed'
import { remark } from "remark"
import html from "remark-html"
import imgLinks from "@pondorasti/remark-img-links"

const locales = {
    en: {
        BLOG_TITLE: `Alexander Sidorenko's Blog`,
        CREATIVITY_TITLE: 'Creativity of Alexander Sidorenko',
        FULL_NAME: 'Alexandr Sidorenko',
        RIGHTS: 'All rights reserved',
    },
    ru: {
        BLOG_TITLE: 'Блог Александра Сидоренко',
        CREATIVITY_TITLE: 'Творчество Александра Сидоренко',
        FULL_NAME: 'Александр Сидоренко',
        RIGHTS: 'Все права защищены',
    }
}

/**
 * @typedef PublicationType
 * @type {'post' | 'creativity'}
 */

/**
 * Получить все публикации по типу
 * @param {PublicationType} type
 */
async function getAllPublications(type, locale) {
    const postsDirectory = path.join(process.cwd(), `_content/posts/${locale}`)
    const creativityDirectory = path.join(process.cwd(), `_content/creativity/${locale}`)
    const isPost = type === 'post'
    const directory = isPost ? postsDirectory : creativityDirectory
    const slugs = (await fs.promises.readdir(directory)) || []
    const publications = slugs.map(slug => {
        const realSlug = slug.replace(/\.md$/, '')
        const fullPath = path.join(directory, `${realSlug}.md`)
        const fileContents = fs.readFileSync(fullPath, 'utf8')
        const { data, content } = matter(fileContents)

        const item = {
            ...data,
            slug: realSlug,
            content,
        }

        return item
    })

    const publicationsWithHtml = await Promise.all(publications.map(async (publication) => {
        const result = await remark().use(imgLinks, { absolutePath: `https://alexandr-sidorenko.me/${locale}` }).use(html).process(publication.content)
        const htmlContent = result.toString()
        return { ...publication, content: htmlContent }
    }))

    return publicationsWithHtml.sort((post1, post2) => (post1.date > post2.date ? -1 : 1))
}

/**
 *
 * @param {PublicationType} type
 * @param {'en' | 'ru'} locale
 */
async function generateRss(type, locale) {
    const isPost = type === 'post'
    const siteURL = `https://alexandr-sidorenko.me/${locale}`;
    const allPublications = await getAllPublications(type, locale)

    const author = {
        name: "Александр Сидоренко",
        link: isPost ? "https://twitter.com/batyshkaLenin/" : "https://vk.com/better_not_be_born",
    };

    const path = isPost ? 'posts' : 'creativity'
    const feed = new Feed({
        title: locales[locale]['FULL_NAME'],
        description: isPost ? locales[locale]['BLOG_TITLE'] : locales[locale]['CREATIVITY_TITLE'],
        id: siteURL,
        link: siteURL,
        image: `${siteURL}/${locale}/images/me.png`,
        favicon: `${siteURL}/${locale}/favicon.ico`,
        feedLinks: {
            rss2: `${siteURL}/${locale}/rss/${path}/feed.xml`,
            json: `${siteURL}/${locale}/rss/${path}/feed.json`,
        },
        author,
        copyright: `${locales[locale]['RIGHTS']} 2020-${new Date().getFullYear()}, ${locales[locale]['FULL_NAME']}`,
        language: locale
    });

    allPublications.forEach((pub) => {
        const url = `${siteURL}/${path}/${pub.slug}`;
        feed.addItem({
            title: pub.title,
            id: url,
            link: url,
            image: pub.preview ? `${siteURL}${pub.preview}` : undefined,
            description: pub.description,
            content: pub.content,
            author: [author],
            contributor: [author],
            date: new Date(pub.published),
        });
    })

    await fs.promises.mkdir(`./public/rss/${locale}/${path}`, { recursive: true });
    await fs.promises.writeFile(`./public/rss/${locale}/${path}/feed.xml`, feed.rss2().replaceAll('<item>', '<item turbo="true">'));
    await fs.promises.writeFile(`./public/rss/${locale}/${path}/feed.json`, feed.json1());
}


async function generateAllRSS() {
    const types = ['post', 'creativity']
    for (let i = 0; i < types.length; i++) {
        const type = types[i]
        try {
            await generateRss(type, 'ru')
            await generateRss(type, 'en')
            console.info(`RSS for ${type} generation completed`)
        } catch (e) {
            console.warn(`RSS for ${type} generation failed`)
            console.error(e)
        }
    }
}

function parseTimeline(txt) {
    const splittedTimeline = txt.split('\n').filter((str) => str[0] !== '#');
    const timeline = splittedTimeline.map((i) => i.split('\t')).filter((i) => i.length === 2);
    return timeline.map((i) => ({ text: i[1], date: i[0] }));
}

function encode(r){
    return r.replace(/[\x26\x0A\<>'"]/g,function(r){return"&#"+r.charCodeAt(0)+";"})
}

async function generateJournal() {
    const currentTimelineText = fs.readFileSync(path.join(process.cwd(), 'public/twtxt.txt')).toString();
    const parsedTimeline = parseTimeline(currentTimelineText).filter(item => !item.text.includes('@<'));
    const groups = parsedTimeline.reduce((groups, item) => {
        const date = item.date.split('T')[0];
        if (!groups[date]) {
            groups[date] = [];
        }
        groups[date] = [item.text].concat(groups[date]);
        return groups;
    }, {});
    let journalText = '<html lang="ru"><head><title>Журнал Александра Сидоренко</title></head><body><h1>Журнал Александра Сидоренко</h1>'
    Object.keys(groups).forEach(date => {
       journalText += `<article><h2>${date}</h2>${groups[date].map(item => `<p>${encode(item)}</p>`).join('')}</article>`
    });
    journalText += '</body></html>'
    await fs.promises.writeFile('./public/journal.html', journalText);
}

generateJournal().then(() => console.info('Journal generation completed'));

generateAllRSS().then(() => console.info('All RSS generation completed'))
