import type { NextPage } from 'next'
import Link from "next/link"
import styles from '../styles/Error.module.scss'
import Helmet from "../components/Helmet";

const getData = (code?: number, locale: 'en' | 'ru' = 'ru') => {
    let output
    switch (code) {
        case 404:
            output = {
                title: locale === 'ru' ? 'Страница не найдена' : 'Page not found',
                linkText: locale === 'ru' ? 'Вернуться на главную' : 'Go to Home',
                linkUrl: '/',
            }
            break
        case 500:
        default:
            output = {
                title: locale === 'ru' ? 'Неизвестная ошибка' : 'Unknown error',
                linkText: locale === 'ru' ? 'Перезагрузить страницу' : 'Refresh page',
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
