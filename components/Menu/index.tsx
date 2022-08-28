import classNames from 'classnames'
import styles from './Menu.module.scss'
import Link from 'next/link'
import { useRouter } from 'next/router'
import { useAmp } from 'next/amp'

const Menu = () => {
    const isAmp = useAmp()
    const router = useRouter()
    const { asPath: path } = router
    return (
        <nav>
            <ul className={styles.menu} itemScope itemType="https://schema.org/BreadcrumbList">
                <li
                    itemScope
                    className={classNames(styles.menuItem, path === '/' && styles.active)}
                    itemProp="itemListElement"
                    itemType="https://schema.org/ListItem"
                >
                    <Link href={isAmp ? '/?amp=1' : '/'}>
                        <a itemProp="item url">
                            <span itemProp="name">Обо мне</span>
                            <meta itemProp="position" content="1"/>
                        </a>
                    </Link>
                </li>
                <li
                    itemScope
                    className={classNames(styles.menuItem, /posts/.test(path) && styles.active)}
                    itemProp="itemListElement"
                    itemType="https://schema.org/ListItem"
                >
                    <Link href={isAmp ? '/posts?amp=1' : '/posts'}>
                        <a itemProp="item url">
                            <span itemProp="name">Блог</span>
                            <meta itemProp="position" content="2"/>
                        </a>
                    </Link>
                </li>
                <li
                    itemScope
                    className={classNames(styles.menuItem, /creation/.test(path) && styles.active)}
                    itemProp="itemListElement"
                    itemType="https://schema.org/ListItem"
                >
                    <Link href={isAmp ? '/creation?amp=1' : '/creation'} itemProp="item">
                        <a itemProp="item url">
                            <span itemProp="name">Творчество</span>
                            <meta itemProp="position" content="3"/>
                        </a>
                    </Link>
                </li>
            </ul>
        </nav>
    )
}

export default Menu
