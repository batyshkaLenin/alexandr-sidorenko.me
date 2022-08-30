import Head from 'next/head'
import { useRouter } from 'next/router'
import { getHost, getUrl } from '../../lib/urls'
import { useAmp } from "next/amp"

const Helmet = ({ title, description, keywords, image, children }) => {
    const isAmp = useAmp()
    const router = useRouter()
    const url = getUrl(router)
    const canonicalUrl = isAmp ? url.replace("?amp=1", "") : url
    const host = getHost()

    return (
        <Head>
            <title>{title}</title>

            {/* Basic */}
            {isAmp ? <link rel="amphtml" href={`${canonicalUrl}?amp=1`} /> : null}
            <link href={canonicalUrl} rel='canonical' />
            <meta content={title} name='title' />
            <meta content={description} name='description' />
            <meta content={keywords} name='keywords' />
            <link rel="sitemap" type="application/xml" title="Sitemap" href="/sitemap.xml" />
            <link rel="alternate" type="application/rss+xml" title="Блог Александра Сидоренко" href="/rss/feed.xml" />
            <link rel="alternate" type="application/json" title="Блог Александра Сидоренко" href="/rss/feed.json" />

            {/* Icons */}
            <link href='/favicon.ico' rel='shortcut icon' />
            <link rel="apple-touch-icon" href="/logo192.png" />

            {/* Twitter */}
            <meta content='summary' name='twitter:card' />
            <meta content={title} name='twitter:title' />
            <meta content={image} property='twitter:image' />
            <meta content={title} property='twitter:image:alt' />
            <meta content={description} property='twitter:description' />
            <meta content='@batyshkaLenin' property='twitter:site' />
            <meta content="@batyshkaLenin" name="twitter:creator" />

            {/* Open Graph */}
            <meta content='Александр Сидоренко' property='og:site_name' />
            <meta content='ru-RU' property='og:locale' />
            <meta content={title} property='og:title' />
            <meta content={image} property='og:image' />
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
            <meta content='#070707' name='theme-color' />
            <link href='/manifest.json' rel='manifest' />

            {/* Additional tags */}
            {children ? children : null}
        </Head>
    )
}

Helmet.defaultProps = {
    title: 'Александр Сидоренко',
    image: '/images/me.png',
    description: 'Программист, усопший вождь, взломщик. Участник хакатонов и CTF. Основатель Blurred Education Хочу сыграть Летова на всех струнных и разработать бомбический проект с Blurred Technologies.',
    keywords:
        'Александр Сидоренко, программист, усопший вождь, взломщик, хакер, батюшка Ленин, Ленин, джаваскриптер, бэкэндер',
    children: null,
}

export default Helmet
