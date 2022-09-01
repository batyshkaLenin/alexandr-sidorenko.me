import React from 'react'
import {PublicationPreview, PublicationType} from "./types"
import { PublicationListItem } from "./PublicationListItem";

type PublicationsListProps = {
    publications: PublicationPreview[]
    type: PublicationType
}

export const PublicationList = ({ publications, type }: PublicationsListProps) => {

    return (
        <div>
            {publications.map((publication, index) => (
                <PublicationListItem
                    key={index}
                    type={type}
                    {...publication}
                />
            ))}
        </div>
    )
}
