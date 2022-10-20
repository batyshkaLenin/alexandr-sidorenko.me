import React from 'react'
import styles from '../../styles/Footer.module.scss'
import Link from 'next/link'
import { useAmp } from "next/amp"

export const Footer = (props) => {
    const isAmp = useAmp()

    return (<>{!isAmp ?
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
                        <Link href="https://webring.xxiivv.com/#batyshkaLenin">
                            <a target="_blank" rel="noopener">
                                {isAmp ? "XXIIVV webring" : <img className={styles.webring} src={`https://webring.xxiivv.com/icon.${props.theme === 'light' ? 'black' : 'white'}.svg`} alt="XXIIVV webring"/>}
                            </a>
                        </Link>
                    </li>
                    <li className={styles.contactItem}>
                        <Link href="https://github.com/batyshkaLenin">
                            <a rel="me">
                                {isAmp ? "GitHub" : <i className="icon-github-circled" aria-label='Ссылка на GitHub' role='link' />}
                            </a>
                        </Link>
                    </li>
                    <li className={styles.contactItem}>
                        <Link href="https://vk.com/batyshkalenin">
                            <a rel="me">
                                {isAmp ? "ВКонтакте" : <i className="icon-vkontakte" aria-label='Ссылка на ВКонтакте' role='link' />}
                            </a>
                        </Link>
                    </li>
                    <li className={styles.contactItem}>
                        <Link href="https://soundcloud.com/better_not_be_born">
                            <a rel="me">
                                {isAmp ? 'SoundCloud' : <i className="icon-soundcloud" aria-label='Ссылка на SoundCloud' role='link' />}
                            </a>
                        </Link>
                    </li>
                    <li className={styles.contactItem}>
                        <Link href="https://twitter.com/batyshkaLenin">
                            <a rel="me">
                                {isAmp ? 'Twitter' : <i className="icon-twitter" aria-label='Ссылка на Twitter' role='link' />}
                            </a>
                        </Link>
                    </li>
                    <li className={styles.contactItem}>
                        <Link href="https://t.me/batyshka_Lenin">
                            <a rel="me">
                                {isAmp ? 'Telegram' : <i className="icon-telegram" aria-label='Ссылка на Telegram' role='link' />}
                            </a>
                        </Link>
                    </li>
                </ul>
            </section>
        </footer> : null}
        </>)
}
