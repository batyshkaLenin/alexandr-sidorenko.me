import React from 'react'
import styles from '../../../styles/PostListItem.module.scss'
import Link from 'next/link'
import { PublicationPreviewWithType } from "./types";
import {getPublicationAdditionalTitle} from "./getPublicationAdditionalTitle";

export const PublicationListItem = (publication: PublicationPreviewWithType) => {
    const path = publication.type === 'post' ? 'posts' : 'creation'
    const publicationURL = `/${path}/${publication.slug}`
    const additionalTitle = 'creationType' in publication ? getPublicationAdditionalTitle(publication.type, publication.creationType) : null

    return (<Link as={publicationURL} href={`/${path}/[slug]`}>
        <a>
            <article itemScope itemType="https://schema.org/Article">
                <meta itemProp="author" content={publication.author.fullName} />
                <meta itemProp="dateCreated" content={publication.created} />
                <meta itemProp="dateModified" content={publication.modified} />
                <div className={styles.title}>
                    <h2>{additionalTitle && `${additionalTitle} `}&quot;<span itemProp="headline">{publication.title}</span>&quot;</h2>
                </div>

                <div>
                    <div className={styles.description} itemProp="description">
                        {publication.description}
                    </div>
                </div>
            </article>
        </a>
    </Link>)
}
