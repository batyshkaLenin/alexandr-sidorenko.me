import type { NextPage } from 'next'
import Link from 'next/link'
import Helmet from '../components/Helmet'
import locales from '../lib/locales'
import { Locale } from '../lib/types'
import styles from '../styles/Error.module.scss'

const getData = (code?: number, locale: Locale = Locale.RU) => {
  switch (code) {
    case 404:
      return {
        title: locales[locale]['NOT_FOUND'],
        linkText: locales[locale]['BACK_TO_MAIN_PAGE'],
        linkUrl: '/',
      }
    case 500:
    default:
      return {
        title: locales[locale]['UNKNOWN_ERROR'],
        linkText: locales[locale]['RESTART'],
        linkUrl: '',
      }
  }
}

const ErrorPage: NextPage<{ statusCode?: number; locale: Locale }> = ({
  statusCode,
  locale,
}) => {
  const { title, linkUrl, linkText } = getData(statusCode, locale)
  return (
    <>
      <Helmet title={title}>
        <meta content='noindex,nofollow,noarchive' name='robots' />
      </Helmet>
      <div className={styles.errorBlock}>
        {!!statusCode && (
          <>
            <span>{title}</span>
            <Link href={linkUrl}>{linkText}</Link>
          </>
        )}
      </div>
    </>
  )
}

ErrorPage.getInitialProps = ({ res, err, locale }) => {
  const statusCode = res ? res.statusCode : err ? err.statusCode : 404
  return { statusCode, locale: locale as Locale }
}

export default ErrorPage
