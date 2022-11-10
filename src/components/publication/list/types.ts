import { Creativity, Post } from "../../../lib/markdown"

export type PublicationType = 'post' | 'creativity'
export type PostPreview = Pick<Post, 'slug' | 'title' | 'description' | 'created' | 'author' | 'modified'>
export type CreativityPreview = Pick<Creativity, 'slug' | 'title' | 'description' | 'created' | 'author' | 'modified' | 'creativityType'>
export type PublicationPreview = (PostPreview | CreativityPreview)
export type PublicationPreviewWithType = (PostPreview | CreativityPreview) & { type: PublicationType }
