const siteURL = process.env.NEXT_PUBLIC_HOST || 'https://alexandr-sidorenko.me';

/** @type {import('next-sitemap').IConfig} */
module.exports = {
  siteUrl: siteURL,
  generateRobotsTxt: true,
  robotsTxtOptions: {
    policies: [
      {
        userAgent: '*',
        disallow: `${siteURL}/creation`
      }
    ]
  }
}
