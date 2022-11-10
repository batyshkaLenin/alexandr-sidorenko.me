import { useRouter } from 'next/router'
import { useAmp } from 'next/amp'
import ErrorPage from 'next/error'
import { distanceToNow } from '../../lib/dates'
import { getAllPosts, getPostBySlug, markdownToHtml, Post} from '../../lib/markdown'
import Helmet from "../../components/Helmet"
import Link from 'next/link'
import { getUrl } from "../../lib/urls"
import useTranslation from "../../lib/hooks/useTranslation";

export const config = { amp: 'hybrid' }

type PostPageProps = {
  post: Pick<Post, 'slug' | 'title' | 'author'| 'description' | 'created' | 'published' | 'modified' | 'content' | 'preview'>
}

export default function PostPage({ post }: PostPageProps) {
  const { t } = useTranslation();
  const isAmp = useAmp()
  const router = useRouter()
  const url = getUrl(router)

  if (!router.isFallback && !post?.slug) {
    return <ErrorPage statusCode={404} />
  }
  const postURL = `/posts/${post.slug}`

  const breadcrumbs = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    "itemListElement":
        [
          {
            "@type": "ListItem",
            "position": 1,
            "item":
                {
                  "@id": "/posts",
                  "url": "/posts",
                  "name": t('MENU_BLOG'),
                },
          },
          {
            "@type": "ListItem",
            "position": 2,
            "item":
                {
                  "@id": postURL,
                  "url": postURL,
                  "name": post.title,
                },
          },
        ],
  }

  return (
    <>
      <Helmet title={`${post.title} | ${t('BLOG_TITLE')}`} description={post.description} image={post.preview}>
        <link rel="amphtml" href={`${url}.amp`} />
        <meta content='article' property='og:type' />
        <meta content={post.author.firstName} property='og:article:author:first_name'/>
        <meta content={post.author.lastName} property='og:article:author:last_name'/>
        <meta content={post.author.username} property='og:article:author:username'/>
        <meta content={post.author.gender} property='og:article:author:gender'/>
        <meta content={post.published} property='og:article:published_time' />
        <meta content={post.modified} property='og:article:modified_time' />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbs) }}/>
      </Helmet>
      {router.isFallback ? (
        <div>Loading…</div>
      ) : (
        <article className='post-full post h-entry' itemProp="blogPost" itemScope itemType="https://schema.org/Article">
          {isAmp ? null : (<>
              <data className="u-photo" value="https://alexandr-sidorenko.me/avatar.jpg" />
              <data className="u-url" value={`https://alexandr-sidorenko.me${postURL}`} />
          </>)}
          <meta itemProp="image" content={post.preview || '/images/me.png'} />
          <header className='post-full-header'>
            <h1 className='post-full-title p-name' itemProp="headline">{post.title}</h1>
            <meta className="p-author h-card" itemProp="author" content={t('FULL_NAME')} />
            <meta itemProp="dateCreated" content={post.created} />
            <Link as={isAmp ? `${postURL}?amp=1` : postURL} href="/posts/[slug]" >
              <a
                  itemProp="url"
              >
                <time
                    className='text-center meta dt-published'
                    itemProp="datePublished"
                    dateTime={post.published}
                >
                  {distanceToNow(new Date(post.published))}
                </time>
              </a>
            </Link>
          </header>
          <section
            className='publicationContent e-content'
            itemProp="articleBody"
            dangerouslySetInnerHTML={{ __html: post.content }}
          />
        </article>
      )}
    </>
  )
}

export async function getStaticProps({ params, locale }) {
  const post = getPostBySlug(params.slug, [
    'slug',
    'title',
    'author',
    'description',
    'created',
    'published',
    'modified',
    'content',
    'preview',
  ], locale)
  const content = await markdownToHtml(post.content || '')

  return {
    props: {
      post: {
        ...post,
        content,
      },
    },
  }
}

export async function getStaticPaths() {
  const postsRU = getAllPosts(['slug'], 'ru')
  const postsEN = getAllPosts(['slug'], 'en')
  const localeFeeds = { ru: postsRU, en: postsEN };

  return {
    paths: Object.keys(localeFeeds).flatMap(locale => {
      return localeFeeds[locale].map(path => {
        return { params: { slug: path.slug }, locale }
      })
    }),
    fallback: false,
  }
}
