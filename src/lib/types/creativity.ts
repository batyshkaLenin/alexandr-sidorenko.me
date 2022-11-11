export enum TriggerWarning {
  Adulthood = '18',
  Addiction = 'addict',
  Religion = 'religion',
  Translation = 'deepl',
}

export enum CreativeWriting {
  Poem = 'poem',
  Poetry = 'poetry',
  Story = 'story',
}

export enum CreativeMusic {
  Single = 'single',
  EP = 'ep',
  Album = 'album',
}

export type CreativityType = CreativeWriting | CreativeMusic

export type Author = {
  firstName: string
  lastName: string
  fullName: string
  username: string
  gender: 'male' | 'female'
}

export type Creativity = {
  slug: string
  title: string
  description: string
  published: string
  created: string
  content: string
  author: Author
  modified: string
  preview?: string
  creativityType: CreativityType
  audio?: string[]
  tw: TriggerWarning[]
}
