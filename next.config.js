const withPWA = require("next-pwa")
const runtimeCaching = require('next-pwa/cache')

module.exports = withPWA({
  dest: "public",
  publicExcludes: ['!rss/*', '!sitemap.xml', '!sitemap-*.xml'],
  register: true,
  skipWaiting: true,
  cacheOnFrontEndNav: true,
  runtimeCaching,
})({
  reactStrictMode: true,
  experimental: {
    amp: {
      skipValidation: true,
    },
  },
  future: {
    webpack5: true,
  },
  webpack(config) {
    config.resolve.fallback = {
      ...config.resolve.fallback,
      fs: false,
    };
    return config;
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
});
