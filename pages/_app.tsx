import './index.css'
import '../public/fonts/fonts.css'
import withYM from 'next-ym'
import getConfig from 'next/config'
import NextApp, { AppContext } from 'next/app'

import Head from 'next/head'
import { Header, Footer } from '../components/layout'
import Router from 'next/router'
import {useAmp} from "next/amp";
import Script from "next/script";

const { publicRuntimeConfig, serverRuntimeConfig } = getConfig()
const isServerSide = typeof window === 'undefined'
const { YM_CODE, GA_CODE } = isServerSide ? serverRuntimeConfig : publicRuntimeConfig

function _App({ Component, pageProps }) {
  const isAmp = useAmp()
  return (
    <>
      <Head>
        {isAmp ? null : <meta
            name='viewport'
            content='minimum-scale=1, initial-scale=1, width=device-width, shrink-to-fit=no, user-scalable=no, viewport-fit=cover'
        />}
        <meta charSet='utf-8' />
      </Head>

      <div className='root'>
        <Header />
        <main>
          <Component {...pageProps} />
        </main>
        <Footer />
      </div>
       <Script id='ext-ga' async src={`https://www.googletagmanager.com/gtag/js?id=${GA_CODE}`} strategy="afterInteractive" />
       <Script id='int-ga' strategy="afterInteractive">{`window.dataLayer = window.dataLayer || []; function gtag(){dataLayer.push(arguments);} gtag('js', new Date()); gtag('config', '${GA_CODE}');`}</Script>
    </>
  )
}

_App.displayName = 'App'

const App = withYM(YM_CODE, Router)(_App)

App.getInitialProps = async (appCtx: AppContext) => {
    const appProps = await NextApp.getInitialProps(appCtx)

    return {
        pageProps: { ...appProps.pageProps },
    }
}

export default App
