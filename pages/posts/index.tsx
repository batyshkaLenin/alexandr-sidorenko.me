import { getAllPosts } from '../../lib/posts'
import PostListItem from '../../components/PostsListItem/PostListItem'
import { NextPage } from 'next'
import Helmet from "../../components/Helmet";

interface Author {
  name: string
  phone: string
  shortBio: string
  title: string
  email: string
  company: string
  twitter: string
  facebook: string
  github: string
}

interface HeroImage {
  imageUrl: string
  description: string
  title: string
}

interface BlogPost {
  id: string
  body: string
  excerpt: string
  date: string
  slug: string
  tags: Array<string>
  title: string
  heroImage?: HeroImage
  author?: Author
  metaTitle: string
  metaDescription: string
  metaImage?: any
}

export const config = { amp: 'hybrid' }

const PostsPage: NextPage = ({ allPosts, description }: { description: string, allPosts: BlogPost[] }) => (
  <>
    <Helmet title='Блог Александра Сидоренко' description={description} />
    <div itemScope itemType="https://schema.org/Blog">
      <meta itemProp="description" content={description} />
      {allPosts.map((post: BlogPost | undefined, index) => (
          <PostListItem
              key={index}
              description={post?.excerpt}
              id={post?.id}
              slug={post?.slug}
              tags={post?.tags}
              title={post?.title}
              date={post.date}
          />
      ))}
    </div>
  </>
)

export async function getStaticProps() {
  const allPosts = getAllPosts(['slug', 'title', 'excerpt', 'date'])
  const description = 'Блог Александра Сидоренко с заметками и полноценными статьями о разработке, музыке и жизни'

  return {
    props: { allPosts, description },
  }
}

export default PostsPage
