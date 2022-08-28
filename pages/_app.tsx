import './index.css'
import '../public/fonts/fonts.css'
import withYM from 'next-ym'
import getConfig from 'next/config'
import NextApp, { AppContext } from 'next/app'

import Head from 'next/head'
import Header from '../components/Header'
import Footer from '../components/Footer'
import Router from 'next/router'
import {useAmp} from "next/amp";

const { publicRuntimeConfig, serverRuntimeConfig } = getConfig()

function _App({ Component, pageProps }) {
  const isAmp = useAmp()
  return (
    <>
      <Head>
        {isAmp ? null : <meta name="viewport" content="width=device-width, initial-scale=1" />}
        <meta charSet='utf-8' />
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

  return {
    pageProps: { ...appProps.pageProps },
  }
}

export default App
