import { useRouter } from 'next/router'
import { useAmp } from 'next/amp'
import ErrorPage from 'next/error'
import { distanceToNow } from '../../lib/dates'
import { getAllCreation, getCreationBySlug, markdownToHtml, Creation } from '../../lib/markdown'
import Helmet from "../../components/Helmet"
import Link from 'next/link'
import { getUrl } from "../../lib/urls"
import {getPublicationAdditionalTitle} from "../../components/publication/list";

export const config = { amp: 'hybrid' }

type CreationPageProps = {
  creation: Pick<Creation, 'slug' | 'title' | 'author'| 'description' | 'created' | 'modified' | 'content' | 'preview' | 'creationType'>
}

export default function CreationPage({ creation }: CreationPageProps) {
  const isAmp = useAmp()
  const router = useRouter()
  const url = getUrl(router)

  if (!router.isFallback && !creation?.slug) {
    return <ErrorPage statusCode={404} />
  }
  const creationURL = `/creation/${creation.slug}`
  const additionalTitle = getPublicationAdditionalTitle('creation', creation.creationType)
  const typedTitle = `${additionalTitle && `${additionalTitle} `} "${creation.title}"`

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
                  "@id": "/creation",
                  "url": "/creation",
                  "name": "Творчество",
                },
          },
          {
            "@type": "ListItem",
            "position": 2,
            "item":
                {
                  "@id": creationURL,
                  "url": creationURL,
                  "name": creation.title,
                },
          },
        ],
  }

  return (
    <>
      <Helmet title={`${typedTitle} | ${additionalTitle} Александра Сидоренко`} description={creation.description} image={creation.preview}>
        <link rel="amphtml" href={`${url}.amp`} />
        <meta content='article' property='og:type' />
        <meta content={creation.author.firstName} property='og:article:author:first_name'/>
        <meta content={creation.author.lastName} property='og:article:author:last_name'/>
        <meta content={creation.author.username} property='og:article:author:username'/>
        <meta content={creation.author.gender} property='og:article:author:gender'/>
        <meta content={creation.created} property='og:article:published_time' />
        <meta content={creation.modified} property='og:article:modified_time' />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbs) }}/>
      </Helmet>
      {router.isFallback ? (
        <div>Loading…</div>
      ) : (
        <article itemScope itemType="https://schema.org/Article">
          <meta itemProp="image" content={creation.preview || '/images/me.png'} />
          <header>
            <h1>{additionalTitle && `${additionalTitle} `} &quot;<span itemProp="headline">{creation.title}</span>&quot;</h1>
            <meta itemProp="author" content="Александр Сидоренко" />
            <Link as={isAmp ? `${creationURL}?amp=1` : creationURL} href="/creation/[slug]" >
              <a
                  itemProp="url"
              >
                <time
                    itemProp="dateCreated"
                    dateTime={creation.created}
                >
                  {distanceToNow(new Date(creation.created))}
                </time>
              </a>
            </Link>
          </header>
          <section
            className='publicationContent'
            itemProp="articleBody"
            dangerouslySetInnerHTML={{ __html: creation.content }}
          />
        </article>
      )}
    </>
  )
}

export async function getStaticProps({ params }) {
  const creation = getCreationBySlug(params.slug, [
    'slug',
    'title',
    'author',
    'description',
    'created',
    'modified',
    'content',
    'preview',
    'creationType',
  ])
  const content = await markdownToHtml(creation.content || '')

  return {
    props: {
      creation: {
        ...creation,
        content,
      },
    },
  }
}

export async function getStaticPaths() {
  const creation = getAllCreation(['slug'])

  return {
    paths: creation.map(({ slug }) => ({
      params: {
        slug,
      },
    })),
    fallback: false,
  }
}
