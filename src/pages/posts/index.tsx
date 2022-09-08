import { getAllPosts } from '../../lib/markdown'
import { NextPage } from 'next'
import Helmet from "../../components/Helmet"
import { PublicationList, PostPreview } from "../../components/publication/list"

type PostPageProps = {
    posts: PostPreview[]
    description: string
}

const PostsPage: NextPage = ({ posts, description }: PostPageProps) => {

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
                            "@id": "/posts",
                            "url": "/posts",
                            "name": "Блог",
                        },
                },
            ],
    }

    return (
        <>
            <Helmet title='Блог Александра Сидоренко' description={description}>
                <meta content='website' property='og:type' />
                <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbs) }}/>
            </Helmet>
            <PublicationList publications={posts} type="post" />
        </>
    )
}

export async function getStaticProps() {
  const posts = getAllPosts(['slug', 'title', 'description', 'modified', 'created', 'author'])
  const description = 'Блог Александра Сидоренко с заметками и полноценными статьями о разработке, музыке и жизни'
  return {
    props: { posts, description },
  }
}

export default PostsPage