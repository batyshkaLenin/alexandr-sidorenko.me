import React from 'react'
import styles from './Footer.module.scss'
import Link from 'next/link'

const Footer = () => (
        <footer className={styles.footer}>
            <section className={styles.rights}>
                <div className={styles.copy}>&copy; 2020-{new Date().getFullYear()}</div>|
                <div className={styles.design}>
                    Designed by <Link href="https://vk.com/wemadefrombrokenparts">Meiks</Link>
                </div>
            </section>
            <section className={styles.contacts}>
                <ul className={styles.contactList}>
                    <li className={styles.contactItem}>
                        <Link href="https://github.com/batyshkaLenin" rel="me">
                            <i className="icon-github-circled" />
                        </Link>
                    </li>
                    <li className={styles.contactItem}>
                        <Link href="https://vk.com/batyshkalenin" rel="me">
                            <i className="icon-vkontakte" />
                        </Link>
                    </li>
                    <li className={styles.contactItem}>
                        <Link href="https://soundcloud.com/better_not_be_born" rel="me">
                            <i className="icon-soundcloud" />
                        </Link>
                    </li>
                    <li className={styles.contactItem}>
                        <Link href="https://twitter.com/batyshkaLenin" rel="me">
                            <i className="icon-twitter" />
                        </Link>
                    </li>
                    <li className={styles.contactItem}>
                        <Link href="https://t.me/batyshka_Lenin" rel="me">
                            <i className="icon-telegram" />
                        </Link>
                    </li>
                </ul>
            </section>
        </footer>
    )

export default Footer
