import type { NextPage } from 'next'
import Link from 'next/link'
import Helmet from 'components/Helmet'
import locales from 'lib/locales'
import { Locale } from 'lib/types'
import styles from 'styles/Error.module.scss'

const NotFoundPage: NextPage<{ locale: Locale }> = ({ locale }) => (
  <>
    <Helmet title={locales[locale]['NOT_FOUND']}>
      <meta content='noindex,nofollow,noarchive' name='robots' />
    </Helmet>
    <div className={styles.errorBlock}>
      <span>{locales[locale]['NOT_FOUND']}</span>
      <Link href='/'>{locales[locale]['BACK_TO_MAIN_PAGE']}</Link>
    </div>
  </>
)

export async function getStaticProps({ locale }: { locale: Locale }) {
  return {
    props: { locale: locale as Locale },
  }
}

export default NotFoundPage
