import type { NextPage } from 'next'
import Link from "next/link"
import styles from '../styles/Error.module.scss'
import Helmet from "../components/Helmet";
import locales from '../../public/locales/index'

const getData = (code?: number, locale: 'en' | 'ru' = 'ru') => {
    let output
    switch (code) {
        case 404:
            output = {
                title: locales[locale]["NOT_FOUND"],
                linkText: locales[locale]["BACK_TO_MAIN_PAGE"],
                linkUrl: '/',
            }
            break
        case 500:
        default:
            output = {
                title: locales[locale]["UNKNOWN_ERROR"],
                linkText: locales[locale]["RESTART"],
                linkUrl: '',
            }
    }

    return output
}

const ErrorPage: NextPage<{ statusCode?: number, locale: 'en' | 'ru' }> = ({ statusCode, locale }) => {
    const { title, linkUrl, linkText } = getData(statusCode, locale)
    return (
        <>
            <Helmet title={title}>
                <meta name="robots" content="noindex,nofollow,noarchive"/>
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

ErrorPage.getInitialProps = (props) => {
    const statusCode = props.res ? props.res.statusCode : props.err ? props.err.statusCode : 404
    return { statusCode, locale: props.locale as 'en' | 'ru' }
}

export default ErrorPage
