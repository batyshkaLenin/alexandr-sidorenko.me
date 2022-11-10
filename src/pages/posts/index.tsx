import Helmet from '../../components/Helmet'
import { PublicationList } from '../../components/publication/list'
import useTranslation from '../../lib/hooks/useTranslation'
import { getAllPosts } from '../../lib/markdown'
import { Locale, PostPreview } from '../../lib/types'

type PostPageProps = {
  posts: PostPreview[]
}

const PostsPage = ({ posts }: PostPageProps) => {
  const { t } = useTranslation()
  const description = t('BLOG_DESCRIPTION')

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
    ],
  }

  return (
    <>
      <Helmet description={description} title={t('BLOG_TITLE')}>
        <meta content='website' property='og:type' />
        <script
          dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbs) }}
          type='application/ld+json'
        />
      </Helmet>
      <PublicationList publications={posts} type='post' />
    </>
  )
}

export async function getStaticProps({ locale }: { locale: Locale }) {
  const posts = getAllPosts(
    ['slug', 'title', 'description', 'modified', 'created', 'author'],
    locale,
  )
  return {
    props: { posts },
  }
}

export default PostsPage
