import path from 'path'
import matter from 'gray-matter'
import fs from 'fs'
import { Feed } from 'feed'
import { remark } from "remark"
import html from "remark-html"
import imgLinks from "@pondorasti/remark-img-links"

const postsDirectory = path.join(process.cwd(), '_posts')

async function getAllPosts() {
    const slugs = await fs.promises.readdir(postsDirectory)
    const posts = slugs.map(slug => {
        const realSlug = slug.replace(/\.md$/, '')
        const fullPath = path.join(postsDirectory, `${realSlug}.md`)
        const fileContents = fs.readFileSync(fullPath, 'utf8')
        const { data, content } = matter(fileContents)

        const item = {
            ...data,
            slug: realSlug,
            content
        }

        return item
    })

    const postsWithHtml = await Promise.all(posts.map(async (post) => {
        const result = await remark().use(imgLinks, { absolutePath: 'https://alexandr-sidorenko.me' }).use(html).process(post.content)
        const htmlContent = result.toString()
        return { ...post, content: htmlContent }
    }))

    return postsWithHtml.sort((post1, post2) => (post1.date > post2.date ? -1 : 1))
}

async function generateRss() {
    const siteURL = 'https://alexandr-sidorenko.me';
    const allPosts = await getAllPosts();

    const author = {
        name: "Александр Сидоренко",
        link: "https://twitter.com/batyshkaLenin/",
    };

    const feed = new Feed({
        title: "Александр Сидоренко",
        description: "Блог Александра Сидоренко",
        id: siteURL,
        link: siteURL,
        favicon: `${siteURL}/favicon.ico`,
        feedLinks: {
            rss2: `${siteURL}/rss/feed.xml`,
            json: `${siteURL}/rss/feed.json`,
            atom: `${siteURL}/rss/feed.atom`,
        },
        author,
        copyright: `Все права защищены 2020-${new Date().getFullYear()}, Александр Сидоренко`,
        language: "ru"
    });

    allPosts.forEach((post) => {
        const url = `${siteURL}/blog/${post.slug}`;
        feed.addItem({
            category: post.tags,
            title: post.title,
            id: url,
            link: url,
            description: post.description,
            content: post.content,
            author: [author],
            contributor: [author],
            date: new Date(post.created),
        });
    })

    await fs.promises.mkdir("./public/rss", { recursive: true });
    await fs.promises.writeFile("./public/rss/feed.xml", feed.rss2());
    await fs.promises.writeFile("./public/rss/feed.json", feed.json1());
}

generateRss().then(() => {
    console.info('RSS generation completed')
}).catch(console.error)
