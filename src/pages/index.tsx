import classNames from 'classnames'
import { NextPage } from 'next'
import Image from 'next/image'
import Link from 'next/link'
import { useState } from 'react'
import Helmet from '../components/Helmet'
import useTranslation from '../lib/hooks/useTranslation'
import styles from '../styles/index.module.scss'

const HomePage: NextPage = () => {
  const { t } = useTranslation()
  const [audioRef, setAudioRef] = useState<HTMLAudioElement | null>()

  const play = () => {
    audioRef && audioRef.play()
  }
  const pause = () => {
    audioRef && audioRef.pause()
  }

  return (
    <div itemScope itemType='https://schema.org/WebPage'>
      <Helmet>
        <meta content='website' property='og:type' />
      </Helmet>
      <section className={classNames(styles.page, 'vcard', 'h-card')}>
        <section className={styles.text}>
          <data className='p-given-name' value={t('FIRSTNAME')} />
          <data className='p-family-name' value={t('LASTNAME')} />
          <data
            className='photo u-photo'
            value='https://alexandr-sidorenko.me/avatar.jpg'
          />
          <data className='p-nickname' value='batyshkaLenin' />
          <data className='p-country-name' value={t('COUNTRY')} />
          <data className='p-locality' value={t('CITY')} />
          <data className='p-sex' value='male' />
          <time className='dt-bday' dateTime='1999-10-26' />
          <article
            itemScope
            itemProp='mainEntity'
            itemType='https://schema.org/Person'
          >
            <h1 className={styles.name}>
              <Link href='/' itemProp='sameAs' rel='me'>
                <span className='fn' itemProp='name'>
                  {t('FULL_NAME')}
                </span>
              </Link>
            </h1>
            <p className='p-note' itemProp='description'>
              {t('DESCRIPTION')}
            </p>
          </article>
        </section>
        <section
          className={classNames(styles.photo, 'photo-section')}
          onMouseOut={pause}
          onMouseOver={play}
        >
          <Image
            alt={t('AVATAR_ALT')}
            className={styles.me}
            height={450}
            itemProp='image'
            src='/images/me.png'
            width={450}
          />
          <audio
            loop
            autoPlay={false}
            preload='auto'
            ref={(ref) => setAudioRef(ref)}
          >
            <source src='/banjo.mp3' type='audio/mpeg' />
          </audio>
        </section>
      </section>
    </div>
  )
}

export default HomePage
