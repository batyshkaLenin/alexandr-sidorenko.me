import { PublicationType } from "./types"


export function getPublicationAdditionalTitle(type: PublicationType, publicationType?: string) {
    if (type === 'creation') {
        switch (publicationType) {
            case 'poem':
                return 'Рассказ'
            case 'poetry':
                return 'Стих'
            default:
                return 'Произведение'
        }
    }
    return 'Статья'
}
