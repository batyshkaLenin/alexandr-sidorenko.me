import { NextPage } from 'next'
import Helmet from "../../components/Helmet"
import { CreativityPreview, PublicationList } from "../../components/publication/list"
import { getAllCreativity } from "../../lib/markdown"
import useTranslation from "../../lib/hooks/useTranslation";

type CreativityPageProps = {
    creativity: CreativityPreview[]
}

const CreativityPage: NextPage = ({ creativity }: CreativityPageProps) => {
    const { t } = useTranslation();
    const description = t('CREATIVITY_DESCRIPTION')

    const breadcrumbs = {
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        "itemListElement":
            [
                {
                    "@type": "ListItem",
                    "position": 1,
                    "item":
                        {
                            "@id": "/creativity",
                            "url": "/creativity",
                            "name": t('MENU_CREATIVITY'),
                        },
                },
            ],
    }

    return (<>
        <Helmet title={t('CREATIVITY_TITLE')} description={description}>
            <meta content='website' property='og:type' />
            <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbs) }}/>
        </Helmet>
        <PublicationList publications={creativity} type={'creativity'} />
    </>)
}

export async function getStaticProps(req) {
    const creativity = getAllCreativity(['slug', 'title', 'description', 'modified', 'created', 'author', 'creativityType'], req.locale)
    return {
        props: { creativity },
    }
}

export default CreativityPage
