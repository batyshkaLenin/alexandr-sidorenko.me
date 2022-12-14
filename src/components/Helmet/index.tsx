import Head from 'next/head'
import { useRouter } from 'next/router'
import React from 'react'
import useTranslation from 'lib/hooks/useTranslation'
import { getHost, getLocaleUrl, getUrl } from 'lib/urls'

type HelmetProps = {
  title?: string
  description?: string
  keywords?: string
  image?: string
  children?: React.ReactNode
}

const Helmet = ({
  title,
  description,
  keywords,
  image,
  children,
}: HelmetProps) => {
  const { t, locale } = useTranslation()
  const customTitle = title || t('FULL_NAME')
  const customDescription = description || t('HEAD_DESCRIPTION')
  const customKeywords = keywords || t('KEYWORDS')
  const router = useRouter()
  const url = getUrl(router)
  const canonicalUrl = url.replace('.amp', '')
  const localeUrl = getLocaleUrl(router, locale).replace('.amp', '')
  const host = getHost()
  const imageURl = `${host}${image}`

  return (
    <Head>
      <title>{customTitle}</title>

      {/* Technical */}
      <link href='https://mc.yandex.ru' rel='preconnect' />
      <link href='https://webring.xxiivv.com' rel='preconnect' />
      <link href='https://www.googletagmanager.com' rel='preconnect' />
      <link href='https://vitals.vercel-insights.com' rel='preconnect' />
      <link href='https://www.google-analytics.com' rel='preconnect' />

      {/* Basic */}
      <link href={canonicalUrl} rel='canonical' />
      <meta content={customTitle} name='title' />
      <meta content={customDescription} name='description' />
      <meta content={customKeywords} name='keywords' />
      <link
        href='/sitemap.xml'
        rel='sitemap'
        title='Sitemap'
        type='application/xml'
      />
      <link
        href={`/rss/${locale}/posts/feed.xml`}
        rel='alternate'
        title={t('BLOG_TITLE')}
        type='application/rss+xml'
      />
      <link
        href={`/rss/${locale}/posts/feed.json`}
        rel='alternate'
        title={t('BLOG_TITLE')}
        type='application/json'
      />
      <link
        href={`/rss/${locale}/creativity/feed.xml`}
        rel='alternate'
        title={t('CREATIVITY_TITLE')}
        type='application/rss+xml'
      />
      <link
        href={`/rss/${locale}/creativity/feed.json`}
        rel='alternate'
        title={t('CREATIVITY_TITLE')}
        type='application/json'
      />

      {/* Icons */}
      <link href='/favicon.ico' rel='shortcut icon' />
      <link href='/logo192.png' rel='apple-touch-icon' />

      {/* Twitter */}
      <meta content='summary' name='twitter:card' />
      <meta content={customTitle} name='twitter:title' />
      <meta content={imageURl} property='twitter:image' />
      <meta content={customTitle} property='twitter:image:alt' />
      <meta content={customDescription} property='twitter:description' />
      <meta content='@batyshkaLenin' property='twitter:site' />
      <meta content='@batyshkaLenin' name='twitter:creator' />

      {/* Open Graph */}
      <meta content={t('FULL_NAME')} property='og:site_name' />
      <meta
        content={locale === 'ru' ? 'ru-RU' : 'en-US'}
        property='og:locale'
      />
      <meta content={customTitle} property='og:title' />
      <meta content={imageURl} property='og:image' />
      <meta content={customDescription} property='og:description' />
      <meta content={localeUrl} property='og:url' />

      {/* Dublin Core */}
      <meta content={locale === 'ru' ? 'ru-RU' : 'en-US'} name='DC.language' />
      <meta content={`${host}/${locale}`} name='DC.publisher.url' />
      <meta content={localeUrl} name='DC.identifier' />
      <meta content={customTitle} name='DC.title' />
      <meta content={customDescription} name='DC.description' />
      <meta content={customKeywords} name='DC.subject' />
      <meta content='text' name='DC.type' />
      <meta content='text/html' name='DC.format' />

      {/* Web App */}
      <meta content={t('FULL_NAME')} name='apple-mobile-web-app-title' />
      <meta content='default' name='apple-mobile-web-app-status-bar-style' />
      <meta content={t('FULL_NAME')} name='application-name' />
      <meta content='#070707' name='theme-color' />
      <link href={`/manifest-${locale}.json`} rel='manifest' />

      {/* IndieWeb */}
      <link
        href='https://webmention.io/alexandr-sidorenko.me/webmention'
        rel='webmention'
      />
      <link
        href='https://webmention.io/alexandr-sidorenko.me/xmlrpc'
        rel='pingback'
      />
      <link href='https://alexandr-sidorenko.me/' rel='openid.delegate' />
      <link href='https://openid.indieauth.com/openid' rel='openid.server' />
      <link href='https://indieauth.com/auth' rel='authorization_endpoint' />
      <link href='https://tokens.indieauth.com/token' rel='token_endpoint' />
      <link href='https://aperture.p3k.io/microsub/791' rel='microsub' />
      <link href='https://merveilles.town/@batyshkaLenin' rel='me' />
      <link href='https://www.linkedin.com/in/alexandr-sidorenko/' rel='me' />
      <link href='https://career.habr.com/batyshkalenin' rel='me' />
      <link href='https://www.tiktok.com/@batyshkalenin' rel='me' />
      <link
        href='https://hh.ru/applicant/resumes/view?resume=6700a5c7ff0594c2ba0039ed1f425a6c4a7771'
        rel='me'
      />
      <link href='https://www.instagram.com/alexander_sidorenko/' rel='me' />
      <link href='https://www.facebook.com/sidorenko.alexandr' rel='me' />
      <link href='https://steamcommunity.com/id/batyshkaLenin/' rel='me' />
      <link href='/key.pub' rel='pgpkey' type='application/pgp-keys' />

      {/* Additional tags */}
      {children ? children : null}
    </Head>
  )
}

Helmet.defaultProps = {
  image: '/images/me.png',
  children: null,
}

export default Helmet
