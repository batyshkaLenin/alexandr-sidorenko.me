import React from 'react'
import styles from './PostsList.module.scss'
import Link from "next/link";

const defaultProps = {
    author: '',
    description: '',
    publishedDate: '',
    readingTime: '',
}

interface BlogBoxProps {
    id?: string
    slug?: string
    title?: string
    description?: string
    readingTime?: string
    author?: string
    publishedDate?: string
    tags?: Array<string>
}

const PostList = (props: BlogBoxProps) => <Link as={`/posts/${props.slug}`} href="/posts/[slug]">
            <div>
                <article>
                    <div className={styles.title}>
                        <h3>{props.title}</h3>
                    </div>

                    <div>
                        <div className={styles.description}>
                            {props.description}
                        </div>
                    </div>

                    <div>
                        {props.tags && props.tags.length > 0 && (
                            <>
                                Теги:{' '}
                                {props.tags.map((tag, index) => (
                                    <span key={index}>{tag} </span>
                                ))}
                            </>
                        )}
                    </div>
                </article>
            </div>
        </Link>

PostList.defaultProps = defaultProps

export default PostList
