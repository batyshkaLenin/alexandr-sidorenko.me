import path from 'path'
import matter from 'gray-matter'
import fs from 'fs'
import { Feed } from 'feed'
import { remark } from "remark"
import html from "remark-html"
import imgLinks from "@pondorasti/remark-img-links"

/**
 * @typedef PublicationType
 * @type {'post' | 'creation'}
 */

/**
 * Получить все публикации по типу
 * @param {PublicationType} type
 */
async function getAllPublications(type) {
    const postsDirectory = path.join(process.cwd(), '_content/posts')
    const creationDirectory = path.join(process.cwd(), '_content/creation')
    const isPost = type === 'post'
    const directory = isPost ? postsDirectory : creationDirectory
    const slugs = await fs.promises.readdir(directory)
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
        const result = await remark().use(imgLinks, { absolutePath: 'https://alexandr-sidorenko.me' }).use(html).process(publication.content)
        const htmlContent = result.toString()
        return { ...publication, content: htmlContent }
    }))

    return publicationsWithHtml.sort((post1, post2) => (post1.date > post2.date ? -1 : 1))
}

/**
 *
 * @param {PublicationType} type
 */
async function generateRss(type) {
    const isPost = type === 'post'
    const siteURL = 'https://alexandr-sidorenko.me';
    const allPublications = await getAllPublications(type)

    const author = {
        name: "Александр Сидоренко",
        link: isPost ? "https://twitter.com/batyshkaLenin/" : "https://vk.com/better_not_be_born",
    };

    const path = isPost ? 'posts' : 'creation'
    const feed = new Feed({
        title: "Александр Сидоренко",
        description: isPost ? "Блог Александра Сидоренко" : "Творчество Александра Сидоренко",
        id: siteURL,
        link: siteURL,
        image: `${siteURL}/images/me.png`,
        favicon: `${siteURL}/favicon.ico`,
        feedLinks: {
            rss2: `${siteURL}/rss/${path}/feed.xml`,
            json: `${siteURL}/rss/${path}/feed.json`,
        },
        author,
        copyright: `Все права защищены 2020-${new Date().getFullYear()}, Александр Сидоренко`,
        language: "ru"
    });

    allPublications.forEach((pub) => {
        const url = `${siteURL}/${path}/${pub.slug}`;
        feed.addItem({
            title: pub.title,
            id: url,
            link: url,
            audio: pub.audio && pub.audio.length ? `${siteURL}${pub.audio[0]}` : undefined,
            image: pub.preview ? `${siteURL}${pub.preview}` : undefined,
            description: pub.description,
            content: pub.content,
            author: [author],
            contributor: [author],
            date: new Date(pub.published),
        });
    })

    await fs.promises.mkdir(`./public/rss/${path}`, { recursive: true });
    await fs.promises.writeFile(`./public/rss/${path}/feed.xml`, feed.rss2().replaceAll('<item>', '<item turbo="true">'));
    await fs.promises.writeFile(`./public/rss/${path}/feed.json`, feed.json1());
}


async function generateAllRSS() {
    const types = ['post', 'creation']
    for (let i = 0; i < types.length; i++) {
        const type = types[i]
        try {
            await generateRss(type)
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
