import { getAllPosts } from '../../lib/markdown'
import { NextPage } from 'next'
import Helmet from "../../components/Helmet"
import { PublicationList, PostPreview } from "../../components/publication/list"
import useTranslation from "../../lib/hooks/useTranslation";

type PostPageProps = {
    posts: PostPreview[]
}

const PostsPage: NextPage = ({ posts }: PostPageProps) => {
    const { t } = useTranslation();
    const description = t('BLOG_DESCRIPTION');

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
                            "name": t('MENU_BLOG'),
                        },
                },
            ],
    }

    return (
        <>
            <Helmet title={t('BLOG_TITLE')} description={description}>
                <meta content='website' property='og:type' />
                <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbs) }}/>
            </Helmet>
            <PublicationList publications={posts} type="post" />
        </>
    )
}

export async function getStaticProps(req) {
  const posts = getAllPosts(['slug', 'title', 'description', 'modified', 'created', 'author'], req.locale)
  return {
    props: { posts },
  }
}

export default PostsPage
