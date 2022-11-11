import { useAmp } from 'next/amp'
import Image from 'next/image'
import Link from 'next/link'
import React from 'react'
import { Theme } from 'lib/types'
import styles from 'styles/Footer.module.scss'

type FooterProps = {
  theme: Theme
}

export const Footer = (props: FooterProps) => {
  const isAmp = useAmp()

  return !isAmp ? (
    <footer className={styles.footer}>
      <section className={styles.rights}>
        <div className={styles.copy}>
          &copy; 2020-{new Date().getFullYear()}
        </div>
        |
        <div className={styles.design}>
          Designed by{' '}
          <Link href='https://vk.com/wemadefrombrokenparts'>Meiks</Link>
        </div>
        |
        <div className={styles.webringCarousel}>
          <Link href='https://xn--sr8hvo.ws/%F0%9F%89%90%F0%9F%8C%BC%F0%9F%8D%AC/previous'>
            ←
          </Link>
          <span>🕸💍</span>
          <Link href='https://xn--sr8hvo.ws/%F0%9F%89%90%F0%9F%8C%BC%F0%9F%8D%AC/next'>
            →
          </Link>
        </div>
      </section>
      <section className={styles.contacts}>
        <ul className={styles.contactList}>
          <li className={styles.contactItem}>
            <Link
              href='https://webring.xxiivv.com/#batyshkaLenin'
              rel='noopener'
              target='_blank'
            >
              {isAmp ? (
                'XXIIVV webring'
              ) : (
                <Image
                  alt='XXIIVV webring'
                  className={styles.webring}
                  height={20}
                  src={`https://webring.xxiivv.com/icon.${
                    props.theme === Theme.Light ? 'black' : 'white'
                  }.svg`}
                  width={20}
                />
              )}
            </Link>
          </li>
          <li className={styles.contactItem}>
            <Link href='https://github.com/batyshkaLenin' rel='me'>
              {isAmp ? (
                'GitHub'
              ) : (
                <i
                  aria-label='Ссылка на GitHub'
                  className='icon-github-circled'
                  role='link'
                />
              )}
            </Link>
          </li>
          <li className={styles.contactItem}>
            <Link href='https://vk.com/batyshkalenin' rel='me'>
              {isAmp ? (
                'ВКонтакте'
              ) : (
                <i
                  aria-label='Ссылка на ВКонтакте'
                  className='icon-vkontakte'
                  role='link'
                />
              )}
            </Link>
          </li>
          <li className={styles.contactItem}>
            <Link href='https://soundcloud.com/better_not_be_born' rel='me'>
              {isAmp ? (
                'SoundCloud'
              ) : (
                <i
                  aria-label='Ссылка на SoundCloud'
                  className='icon-soundcloud'
                  role='link'
                />
              )}
            </Link>
          </li>
          <li className={styles.contactItem}>
            <Link href='https://twitter.com/batyshkaLenin' rel='me'>
              {isAmp ? (
                'Twitter'
              ) : (
                <i
                  aria-label='Ссылка на Twitter'
                  className='icon-twitter'
                  role='link'
                />
              )}
            </Link>
          </li>
          <li className={styles.contactItem}>
            <Link href='https://t.me/batyshka_Lenin' rel='me'>
              {isAmp ? (
                'Telegram'
              ) : (
                <i
                  aria-label='Ссылка на Telegram'
                  className='icon-telegram'
                  role='link'
                />
              )}
            </Link>
          </li>
        </ul>
      </section>
    </footer>
  ) : null
}
