import { useRouter } from 'next/router'
import ErrorPage from 'next/error'
import { distanceToNow } from '../../lib/dates'
import { getAllPosts, getPostBySlug, markdownToHtml } from '../../lib/posts'
import Helmet from "../../components/Helmet";

export default function PostPage({ post }) {
  const router = useRouter()

  if (!router.isFallback && !post?.slug) {
    return <ErrorPage statusCode={404} />
  }

  return (
    <>
      <Helmet title={`${post.title} | Блог Александра Сидоренко`} description={post.description} />
      {router.isFallback ? (
        <div>Loading…</div>
      ) : (
        <article className='post-full post h-entry'>
          <header className='post-full-header'>
            <h1 className='post-full-title p-name'>{post.title}</h1>
            <a
              className='p-url'
              href={`https://alexandr-sidorenko.me/post/${post.slug}`}
            >
              <time
                className='text-center meta dt-published'
                dateTime={new Date(new Date(post.date)).toJSON()}
              >
                {distanceToNow(new Date(post.date))}
              </time>
            </a>
          </header>
          <section
            className='post-full-content e-content'
            dangerouslySetInnerHTML={{ __html: post.content }}
          />
        </article>
      )}
    </>
  )
}

export async function getStaticProps({ params }) {
  const post = getPostBySlug(params.slug, [
    'slug',
    'title',
    'excerpt',
    'date',
    'content',
  ])
  const content = await markdownToHtml(post.content || '')

  return {
    props: {
      post: {
        ...post,
        content,
      },
    },
  }
}

export async function getStaticPaths() {
  const posts = getAllPosts(['slug'])

  return {
    paths: posts.map(({ slug }) => ({
      params: {
        slug,
      },
    })),
    fallback: false,
  }
}
