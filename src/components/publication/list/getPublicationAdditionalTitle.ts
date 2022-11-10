import {PublicationType} from "./types"
import {CreativityType, CreativeMusic, CreativeWriting} from "../../../lib/markdown";
import locales from '../../../../public/locales/index';


export function getPublicationAdditionalTitle(locale: 'en' | 'ru', type: PublicationType, publicationType?: CreativityType) {
    if (type === 'creativity') {
        switch (publicationType) {
            case CreativeWriting.Story:
                return locales[locale]["STORY"]
            case CreativeWriting.Poem:
                return locales[locale]["POEM"]
            case CreativeWriting.Poetry:
                return locales[locale]["POETRY"]
            case CreativeMusic.Single:
                return locales[locale]["SINGLE"]
            case CreativeMusic.EP:
                return locales[locale]["EP"]
            case CreativeMusic.Album:
                return locales[locale]["ALBUM"]
            default:
                return locales[locale]["WORK"]
        }
    }
    return locales[locale]["ARTICLE"]
}
