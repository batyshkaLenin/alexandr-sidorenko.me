/* eslint-disable @typescript-eslint/no-var-requires */
var { withSentryConfig } = require('@sentry/nextjs')
const ForkTsCheckerWebpackPlugin = require('fork-ts-checker-webpack-plugin')
const withPWA = require('next-pwa')
const runtimeCaching = require('next-pwa/cache')

module.exports = withPWA({
  disable: process.env.NODE_ENV === 'development',
  dest: 'public',
  publicExcludes: ['!rss/*', '!sitemap.xml', '!sitemap-*.xml'],
  register: true,
  skipWaiting: true,
  cacheOnFrontEndNav: true,
  runtimeCaching,
})(
  withSentryConfig(
    {
      reactStrictMode: true,
      experimental: {
        forceSwcTransforms: true,
        amp: {
          skipValidation: true,
        },
      },
      images: {
        domains: ['webring.xxiivv.com'],
        dangerouslyAllowSVG: true,
        contentSecurityPolicy:
          "default-src 'self'; script-src 'none'; sandbox;",
      },
      i18n: {
        locales: ['en', 'ru'],
        defaultLocale: 'ru',
      },
      async redirects() {
        return [
          {
            source: '/post/:slug',
            destination: '/posts/:slug',
            permanent: true,
          },
          {
            source: '/blog/:slug',
            destination: '/posts/:slug',
            permanent: true,
          },
          {
            source: '/blog',
            destination: '/posts',
            permanent: true,
          },
          {
            source: '/music',
            destination: '/creativity',
            permanent: true,
          },
          {
            source: '/creation',
            destination: '/creativity',
            permanent: true,
          },
          {
            source: '/creation/:slug',
            destination: '/creativity/:slug',
            permanent: true,
          },
          {
            source: '/assets/creation/:path*',
            destination: '/assets/creativity/:path*',
            permanent: true,
          },
          {
            source: '/rss/creation/feed.xml',
            destination: '/rss/ru/creativity/feed.xml',
            permanent: true,
          },
          {
            source: '/rss/posts/feed.xml',
            destination: '/rss/ru/posts/feed.xml',
            permanent: true,
          },
          {
            source: '/rss/creation/feed.json',
            destination: '/rss/ru/creativity/feed.json',
            permanent: true,
          },
          {
            source: '/rss/posts/feed.json',
            destination: '/rss/ru/posts/feed.json',
            permanent: true,
          },
        ]
      },
      webpack: (config, { dev, isServer }) => {
        if (dev && !isServer) {
          config.plugins.push(new ForkTsCheckerWebpackPlugin())
        }
        config.resolve.fallback = {
          ...config.resolve.fallback,
          fs: false,
        }

        return config
      },
      serverRuntimeConfig: {
        GA_CODE: process.env.NEXT_PUBLIC_GA_CODE,
        YM_CODE: process.env.NEXT_PUBLIC_YM_CODE,
        HOST: process.env.NEXT_PUBLIC_HOST,
      },
      publicRuntimeConfig: {
        GA_CODE: process.env.NEXT_PUBLIC_GA_CODE,
        YM_CODE: process.env.NEXT_PUBLIC_YM_CODE,
        HOST: process.env.NEXT_PUBLIC_HOST,
      },
    },
    {
      silent: true,
    },
  ),
)
