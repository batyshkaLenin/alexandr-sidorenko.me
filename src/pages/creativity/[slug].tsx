import {useRouter} from 'next/router'
import {useAmp} from 'next/amp'
import ErrorPage from 'next/error'
import {distanceToNow} from '../../lib/dates'
import {Creativity, getAllCreativity, getCreativityBySlug, markdownToHtml, TriggerWarning} from '../../lib/markdown'
import Helmet from "../../components/Helmet"
import Link from 'next/link'
import {getUrl} from "../../lib/urls"
import {getPublicationAdditionalTitle} from "../../components/publication/list";
import useTranslation from "../../lib/hooks/useTranslation";
import locales from "../../../public/locales/index";

export const config = { amp: 'hybrid' }

function getTriggerWarningText(tw: TriggerWarning, locale: 'ru' | 'en') {
  switch (tw) {
    case TriggerWarning.Adulthood:
      return locales[locale]["TW_ADULTHOOD"]
    case TriggerWarning.Religion:
      return locales[locale]["TW_RELIGION"]
    case TriggerWarning.Addiction:
      return locales[locale]["TW_ADDICTION"]
    case TriggerWarning.Translation:
      return locales[locale]["TW_TRANSLATION"]
  }
}

type CreativityPageProps = {
  creativity: Pick<Creativity, 'slug' | 'title' | 'author'| 'description' | 'created' | 'published' | 'modified' | 'content' | 'preview' | 'creativityType' | 'audio' | 'tw'>
}

export default function CreativityPage({ creativity }: CreativityPageProps) {
  const { t, locale, isForeign } = useTranslation();
  const isAmp = useAmp()
  const router = useRouter()
  const url = getUrl(router)

  if (!router.isFallback && !creativity?.slug) {
    return <ErrorPage statusCode={404} />
  }
  const creativityURL = `/creativity/${creativity.slug}`
  const originalURL = creativityURL.replace('/en', '')
  const additionalTitle = getPublicationAdditionalTitle(locale,'creativity', creativity.creativityType)
  const typedTitle = `${additionalTitle && `${additionalTitle} `} "${creativity.title}"`

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
                  "@id": "/creativity",
                  "url": "/creativity",
                  "name": t('MENU_CREATIVITY'),
                },
          },
          {
            "@type": "ListItem",
            "position": 2,
            "item":
                {
                  "@id": creativityURL,
                  "url": creativityURL,
                  "name": creativity.title,
                },
          },
        ],
  }

  const audio = creativity.audio ? creativity.audio.reduce((acc, filepath) => {
    if (filepath.includes('.mp3')) acc["audio/mpeg"] = filepath;
    if (filepath.includes('.wav')) acc["audio/wav"] = filepath;
    return acc;
  }, {}) : {};

  return (
    <>
      <Helmet title={`${typedTitle} | ${t('CREATIVITY_TITLE')}`} description={creativity.description} image={creativity.preview}>
        <link rel="amphtml" href={`${url}.amp`} />
        <meta content='article' property='og:type' />
        <meta content={creativity.author.firstName} property='og:article:author:first_name'/>
        <meta content={creativity.author.lastName} property='og:article:author:last_name'/>
        <meta content={creativity.author.username} property='og:article:author:username'/>
        <meta content={creativity.author.gender} property='og:article:author:gender'/>
        <meta content={creativity.published} property='og:article:published_time' />
        <meta content={creativity.modified} property='og:article:modified_time' />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbs) }}/>
      </Helmet>
      {router.isFallback ? (
        <div>Loading…</div>
      ) : (
        <article itemScope itemType="https://schema.org/Article">
          {isAmp ? null : (<>
            <data className="u-photo" value="https://alexandr-sidorenko.me/avatar.jpg" />
            <data className="u-url" value={`https://alexandr-sidorenko.me${creativityURL}`} />
          </>)}
          <meta itemProp="image" content={creativity.preview || '/images/me.png'} />
          <header>
            <h1>{additionalTitle && `${additionalTitle} `} &quot;<span itemProp="headline">{creativity.title}</span>&quot;</h1>
            <meta itemProp="author" content={t('FULL_NAME')} />
            <section className="dateBox">
              <span>
                {t('PUBLISHED')}: <Link as={isAmp ? `${creativityURL}?amp=1` : creativityURL} href="/creativity/[slug]" >
                <a
                    itemProp="url"
                >
                  <time
                      itemProp="datePublished"
                      dateTime={creativity.published}
                  >
                    {distanceToNow(new Date(creativity.published), locale)}
                  </time>
                </a>
              </Link>
              </span>
              {isForeign ? <Link as={isAmp ? `${creativityURL}?amp=1` : creativityURL} href="/creativity/[slug]" locale={'ru'}><a>Read in the original language</a></Link> : null}
              <span>
                {t('CREATED')}: <Link as={isAmp ? `${creativityURL}?amp=1` : creativityURL} href="/creativity/[slug]" >
                <a
                    itemProp="url"
                >
                  <time itemProp="dateCreated" dateTime={creativity.created}>{distanceToNow(new Date(creativity.created), locale)}</time>
                </a>
              </Link>
              </span>
            </section>
          </header>
          {creativity.tw && creativity.tw.length ? (<>
            <hr />
            <section className='publicationContent'>
              {creativity.tw.map((tw, index) => {
                return (<blockquote key={index}><p>{getTriggerWarningText(tw, locale)}</p></blockquote>)
              })}
            </section>
            <hr />
          </>) : null}
          {audio && Object.keys(audio).length ? isAmp ? (<amp-audio controls="true">
            {Object.keys(audio).map((mime, key) => (<source key={key} type={mime} src={audio[mime]} />))}
          </amp-audio>) : (<audio controls>
            {Object.keys(audio).map((mime, key) => (<source key={key} type={mime} src={audio[mime]} />))}
          </audio>) : null}
          <section
            className='publicationContent e-content'
            itemProp="articleBody"
            dangerouslySetInnerHTML={{ __html: creativity.content }}
          />
        </article>
      )}
    </>
  )
}

export async function getStaticProps({ params, locale }) {
  const creativity = getCreativityBySlug(params.slug, [
    'slug',
    'title',
    'author',
    'description',
    'created',
    'published',
    'modified',
    'content',
    'preview',
    'creativityType',
    'audio',
    'tw',
  ], locale)
  const content = await markdownToHtml(creativity.content || '')

  return {
    props: {
      creativity: {
        ...creativity,
        content,
      },
    },
  }
}

export async function getStaticPaths() {
  const creativityRU = getAllCreativity(['slug'], 'ru')
  const creativityEN = getAllCreativity(['slug'], 'en')
  const localeFeeds = { ru: creativityRU, en: creativityEN };

  return {
    paths: Object.keys(localeFeeds).flatMap(locale => {
      return localeFeeds[locale].map(path => {
        return { params: { slug: path.slug }, locale }
      })
    }),
    fallback: false,
  }
}
