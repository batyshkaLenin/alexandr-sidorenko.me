import classNames from 'classnames'
import styles from './Menu.module.scss'
import Link from 'next/link'
import { useRouter } from 'next/router'

const Menu = () => {
    const router = useRouter()
    const { asPath: path } = router
    return (
        <nav>
            <ul className={styles.menu}>
                <li
                    className={classNames(styles.menuItem, path === '/' && styles.active)}
                >
                    <Link href="/">обо мне</Link>
                </li>
                <li
                    className={classNames(styles.menuItem, /posts/.test(path) && styles.active)}
                >
                    <Link href="/posts" className={styles.menuItem}>
                        блог
                    </Link>
                </li>
                <li
                    className={classNames(styles.menuItem, /creation/.test(path) && styles.active)}
                >
                    <Link href="/creation" className="menu-item">
                        творчество
                    </Link>
                </li>
            </ul>
        </nav>
    )
}

export default Menu
