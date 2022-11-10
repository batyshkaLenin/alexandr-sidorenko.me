import classNames from 'classnames'
import { useAmp } from 'next/amp'
import Link from 'next/link'
import { useRouter } from 'next/router'
import useTranslation from '../../lib/hooks/useTranslation'
import styles from '../../styles/Menu.module.scss'

const Menu = () => {
  const isAmp = useAmp()
  const router = useRouter()
  const { t } = useTranslation()
  const { asPath: path } = router

  return !isAmp ? (
    <nav itemScope itemType='https://schema.org/SiteNavigationElement'>
      <ul
        itemScope
        className={styles.menu}
        itemProp='about'
        itemType='https://schema.org/ItemList'
      >
        <li
          itemScope
          className={classNames(styles.menuItem, path === '/' && styles.active)}
          itemProp='itemListElement'
          itemType='https://schema.org/ListItem'
        >
          <Link href='/'>
            <a itemProp='item url'>
              <span itemProp='name'>{t('MENU_ABOUT_ME')}</span>
            </a>
          </Link>
        </li>
        <li
          itemScope
          className={classNames(
            styles.menuItem,
            /posts/.test(path) && styles.active,
          )}
          itemProp='itemListElement'
          itemType='https://schema.org/ListItem'
        >
          <Link href='/posts'>
            <a itemProp='item url'>
              <span itemProp='name'>{t('MENU_BLOG')}</span>
            </a>
          </Link>
        </li>
        <li
          itemScope
          className={classNames(
            styles.menuItem,
            /creativity/.test(path) && styles.active,
          )}
          itemProp='itemListElement'
          itemType='https://schema.org/ListItem'
        >
          <Link href='/creativity'>
            <a itemProp='item url'>
              <span itemProp='name'>{t('MENU_CREATIVITY')}</span>
            </a>
          </Link>
        </li>
      </ul>
    </nav>
  ) : null
}

export default Menu
