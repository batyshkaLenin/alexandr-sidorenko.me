import Head from 'next/head'
import { useRouter } from 'next/router'
import { getHost, getUrl } from '../../lib/urls'

const Helmet = ({ title, description, keywords }) => {
    const router = useRouter()
    const canonicalUrl = getUrl(router)
    const host = getHost()

    return (
        <Head>
            <title>{title}</title>

            {/* Basic */}
            <link href={canonicalUrl} rel='canonical' />
            <meta content={title} name='title' />
            <meta content={description} name='description' />
            <meta content={keywords} name='keywords' />
            <link rel="sitemap" type="application/xml" title="Sitemap" href="/sitemap.xml" />

            {/* Icons */}
            <link href='/favicon.ico' rel='shortcut icon' />
            <link rel="apple-touch-icon" href="/logo192.png" />

            {/* Twitter */}
            <meta content='summary' name='twitter:card' />
            <meta content={title} name='twitter:title' />
            <meta content={description} property='twitter:description' />
            <meta content='@batyshkaLenin' property='twitter:site' />

            {/* Open Graph */}
            <meta content='Александр Сидоренко' property='og:site_name' />
            <meta content='ru-RU' property='og:locale' />
            <meta content={title} property='og:title' />
            <meta content={description} property='og:description' />
            <meta content={canonicalUrl} property='og:url' />

            {/* Dublin Core */}
            <meta content='ru-RU' name='DC.language' />
            <meta content={host} name='DC.publisher.url' />
            <meta content={canonicalUrl} name='DC.identifier' />
            <meta content={title} name='DC.title' />
            <meta content={description} name='DC.description' />
            <meta content={keywords} name='DC.subject' />
            <meta content='text' name='DC.type' />
            <meta content='text/html' name='DC.format' />

            {/* Web App */}
            <meta content='Александр Сидоренко' name='apple-mobile-web-app-title' />
            <meta content='default' name='apple-mobile-web-app-status-bar-style' />
            <meta content='Александр Сидоренко' name='application-name' />
            <link
                crossOrigin='use-credentials'
                href='/manifest.json'
                rel='manifest'
            />
        </Head>
    )
}

Helmet.defaultProps = {
    title: 'Александр Сидоренко',
    description: 'Программист, усопший вождь, взломщик. Участник хакатонов и CTF. Основатель Blurred Education Хочу сыграть Летова на всех струнных и разработать бомбический проект с Blurred Technologies.',
    keywords:
        'Александр Сидоренко, программист, усопший вождь, взломщик, хакер, батюшка Ленин, Ленин, джаваскриптер, бэкэндер',
}

export default Helmet
