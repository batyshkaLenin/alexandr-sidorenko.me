import classNames from 'classnames'
import styles from '../../styles/Menu.module.scss'
import Link from 'next/link'
import { useRouter } from 'next/router'
import {useAmp} from "next/amp";

const Menu = () => {
    const isAmp = useAmp()
    const router = useRouter()
    const { asPath: path } = router
    return (<>
        {!isAmp ? <nav itemScope itemType="https://schema.org/SiteNavigationElement">
        <ul className={styles.menu} itemProp="about" itemScope itemType="https://schema.org/ItemList">
            <li
                itemScope
                className={classNames(styles.menuItem, path === '/' && styles.active)}
                itemProp="itemListElement"
                itemType="https://schema.org/ListItem"
            >
                <Link href={'/'}>
                    <a itemProp="item url">
                        <span itemProp="name">Обо мне</span>
                    </a>
                </Link>
            </li>
            <li
                itemScope
                className={classNames(styles.menuItem, /posts/.test(path) && styles.active)}
                itemProp="itemListElement"
                itemType="https://schema.org/ListItem"
            >
                <Link href={'/posts'}>
                    <a itemProp="item url">
                        <span itemProp="name">Блог</span>
                    </a>
                </Link>
            </li>
            <li
                itemScope
                className={classNames(styles.menuItem, /creation/.test(path) && styles.active)}
                itemProp="itemListElement"
                itemType="https://schema.org/ListItem"
            >
                <Link href={'/creation'}>
                    <a itemProp="item url">
                        <span itemProp="name">Творчество</span>
                    </a>
                </Link>
            </li>
        </ul>
    </nav> : null}
    </>)
}

export default Menu
