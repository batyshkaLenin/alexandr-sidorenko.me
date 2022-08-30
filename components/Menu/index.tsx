import classNames from 'classnames'
import styles from '../../styles/Menu.module.scss'
import Link from 'next/link'
import { useRouter } from 'next/router'
import { useAmp } from 'next/amp'

const Menu = () => {
    const isAmp = useAmp()
    const router = useRouter()
    const { asPath: path } = router
    return (
        <>
            <style jsx>{`nav > ul { display: flex; justify-content: space-around; }`}</style>
            <nav itemScope itemType="https://schema.org/SiteNavigationElement">
                <ul className={styles.menu} itemProp="about" itemScope itemType="https://schema.org/ItemList">
                    <li
                        itemScope
                        className={classNames(styles.menuItem, path === '/' && styles.active)}
                        itemProp="itemListElement"
                        itemType="https://schema.org/ListItem"
                    >
                        <Link href={isAmp ? '/?amp=1' : '/'}>
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
                        <Link href={isAmp ? '/posts.amp' : '/posts'}>
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
                        <Link href={isAmp ? '/creation?amp=1' : '/creation'}>
                            <a itemProp="item url">
                                <span itemProp="name">Творчество</span>
                            </a>
                        </Link>
                    </li>
                </ul>
            </nav>
        </>
    )
}

export default Menu
