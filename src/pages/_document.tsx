import { Head, Html, Main } from 'next/document'
import { FC } from 'react'
import DeferNextScript from "../components/DeferNextScript";
import useTranslation from "../lib/hooks/useTranslation";

const Document: FC = () => {
    const { locale } = useTranslation()

    return (
        <Html lang={locale}>
            <Head />
            <body data-ssml-voice-gender="male">
            <Main />
            <DeferNextScript />
            </body>
        </Html>
    )
}

export default Document
