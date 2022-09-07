import { PublicationType } from "./types"


export function getPublicationAdditionalTitle(type: PublicationType, publicationType?: string) {
    if (type === 'creation') {
        switch (publicationType) {
            case 'poem':
                return 'Рассказ'
            case 'poetry':
                return 'Стих'
            case 'poetry-compilation':
                return 'Подборка стихов'
            default:
                return 'Произведение'
        }
    }
    return 'Статья'
}
