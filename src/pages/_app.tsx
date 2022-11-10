import '../styles/index.css'
import '../../public/fonts/fonts.css'
import { Analytics } from '@vercel/analytics/react'
// @ts-expect-error "Yandex Metrika without types"
import withYM from 'next-ym'
import { useAmp } from 'next/amp'
import getConfig from 'next/config'

import Head from 'next/head'
import Router from 'next/router'
import Script from 'next/script'
import { useEffect } from 'react'
import NextApp, { AppContext, AppInitialProps } from 'next/app'
import { Footer, Header } from '../components/layout'
import { useLocalStorage } from '../lib/hooks'
import { Theme } from '../lib/types'

const { publicRuntimeConfig, serverRuntimeConfig } = getConfig()
const isServerSide = typeof window === 'undefined'
const { YM_CODE, GA_CODE } = isServerSide
  ? serverRuntimeConfig
  : publicRuntimeConfig

function _App({ Component, pageProps }: AppContext & AppInitialProps) {
  const isAmp = useAmp()
  const [theme, setTheme] = useLocalStorage<Theme>(Theme.Dark, 'theme')

  useEffect(() => {
    document.body.setAttribute('data-theme', theme)
  }, [theme])

  return (
    <>
      <Head>
        {isAmp ? null : (
          <meta
            content='minimum-scale=1, initial-scale=1, width=device-width, shrink-to-fit=no, viewport-fit=cover'
            name='viewport'
          />
        )}
        <meta charSet='utf-8' />
      </Head>

      <div className='root'>
        <Header setTheme={setTheme} theme={theme} />
        <main>
          <Component {...pageProps} />
        </main>
        <Footer theme={theme} />
      </div>
      <Analytics />
      <Script
        async
        id='ext-ga'
        src={`https://www.googletagmanager.com/gtag/js?id=${GA_CODE}`}
        strategy='afterInteractive'
      />
      <Script
        id='int-ga'
        strategy='afterInteractive'
      >{`window.dataLayer = window.dataLayer || []; function gtag(){dataLayer.push(arguments);} gtag('js', new Date()); gtag('config', '${GA_CODE}');`}</Script>
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
