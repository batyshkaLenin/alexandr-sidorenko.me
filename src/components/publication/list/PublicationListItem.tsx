import Link from 'next/link'
import React from 'react'
import useTranslation from '../../../lib/hooks/useTranslation'
import { PublicationPreviewWithType } from '../../../lib/types'
import styles from '../../../styles/PostListItem.module.scss'
import { getPublicationAdditionalTitle } from './getPublicationAdditionalTitle'

export const PublicationListItem = (
  publication: PublicationPreviewWithType,
) => {
  const { locale } = useTranslation()
  const path = publication.type === 'post' ? 'posts' : 'creativity'
  const publicationURL = `/${path}/${publication.slug}`
  const additionalTitle =
    'creativityType' in publication
      ? getPublicationAdditionalTitle(
          locale,
          publication.type,
          publication.creativityType,
        )
      : null

  return (
    <Link as={publicationURL} href={`/${path}/[slug]`}>
      <a>
        <article
          itemScope
          className={styles.article}
          itemType='https://schema.org/Article'
        >
          <meta content={publication.author.fullName} itemProp='author' />
          <meta content={publication.created} itemProp='dateCreated' />
          <meta content={publication.modified} itemProp='dateModified' />
          <h2 className={styles.title}>
            {additionalTitle && `${additionalTitle} `}&quot;
            <span itemProp='headline'>{publication.title}</span>&quot;
          </h2>

          <p className={styles.description} itemProp='description'>
            {publication.description}
          </p>
        </article>
      </a>
    </Link>
  )
}
