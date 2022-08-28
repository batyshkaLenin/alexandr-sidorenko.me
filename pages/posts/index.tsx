import { getAllPosts } from '../../lib/getPost'
import PostListItem from '../../components/PostListItem'
import { NextPage } from 'next'

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
  publishedDate: string
  slug: string
  tags: Array<string>
  title: string
  heroImage?: HeroImage
  author?: Author
  metaTitle: string
  metaDescription: string
  metaImage?: any
}

const PostsPage: NextPage = ({ allPosts }: { allPosts?: BlogPost[] }) => (
  <>
    {allPosts.map((post: BlogPost | undefined, index) => (
      <PostListItem
        key={index}
        description={post?.excerpt}
        id={post?.id}
        slug={post?.slug}
        tags={post?.tags}
        title={post?.title}
      />
    ))}
  </>
)

export async function getStaticProps() {
  const allPosts = getAllPosts(['slug', 'title', 'excerpt', 'date'])

  return {
    props: { allPosts },
  }
}

export default PostsPage
