type Author = {
  firstName: string
  lastName: string
  fullName: string
  username: string
  gender: 'male' | 'female'
}

export type Post = {
  slug: string
  title: string
  description: string
  published: string
  created: string
  content: string
  author: Author
  modified: string
  preview?: string
  tags: string[]
}
