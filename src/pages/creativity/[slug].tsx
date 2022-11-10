import { useAmp } from 'next/amp'
import ErrorPage from 'next/error'
import Link from 'next/link'
import { useRouter } from 'next/router'
import Helmet from '../../components/Helmet'
import { getPublicationAdditionalTitle } from '../../components/publication/list'
import { distanceToNow } from '../../lib/dates'
import useTranslation from '../../lib/hooks/useTranslation'
import locales from '../../lib/locales'
import {
  Creativity,
  getAllLocalesCreativity,
  getCreativityBySlug,
  markdownToHtml,
  TriggerWarning,
} from '../../lib/markdown'
import { Locale } from '../../lib/types'
import { getUrl } from '../../lib/urls'

export const config = { amp: 'hybrid' }

function getTriggerWarningText(tw: TriggerWarning, locale: Locale = Locale.RU) {
  switch (tw) {
    case TriggerWarning.Adulthood:
      return locales[locale]['TW_ADULTHOOD']
    case TriggerWarning.Religion:
      return locales[locale]['TW_RELIGION']
    case TriggerWarning.Addiction:
      return locales[locale]['TW_ADDICTION']
    case TriggerWarning.Translation:
      return locales[locale]['TW_TRANSLATION']
    default:
      return undefined
  }
}

type CreativityPageProps = {
  creativity: Pick<
    Creativity,
    | 'slug'
    | 'title'
    | 'author'
    | 'description'
    | 'created'
    | 'published'
    | 'modified'
    | 'content'
    | 'preview'
    | 'creativityType'
    | 'audio'
    | 'tw'
  >
}

export default function CreativityPage({ creativity }: CreativityPageProps) {
  const { t, locale, isForeign } = useTranslation()
  const isAmp = useAmp()
  const router = useRouter()
  const url = getUrl(router)
  const creativityURL = `/creativity/${creativity.slug}`
  const additionalTitle = getPublicationAdditionalTitle(
    locale,
    'creativity',
    creativity.creativityType,
  )
  const typedTitle = `${additionalTitle && `${additionalTitle} `} "${
    creativity.title
  }"`

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
      {
        '@type': 'ListItem',
        position: 2,
        item: {
          '@id': creativityURL,
          url: creativityURL,
          name: creativity.title,
        },
      },
    ],
  }

  const audio = creativity.audio
    ? creativity.audio.reduce(
        (acc: Record<string, string>, filepath: string) => {
          if (filepath.includes('.mp3')) acc['audio/mpeg'] = filepath
          if (filepath.includes('.wav')) acc['audio/wav'] = filepath
          return acc
        },
        {},
      )
    : {}

  return (
    <>
      <Helmet
        description={creativity.description}
        image={creativity.preview}
        title={`${typedTitle} | ${t('CREATIVITY_TITLE')}`}
      >
        <link href={`${url}.amp`} rel='amphtml' />
        <meta content='article' property='og:type' />
        <meta
          content={creativity.author.firstName}
          property='og:article:author:first_name'
        />
        <meta
          content={creativity.author.lastName}
          property='og:article:author:last_name'
        />
        <meta
          content={creativity.author.username}
          property='og:article:author:username'
        />
        <meta
          content={creativity.author.gender}
          property='og:article:author:gender'
        />
        <meta
          content={creativity.published}
          property='og:article:published_time'
        />
        <meta
          content={creativity.modified}
          property='og:article:modified_time'
        />
        <script
          dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbs) }}
          type='application/ld+json'
        />
      </Helmet>

      <article itemScope itemType='https://schema.org/Article'>
        {isAmp ? null : (
          <>
            <data
              className='u-photo'
              value='https://alexandr-sidorenko.me/avatar.jpg'
            />
            <data
              className='u-url'
              value={`https://alexandr-sidorenko.me${creativityURL}`}
            />
          </>
        )}
        <meta
          content={creativity.preview || '/images/me.png'}
          itemProp='image'
        />
        <header>
          <h1>
            {additionalTitle && `${additionalTitle} `} &quot;
            <span itemProp='headline'>{creativity.title}</span>&quot;
          </h1>
          <meta content={t('FULL_NAME')} itemProp='author' />
          <section className='dateBox'>
            <span>
              {t('PUBLISHED')}:{' '}
              <Link
                as={isAmp ? `${creativityURL}?amp=1` : creativityURL}
                href='/creativity/[slug]'
              >
                <a itemProp='url'>
                  <time
                    dateTime={creativity.published}
                    itemProp='datePublished'
                  >
                    {distanceToNow(new Date(creativity.published), locale)}
                  </time>
                </a>
              </Link>
            </span>
            {isForeign ? (
              <Link
                as={isAmp ? `${creativityURL}?amp=1` : creativityURL}
                href='/creativity/[slug]'
                locale='ru'
              >
                <a>Read in the original language</a>
              </Link>
            ) : null}
            <span>
              {t('CREATED')}:{' '}
              <Link
                as={isAmp ? `${creativityURL}?amp=1` : creativityURL}
                href='/creativity/[slug]'
              >
                <a itemProp='url'>
                  <time dateTime={creativity.created} itemProp='dateCreated'>
                    {distanceToNow(new Date(creativity.created), locale)}
                  </time>
                </a>
              </Link>
            </span>
          </section>
        </header>
        {creativity.tw && creativity.tw.length ? (
          <>
            <hr />
            <section className='publicationContent'>
              {creativity.tw.map((tw, index) => (
                <blockquote key={index}>
                  <p>{getTriggerWarningText(tw, locale)}</p>
                </blockquote>
              ))}
            </section>
            <hr />
          </>
        ) : null}
        {audio && Object.keys(audio).length ? (
          isAmp ? (
            <amp-audio controls='true'>
              {Object.keys(audio).map((mime, key) => (
                <source key={key} src={audio[mime]} type={mime} />
              ))}
            </amp-audio>
          ) : (
            <audio controls>
              {Object.keys(audio).map((mime, key) => (
                <source key={key} src={audio[mime]} type={mime} />
              ))}
            </audio>
          )
        ) : null}
        <section
          className='publicationContent e-content'
          dangerouslySetInnerHTML={{ __html: creativity.content }}
          itemProp='articleBody'
        />
      </article>
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
  const creativity = getCreativityBySlug(
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
      'creativityType',
      'audio',
      'tw',
    ],
    locale,
  )
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
  return {
    paths: getAllLocalesCreativity(['slug']).map(
      ({ slug, locale }: { slug: string; locale: Locale }) => ({
        params: { slug },
        locale,
      }),
    ),
    fallback: false,
  }
}
