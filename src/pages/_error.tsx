import type { NextPage } from 'next'
import Link from "next/link"
import styles from '../styles/Error.module.scss'
import Helmet from "../components/Helmet";

const getData = (code?: number) => {
    let output
    switch (code) {
        case 404:
            output = {
                title: 'Страница не найдена',
                linkText: 'Перейти на главную',
                linkUrl: '/',
            }
            break
        case 500:
        default:
            output = {
                title: 'Неизвестная ошибка',
                linkText: 'Обновить страницу',
                linkUrl: '',
            }
    }

    return output
}

const ErrorPage: NextPage<{ statusCode?: number }> = ({ statusCode }) => {
    const { title, linkUrl, linkText } = getData(statusCode)
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

ErrorPage.getInitialProps = ({ res, err }) => {
    const statusCode = res ? res.statusCode : err ? err.statusCode : 404
    return { statusCode }
}

export default ErrorPage
