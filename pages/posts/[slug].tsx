import { useRouter } from 'next/router'
import ErrorPage from 'next/error'
import { distanceToNow } from '../../lib/dates'
import { getAllPosts, getPostBySlug, markdownToHtml } from '../../lib/posts'
import Helmet from "../../components/Helmet";
import React from "react";
import Link from "next/link";

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
        <article className='post-full post h-entry' itemProp="blogPost" itemScope itemType="https://schema.org/BlogPosting">
          <header className='post-full-header'>
            <h1 className='post-full-title p-name' itemProp="headline">{post.title}</h1>
            <meta itemProp="author" content="Александр Сидоренко" />
            <Link as={`/posts/${post.slug}`} href="/posts/[slug]" >
              <a
                  itemProp="url"
                  className='p-url'
              >
                <time
                    className='text-center meta dt-published'
                    itemProp="dateCreated"
                    dateTime={new Date(post.date).toJSON()}
                >
                  {distanceToNow(new Date(post.date))}
                </time>
              </a>
            </Link>
          </header>
          <section
            className='post-full-content e-content'
            itemProp="articleBody"
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
