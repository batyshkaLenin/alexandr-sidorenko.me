import type { NextPage } from 'next'
import Link from 'next/link'
import Helmet from '../components/Helmet'
import { Locale } from '../lib/types'
import styles from '../styles/Error.module.scss'

const getData = (code?: number, locale: Locale = Locale.RU) => {
  let output
  switch (code) {
    case 404:
      output = {
        title: locale === Locale.RU ? 'Страница не найдена' : 'Page not found',
        linkText: locale === Locale.RU ? 'Вернуться на главную' : 'Go to Home',
        linkUrl: '/',
      }
      break
    case 500:
    default:
      output = {
        title: locale === Locale.RU ? 'Неизвестная ошибка' : 'Unknown error',
        linkText:
          locale === Locale.RU ? 'Перезагрузить страницу' : 'Refresh page',
        linkUrl: '',
      }
  }

  return output
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
