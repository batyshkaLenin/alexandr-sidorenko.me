import {PublicationType} from "./types"
import {CreationType, CreativeMusic, CreativeWriting} from "../../../lib/markdown";


export function getPublicationAdditionalTitle(type: PublicationType, publicationType?: CreationType) {
    if (type === 'creation') {
        switch (publicationType) {
            case CreativeWriting.Poem:
                return 'Рассказ'
            case CreativeWriting.Poetry:
                return 'Стих'
            case CreativeWriting.PoetryCompilation:
                return 'Подборка стихов'
            case CreativeMusic.Single:
                return 'Сингл'
            case CreativeMusic.EP:
                return 'EP'
            case CreativeMusic.Album:
                return 'Альбом'
            default:
                return 'Произведение'
        }
    }
    return 'Статья'
}
