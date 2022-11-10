import { useAmp } from 'next/amp'
import ErrorPage from 'next/error'
import Link from 'next/link'
import { useRouter } from 'next/router'
import Helmet from '../../components/Helmet'
import { distanceToNow } from '../../lib/dates'
import useTranslation from '../../lib/hooks/useTranslation'
import {
  getAllLocalesPosts,
  getPostBySlug,
  markdownToHtml,
  Post,
} from '../../lib/markdown'
import { Locale } from '../../lib/types'
import { getUrl } from '../../lib/urls'

export const config = { amp: 'hybrid' }

type PostPageProps = {
  post: Pick<
    Post,
    | 'slug'
    | 'title'
    | 'author'
    | 'description'
    | 'created'
    | 'published'
    | 'modified'
    | 'content'
    | 'preview'
  >
}

export default function PostPage({ post }: PostPageProps) {
  const { t } = useTranslation()
  const isAmp = useAmp()
  const router = useRouter()
  const url = getUrl(router)

  if (!router.isFallback && !post?.slug) {
    return <ErrorPage statusCode={404} />
  }
  const postURL = `/posts/${post.slug}`

  const breadcrumbs = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      {
        '@type': 'ListItem',
        position: 1,
        item: {
          '@id': '/posts',
          url: '/posts',
          name: t('MENU_BLOG'),
        },
      },
      {
        '@type': 'ListItem',
        position: 2,
        item: {
          '@id': postURL,
          url: postURL,
          name: post.title,
        },
      },
    ],
  }

  return (
    <>
      <Helmet
        description={post.description}
        image={post.preview}
        title={`${post.title} | ${t('BLOG_TITLE')}`}
      >
        <link href={`${url}.amp`} rel='amphtml' />
        <meta content='article' property='og:type' />
        <meta
          content={post.author.firstName}
          property='og:article:author:first_name'
        />
        <meta
          content={post.author.lastName}
          property='og:article:author:last_name'
        />
        <meta
          content={post.author.username}
          property='og:article:author:username'
        />
        <meta
          content={post.author.gender}
          property='og:article:author:gender'
        />
        <meta content={post.published} property='og:article:published_time' />
        <meta content={post.modified} property='og:article:modified_time' />
        <script
          dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbs) }}
          type='application/ld+json'
        />
      </Helmet>
      {router.isFallback ? (
        <div>Loading…</div>
      ) : (
        <article
          itemScope
          className='post-full post h-entry'
          itemProp='blogPost'
          itemType='https://schema.org/Article'
        >
          {isAmp ? null : (
            <>
              <data
                className='u-photo'
                value='https://alexandr-sidorenko.me/avatar.jpg'
              />
              <data
                className='u-url'
                value={`https://alexandr-sidorenko.me${postURL}`}
              />
            </>
          )}
          <meta content={post.preview || '/images/me.png'} itemProp='image' />
          <header className='post-full-header'>
            <h1 className='post-full-title p-name' itemProp='headline'>
              {post.title}
            </h1>
            <meta
              className='p-author h-card'
              content={t('FULL_NAME')}
              itemProp='author'
            />
            <meta content={post.created} itemProp='dateCreated' />
            <Link
              as={isAmp ? `${postURL}?amp=1` : postURL}
              href='/posts/[slug]'
            >
              <a itemProp='url'>
                <time
                  className='text-center meta dt-published'
                  dateTime={post.published}
                  itemProp='datePublished'
                >
                  {distanceToNow(new Date(post.published))}
                </time>
              </a>
            </Link>
          </header>
          <section
            className='publicationContent e-content'
            dangerouslySetInnerHTML={{ __html: post.content }}
            itemProp='articleBody'
          />
        </article>
      )}
    </>
  )
}

export async function getStaticProps({
  params: { slug },
  locale,
}: {
  params: { slug: string }
  locale: Locale
}) {
  const post = getPostBySlug(
    slug,
    [
      'slug',
      'title',
      'author',
      'description',
      'created',
      'published',
      'modified',
      'content',
      'preview',
    ],
    locale,
  )
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
  return {
    paths: getAllLocalesPosts(['slug']).map(
      ({ slug, locale }: { slug: string; locale: Locale }) => ({
        params: { slug },
        locale,
      }),
    ),
    fallback: false,
  }
}
