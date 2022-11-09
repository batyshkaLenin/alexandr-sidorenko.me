import {useRouter} from 'next/router'
import {useAmp} from 'next/amp'
import ErrorPage from 'next/error'
import {distanceToNow} from '../../lib/dates'
import {Creation, getAllCreation, getCreationBySlug, markdownToHtml, TriggerWarning } from '../../lib/markdown'
import Helmet from "../../components/Helmet"
import Link from 'next/link'
import {getUrl} from "../../lib/urls"
import {getPublicationAdditionalTitle} from "../../components/publication/list";

export const config = { amp: 'hybrid' }

function getTriggerWarningText(tw: TriggerWarning) {
  switch (tw) {
    case TriggerWarning.Adulthood:
      return 'Материал предназначен для лиц старше 18 лет.'
    case TriggerWarning.Religion:
      return 'Данное сообщение (материал), описывает душевные терзания разочарованного в жизни человека, выполняющим функции лирического героя и не несёт в себе цели оскорбления чувств верующих. Если вы чувствительны к этой теме немедленно прекратите чтение страницы и закройте вкладку браузера.'
    case TriggerWarning.Addiction:
      return 'В данном материале упомянуты реалистичные сцены употребления алкоголя, табачных изделий и (или) других наркотических или психоактивных веществ. Их употребление опасно для здоровья и (или) запрещено законом.'
  }
}

type CreationPageProps = {
  creation: Pick<Creation, 'slug' | 'title' | 'author'| 'description' | 'created' | 'published' | 'modified' | 'content' | 'preview' | 'creationType' | 'audio' | 'tw'>
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

  const audio = creation.audio ? creation.audio.reduce((acc, filepath) => {
    if (filepath.includes('.mp3')) acc["audio/mpeg"] = filepath;
    if (filepath.includes('.wav')) acc["audio/wav"] = filepath;
    return acc;
  }, {}) : {};

  return (
    <>
      <Helmet title={`${typedTitle} | Творчество Александра Сидоренко`} description={creation.description} image={creation.preview}>
        <link rel="amphtml" href={`${url}.amp`} />
        <meta content='article' property='og:type' />
        <meta content={creation.author.firstName} property='og:article:author:first_name'/>
        <meta content={creation.author.lastName} property='og:article:author:last_name'/>
        <meta content={creation.author.username} property='og:article:author:username'/>
        <meta content={creation.author.gender} property='og:article:author:gender'/>
        <meta content={creation.published} property='og:article:published_time' />
        <meta content={creation.modified} property='og:article:modified_time' />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbs) }}/>
      </Helmet>
      {router.isFallback ? (
        <div>Loading…</div>
      ) : (
        <article itemScope itemType="https://schema.org/Article">
          <data className="u-photo" value="https://alexandr-sidorenko.me/avatar.jpg" />
          <data className="u-url" value={`https://alexandr-sidorenko.me${creationURL}`} />
          <meta itemProp="image" content={creation.preview || '/images/me.png'} />
          <header>
            <h1>{additionalTitle && `${additionalTitle} `} &quot;<span itemProp="headline">{creation.title}</span>&quot;</h1>
            <meta itemProp="author" content="Александр Сидоренко" />
            <section className="dateBox">
              <span>
                Опубликовано: <Link as={isAmp ? `${creationURL}?amp=1` : creationURL} href="/creation/[slug]" >
                <a
                    itemProp="url"
                >
                  <time
                      itemProp="datePublished"
                      dateTime={creation.published}
                  >
                    {distanceToNow(new Date(creation.published))}
                  </time>
                </a>
              </Link>
              </span>
              <span>
                Создано: <Link as={isAmp ? `${creationURL}?amp=1` : creationURL} href="/creation/[slug]" >
                <a
                    itemProp="url"
                >
                  <time itemProp="dateCreated" dateTime={creation.created}>{distanceToNow(new Date(creation.created))}</time>
                </a>
              </Link>
              </span>
            </section>
          </header>
          {creation.tw && creation.tw.length ? (<>
            <hr />
            <section className='publicationContent'>
              {creation.tw.map((tw, index) => {
                return (<blockquote key={index}><p>{getTriggerWarningText(tw)}</p></blockquote>)
              })}
            </section>
            <hr />
          </>) : null}
          {audio && Object.keys(audio).length ? (<audio controls>
            {Object.keys(audio).map((mime, key) => (<source key={key} type={mime} src={audio[mime]} />))}
          </audio>) : null}
          <section
            className='publicationContent e-content'
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
    'published',
    'modified',
    'content',
    'preview',
    'creationType',
    'audio',
    'tw',
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
