import { Creation, Post } from "../../../lib/markdown"

export type PublicationType = 'post' | 'creation'
export type PostPreview = Pick<Post, 'slug' | 'title' | 'description' | 'created' | 'author' | 'modified'>
export type CreationPreview = Pick<Creation, 'slug' | 'title' | 'description' | 'created' | 'author' | 'modified' | 'creationType'>
export type PublicationPreview = (PostPreview | CreationPreview)
export type PublicationPreviewWithType = (PostPreview | CreationPreview) & { type: PublicationType }
