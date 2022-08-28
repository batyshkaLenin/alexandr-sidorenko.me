import React from 'react'
import styles from './Footer.module.scss'
import Link from 'next/link'

const Footer = () => (
        <footer className={styles.footer}>
            <section className={styles.rights}>
                <div className={styles.copy}>&copy; 2020-{new Date().getFullYear()}</div>|
                <div className={styles.design}>
                    Designed by <Link href="https://vk.com/wemadefrombrokenparts"><a>Meiks</a></Link>
                </div>
            </section>
            <section className={styles.contacts}>
                <ul className={styles.contactList}>
                    <li className={styles.contactItem}>
                        <Link href="https://github.com/batyshkaLenin">
                            <a rel="me">
                                <i className="icon-github-circled" />
                            </a>
                        </Link>
                    </li>
                    <li className={styles.contactItem}>
                        <Link href="https://vk.com/batyshkalenin">
                            <a rel="me">
                                <i className="icon-vkontakte" />
                            </a>
                        </Link>
                    </li>
                    <li className={styles.contactItem}>
                        <Link href="https://soundcloud.com/better_not_be_born">
                            <a rel="me">
                                <i className="icon-soundcloud" />
                            </a>
                        </Link>
                    </li>
                    <li className={styles.contactItem}>
                        <Link href="https://twitter.com/batyshkaLenin">
                            <a rel="me">
                                <i className="icon-twitter" />
                            </a>
                        </Link>
                    </li>
                    <li className={styles.contactItem}>
                        <Link href="https://t.me/batyshka_Lenin">
                            <a rel="me">
                                <i className="icon-telegram" />
                            </a>
                        </Link>
                    </li>
                </ul>
            </section>
        </footer>
    )

export default Footer
