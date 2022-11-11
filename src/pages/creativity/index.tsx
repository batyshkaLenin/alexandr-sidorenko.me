import Helmet from 'components/Helmet'
import { PublicationList } from 'components/publication/list'
import useTranslation from 'lib/hooks/useTranslation'
import { getAllCreativity } from 'lib/markdown'
import { CreativityPreview, Locale } from 'lib/types'

type CreativityPageProps = {
  creativity: CreativityPreview[]
}

const CreativityPage = ({ creativity }: CreativityPageProps) => {
  const { t } = useTranslation()
  const description = t('CREATIVITY_DESCRIPTION')

  const breadcrumbs = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      {
        '@type': 'ListItem',
        position: 1,
        item: {
          '@id': '/creativity',
          url: '/creativity',
          name: t('MENU_CREATIVITY'),
        },
      },
    ],
  }

  return (
    <>
      <Helmet description={description} title={t('CREATIVITY_TITLE')}>
        <meta content='website' property='og:type' />
        <script
          dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbs) }}
          type='application/ld+json'
        />
      </Helmet>
      <PublicationList publications={creativity} type='creativity' />
    </>
  )
}

export async function getStaticProps({ locale }: { locale: Locale }) {
  const creativity = getAllCreativity(
    [
      'slug',
      'title',
      'description',
      'modified',
      'created',
      'author',
      'creativityType',
    ],
    locale,
  )
  return {
    props: { creativity },
  }
}

export default CreativityPage
