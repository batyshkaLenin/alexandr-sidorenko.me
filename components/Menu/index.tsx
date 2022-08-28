import classNames from 'classnames'
import styles from './Menu.module.scss'
import Link from 'next/link'
import { useRouter } from 'next/router'

const Menu = () => {
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
                    <Link href="/">
                        <a itemProp="item url">
                            <link href="/"/>
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
                    <Link href="/posts">
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
                    <Link href="/creation" itemProp="item">
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
