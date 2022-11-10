import { Head, Html, Main } from 'next/document'
import { FC } from 'react'
import DeferNextScript from "../components/DeferNextScript";
import useTranslation from "../lib/hooks/useTranslation";
import { Analytics } from '@vercel/analytics/react';

const Document: FC = () => {
    const { locale } = useTranslation()

    return (
        <Html lang={locale}>
            <Head />
            <body data-ssml-voice-gender="male">
            <Main />
            <DeferNextScript />
            <Analytics />
            </body>
        </Html>
    )
}

export default Document
