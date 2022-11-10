import React from 'react'
import styles from '../../../styles/PostListItem.module.scss'
import Link from 'next/link'
import { PublicationPreviewWithType } from "./types";
import {getPublicationAdditionalTitle} from "./getPublicationAdditionalTitle";
import useTranslation from "../../../lib/hooks/useTranslation";

export const PublicationListItem = (publication: PublicationPreviewWithType) => {
    const { locale } = useTranslation();
    const path = publication.type === 'post' ? 'posts' : 'creativity'
    const publicationURL = `/${path}/${publication.slug}`
    const additionalTitle = 'creativityType' in publication ? getPublicationAdditionalTitle(locale, publication.type, publication.creativityType) : null

    return (<Link as={publicationURL} href={`/${path}/[slug]`}>
        <a>
            <article className={styles.article} itemScope itemType="https://schema.org/Article">
                <meta itemProp="author" content={publication.author.fullName} />
                <meta itemProp="dateCreated" content={publication.created} />
                <meta itemProp="dateModified" content={publication.modified} />
                <h2 className={styles.title}>{additionalTitle && `${additionalTitle} `}&quot;<span itemProp="headline">{publication.title}</span>&quot;</h2>

                <p className={styles.description} itemProp="description">
                    {publication.description}
                </p>
            </article>
        </a>
    </Link>)
}
