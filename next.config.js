module.exports = {
  reactStrictMode: true,
  ignoreDevErrors: false,
  experimental: {
    scrollRestoration: true
  },
  serverRuntimeConfig: {
    YM_CODE: process.env.YANDEX_METRICS_CODE,
    HOST: process.env.HOST
  },
  publicRuntimeConfig: {
    YM_CODE: process.env.NEXT_PUBLIC_YANDEX_METRICS_CODE,
    HOST: process.env.NEXT_PUBLIC_HOST
  },
};
