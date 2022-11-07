import Head from 'next/head'
import { useRouter } from 'next/router'
import { getHost, getUrl } from '../../lib/urls'
import { useAmp } from "next/amp"

const Helmet = ({ title, description, keywords, image, children }) => {
    const isAmp = useAmp()
    const router = useRouter()
    const url = getUrl(router)
    const canonicalUrl = url.replace(".amp", "")
    const host = getHost()
    const imageURl = `${host}${image}`

    return (
        <Head>
            <title>{title}</title>

            {/* Basic */}
            <link href={canonicalUrl} rel='canonical' />
            <meta content={title} name='title' />
            <meta content={description} name='description' />
            <meta content={keywords} name='keywords' />
            <link rel="sitemap" type="application/xml" title="Sitemap" href="/sitemap.xml" />
            <link rel="alternate" type="application/rss+xml" title="Блог Александра Сидоренко" href="/rss/posts/feed.xml" />
            <link rel="alternate" type="application/json" title="Блог Александра Сидоренко" href="/rss/posts/feed.json" />
            <link rel="alternate" type="application/rss+xml" title="Творчество Александра Сидоренко" href="/rss/creation/feed.xml" />
            <link rel="alternate" type="application/json" title="Творчество Александра Сидоренко" href="/rss/creation/feed.json" />

            {/* Icons */}
            <link href='/favicon.ico' rel='shortcut icon' />
            <link rel="apple-touch-icon" href="/logo192.png" />

            {/* Twitter */}
            <meta content='summary' name='twitter:card' />
            <meta content={title} name='twitter:title' />
            <meta content={imageURl} property='twitter:image' />
            <meta content={title} property='twitter:image:alt' />
            <meta content={description} property='twitter:description' />
            <meta content='@batyshkaLenin' property='twitter:site' />
            <meta content="@batyshkaLenin" name="twitter:creator" />

            {/* Open Graph */}
            <meta content='Александр Сидоренко' property='og:site_name' />
            <meta content='ru-RU' property='og:locale' />
            <meta content={title} property='og:title' />
            <meta content={imageURl} property='og:image' />
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

            {/* IndieWeb */}
            <link href="https://webmention.io/alexandr-sidorenko.me/webmention" rel="webmention" />
            <link href="https://webmention.io/alexandr-sidorenko.me/xmlrpc" rel="pingback" />
            <link href="https://indieauth.com/auth" rel="authorization_endpoint" />
            <link href="https://tokens.indieauth.com/token" rel="token_endpoint" />
            <link href="https://aperture.p3k.io/microsub/791" rel="microsub" />
            <link href="https://merveilles.town/@batyshkaLenin" rel="me" />
            <link href="https://www.linkedin.com/in/alexandr-sidorenko/" rel="me" />
            <link href="https://career.habr.com/batyshkalenin" rel="me" />
            <link href="https://www.tiktok.com/@batyshkalenin" rel="me" />
            <link href="https://hh.ru/applicant/resumes/view?resume=6700a5c7ff0594c2ba0039ed1f425a6c4a7771" rel="me" />
            <link href="https://www.instagram.com/alexander_sidorenko/" rel="me" />
            <link href="https://www.facebook.com/sidorenko.alexandr" rel="me" />
            <link href="https://steamcommunity.com/id/batyshkaLenin/" rel="me" />

            {isAmp ? <style jsx>{`
            body { padding: 20px; }
            section.publicationContent > p > img { max-height: 600px; max-width: 100%; display: block; margin-left: auto; margin-right: auto; }
            `}</style> : null}
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
