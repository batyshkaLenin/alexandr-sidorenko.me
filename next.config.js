module.exports = {
  reactStrictMode: true,
  ignoreDevErrors: false,
  serverRuntimeConfig: {
    YM_CODE: process.env.NEXT_PUBLIC_YM_CODE,
    HOST: process.env.NEXT_PUBLIC_HOST,
  },
  publicRuntimeConfig: {
    YM_CODE: process.env.NEXT_PUBLIC_YM_CODE,
    HOST: process.env.NEXT_PUBLIC_HOST,
  },
};
