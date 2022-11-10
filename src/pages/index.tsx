import Image from 'next/image'
import { NextPage } from 'next'
import classNames from 'classnames'
import styles from '../styles/index.module.scss'
import Helmet from '../components/Helmet'
import Link from 'next/link'
import { useState } from "react"
import useTranslation from "../lib/hooks/useTranslation";

const HomePage: NextPage = () => {
  const { t } = useTranslation()
  const [audioRef, setAudioRef] = useState<HTMLAudioElement | undefined>()

  const play = () => { if (audioRef) return audioRef.play() }
  const pause = () => { if (audioRef) return audioRef.pause() }

  return (
    <div itemScope itemType="https://schema.org/WebPage">
      <Helmet>
        <meta content='website' property='og:type' />
      </Helmet>
      <section className={classNames(styles.page, 'vcard', 'h-card')}>
        <section className={styles.text}>
          <data className="p-given-name" value={t('FIRSTNAME')} />
          <data className="p-family-name" value={t('LASTNAME')} />
          <data className='photo u-photo' value="https://alexandr-sidorenko.me/avatar.jpg" />
          <data className='p-nickname' value="batyshkaLenin" />
          <data className="p-country-name" value={t('COUNTRY')} />
          <data className="p-locality" value={t('CITY')} />
          <data className="p-sex" value="male" />
          <time className="dt-bday" dateTime="1999-10-26" />
          <article itemScope itemProp="mainEntity" itemType="https://schema.org/Person">
            <h1 className={styles.name}>
              <Link href="/">
                <a itemProp="sameAs" className="url" rel="me">
                  <span itemProp="name" className="fn">{t('FULL_NAME')}</span>
                </a>
              </Link>
            </h1>
            <p className='p-note' itemProp="description">
              {t('DESCRIPTION')}
            </p>
          </article>
        </section>
        <section className={classNames(styles.photo, 'photo-section')} onMouseOut={pause} onMouseOver={play}>
          <Image
              itemProp="image"
              alt={t('AVATAR_ALT')}
              className={styles.me}
              src='/images/me.png'
              width='450px'
              height='450px'
          />
          <audio ref={(ref) => setAudioRef(ref)} autoPlay={false} loop preload='auto' >
            <source src='/banjo.mp3' type="audio/mpeg" />
          </audio>
        </section>
      </section>
    </div>
  )
}

export default HomePage
