import { NextPage } from 'next'
import Helmet from "../../components/Helmet"

const CreationPage: NextPage = () => {

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
        <Helmet title='Творчество Александра Сидоренко' description="Страница с публикациями моего творчества. Я занимаюсь музыкой, пишу стихи и рассказы.">
            <meta content='website' property='og:type' />
            <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbs) }}/>
        </Helmet>
        <div>Страница с публикациями моего творчества. Я занимаюсь музыкой, пишу стихи и рассказы. В данный момент находится в разработке</div>
    </>)
}

export default CreationPage
