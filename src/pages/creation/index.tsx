import { NextPage } from 'next'
import Helmet from "../../components/Helmet"
import { CreationPreview, PublicationList } from "../../components/publication/list"
import { getAllCreation } from "../../lib/markdown"

type CreationPageProps = {
    creation: CreationPreview[]
    description: string
}

const CreationPage: NextPage = ({ creation, description }: CreationPageProps) => {

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
                            "@id": "/creation",
                            "url": "/creation",
                            "name": "Творчество",
                        },
                },
            ],
    }

    return (<>
        <Helmet title='Творчество Александра Сидоренко' description={description}>
            <meta content='website' property='og:type' />
            <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbs) }}/>
        </Helmet>
        <PublicationList publications={creation} type={'creation'} />
    </>)
}

export async function getStaticProps() {
    const creation = getAllCreation(['slug', 'title', 'description', 'modified', 'created', 'author', 'creationType'])
    const description = 'Страница с публикациями моего творчества. Я занимаюсь музыкой, пишу стихи и рассказы.'
    return {
        props: { creation, description },
    }
}

export default CreationPage
