import './index.css'
import { getCookie } from 'cookies-next'
import withYM from 'next-ym'
import getConfig from 'next/config'
import NextApp, { AppContext } from 'next/app'

import Head from 'next/head'
import Header from '../components/Header'
import Footer from '../components/Footer'
import {Router, useRouter} from 'next/router'

const { publicRuntimeConfig, serverRuntimeConfig } = getConfig()

function _App({ Component, pageProps }) {
  const { basePath } = useRouter()
  return (
    <>
      <Head>
        <meta
          content='width=device-width, height=device-height, initial-scale=1, maximum-scale=1, minimum-scale=1'
          name='viewport'
        />
        <meta charSet='utf-8' />
        <style>
          {`@import url('${basePath}/fonts/fonts.css');`}
        </style>
      </Head>

      <div className='root'>
        <Header />
        <main>
          <Component {...pageProps} />
        </main>
        <Footer />
      </div>
    </>
  )
}

_App.displayName = 'App'

const isServerSide = typeof window === 'undefined'
const { YM_CODE } = isServerSide ? serverRuntimeConfig : publicRuntimeConfig

const App = withYM(YM_CODE, Router)(_App)

App.getInitialProps = async (appCtx: AppContext) => {
  const appProps = await NextApp.getInitialProps(appCtx)
  const theme = getCookie('theme', { req: appCtx.ctx.req })

  return {
    pageProps: { ...appProps.pageProps, theme },
  }
}

export default App
