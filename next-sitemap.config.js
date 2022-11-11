/* eslint-disable @typescript-eslint/no-var-requires */
const path = require('path')
const siteURL = process.env.NEXT_PUBLIC_HOST || 'https://alexandr-sidorenko.me'

/** @type {import('next-sitemap').IConfig} */
module.exports = {
  siteUrl: siteURL,
  exclude: ['/404', '/en/404'],
  robotsTxtOptions: {
    policies: [
      {
        userAgent: '*',
        disallow: ['/404', '/en/404'],
      },
      { userAgent: '*', allow: '/' },
    ],
  },
  generateRobotsTxt: true,
  optimizeFonts: true,
  devBrowserSourceMaps: true,
  sassOptions: {
    includePaths: [path.join(__dirname, 'styles')],
  },
}
