import { getAllPosts } from '../../lib/posts'
import { PostListItem, PostPreview } from '../../components/PostsListItem/PostListItem'
import { NextPage } from 'next'
import Helmet from "../../components/Helmet";

export const config = { amp: 'hybrid' }

type PostPageProps = {
    posts: PostPreview[]
    description: string
}

const PostsPage: NextPage = ({ posts, description }: PostPageProps) => (
  <>
    <Helmet title='Блог Александра Сидоренко' description={description} />
    <div itemScope itemType="https://schema.org/Blog">
      <meta itemProp="description" content={description} />
      {posts.map((post, index) => (
          <PostListItem
              key={index}
              description={post.description}
              slug={post.slug}
              title={post.title}
              created={post.created}
              author={post.author}
              modified={post.modified}
          />
      ))}
    </div>
  </>
)

export async function getStaticProps() {
  const posts = getAllPosts(['slug', 'title', 'description', 'modified', 'created', 'author'])
  const description = 'Блог Александра Сидоренко с заметками и полноценными статьями о разработке, музыке и жизни'
  return {
    props: { posts, description },
  }
}

export default PostsPage
