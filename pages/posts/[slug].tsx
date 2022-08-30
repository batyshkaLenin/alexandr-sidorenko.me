import { useRouter } from 'next/router'
import { useAmp } from 'next/amp'
import ErrorPage from 'next/error'
import { distanceToNow } from '../../lib/dates'
import {getAllPosts, getPostBySlug, markdownToHtml, Post} from '../../lib/posts'
import Helmet from "../../components/Helmet"
import Link from 'next/link'

export const config = { amp: 'hybrid' }

type PostPageProps = {
  post: Pick<Post, 'slug' | 'title' | 'author'| 'description' | 'created' | 'modified' | 'content' | 'preview'>
}

export default function PostPage({ post }: PostPageProps) {
  const isAmp = useAmp()
  const router = useRouter()

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
                  "name": "Блог",
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
      <Helmet title={`${post.title} | Блог Александра Сидоренко`} description={post.description} image={post.preview}>
        <meta content='article' property='og:type' />
        <meta content={post.author.firstName} property='og:article:author:first_name'/>
        <meta content={post.author.lastName} property='og:article:author:last_name'/>
        <meta content={post.author.username} property='og:article:author:username'/>
        <meta content={post.author.gender} property='og:article:author:gender'/>
        <meta content={post.created} property='og:article:published_time' />
        <meta content={post.modified} property='og:article:modified_time' />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbs) }}/>
      </Helmet>
      {router.isFallback ? (
        <div>Loading…</div>
      ) : (
        <article className='post-full post h-entry' itemProp="blogPost" itemScope itemType="https://schema.org/BlogPosting">
          <meta itemProp="image" content={post.preview || '/images/me.png'} />
          <header className='post-full-header'>
            <h1 className='post-full-title p-name' itemProp="headline">{post.title}</h1>
            <meta itemProp="author" content="Александр Сидоренко" />
            <Link as={isAmp ? `${postURL}?amp=1` : postURL} href="/posts/[slug]" >
              <a
                  itemProp="url"
                  className='p-url'
              >
                <time
                    className='text-center meta dt-published'
                    itemProp="dateCreated"
                    dateTime={post.created}
                >
                  {distanceToNow(new Date(post.created))}
                </time>
              </a>
            </Link>
          </header>
          <section
            className='postContent'
            itemProp="articleBody"
            dangerouslySetInnerHTML={{ __html: post.content }}
          />
        </article>
      )}
    </>
  )
}

export async function getStaticProps({ params }) {
  const post = getPostBySlug(params.slug, [
    'slug',
    'title',
    'author',
    'description',
    'created',
    'modified',
    'content',
    'preview',
  ])
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
  const posts = getAllPosts(['slug'])

  return {
    paths: posts.map(({ slug }) => ({
      params: {
        slug,
      },
    })),
    fallback: false,
  }
}
