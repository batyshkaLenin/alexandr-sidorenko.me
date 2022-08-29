const path = require('path')
const siteURL = process.env.NEXT_PUBLIC_HOST || 'https://alexandr-sidorenko.me';

/** @type {import('next-sitemap').IConfig} */
module.exports = {
  siteUrl: siteURL,
  generateRobotsTxt: true,
  optimizeFonts: true,
  devBrowserSourceMaps: true,
  sassOptions: {
    includePaths: [path.join(__dirname, 'styles')],
  },
}
