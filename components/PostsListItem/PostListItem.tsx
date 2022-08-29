import React from 'react'
import styles from './PostListItem.module.scss'
import Link from 'next/link'
import {useAmp} from "next/amp";
import { Post } from '../../lib/posts'

export type PostPreview = Pick<Post, 'slug' | 'title' | 'description' | 'created' | 'author' | 'modified'>

export const PostListItem = (post: PostPreview) => {
    const isAmp = useAmp()
    const postURL = `/posts/${post.slug}`

    return (<Link as={isAmp ? `${postURL}?amp=1` : postURL} href="/posts/[slug]">
        <a>
            <article itemProp="blogPost" itemScope itemType="https://schema.org/BlogPosting">
                <meta itemProp="author" content={post.author.fullName} />
                <meta itemProp="dateCreated" content={post.created} />
                <meta itemProp="dateModified" content={post.modified} />
                <div className={styles.title}>
                    <h2 itemProp="headline">{post.title}</h2>
                </div>

                <div>
                    <div className={styles.description} itemProp="description">
                        {post.description}
                    </div>
                </div>
            </article>
        </a>
    </Link>)
}
