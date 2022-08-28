import React from 'react'
import styles from './PostListItem.module.scss'
import Link from 'next/link'
import {useAmp} from "next/amp";

const defaultProps = {
    author: '',
    description: '',
    publishedDate: '',
    readingTime: '',
}

interface BlogBoxProps {
    id?: string
    slug?: string
    title: string
    description: string
    readingTime?: string
    author?: string
    date: string
    tags?: Array<string>
}

const PostListItem = (props: BlogBoxProps) => {
    const isAmp = useAmp()
    const postURL = `/posts/${props.slug}`

    return (<Link as={isAmp ? `${postURL}?amp=1` : postURL} href="/posts/[slug]">
        <a>
            <article itemProp="blogPost" itemScope itemType="https://schema.org/BlogPosting">
                <meta itemProp="author" content="Александр Сидоренко" />
                <meta itemProp="dateCreated" content={new Date(props.date).toJSON()} />
                <div className={styles.title}>
                    <h2 itemProp="headline">{props.title}</h2>
                </div>

                <div>
                    <div className={styles.description} itemProp="description">
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
        </a>
    </Link>)
}

PostListItem.defaultProps = defaultProps

export default PostListItem
