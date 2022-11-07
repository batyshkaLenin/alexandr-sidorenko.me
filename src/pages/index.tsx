import Image from 'next/image'
import { NextPage } from 'next'
import classNames from 'classnames'
import styles from '../styles/index.module.scss'
import Helmet from '../components/Helmet'
import Link from 'next/link'
import { useState } from "react"

const HomePage: NextPage = () => {
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
          <article itemScope itemProp="mainEntity" itemType="https://schema.org/Person">
            <h1 className={styles.name}>
              <Link href="/src/pages">
                <a itemProp="sameAs" className="url" rel="me">
                  <span itemProp="name" className="fn">Александр Сидоренко</span>
                </a>
              </Link>
            </h1>
            <p className='note p-note' itemProp="description">
              &quot;Это алхимия!&quot; - говорю я, когда пишу код. Программист,
              усопший вождь, взломщик. Участвовал в хакатонах, соревнованиях по
              информационной безопасности и вел образовательный проект Blurred
              Education. Хочу сыграть ООО &quot;Моя оборона&quot; на всех струнных
              музыкальных инструментах (сейчас сыграл на шести) и разработать
              бомбический проект с командой{' '}
              <Link href="https://blur.tech/" >
                <a>
                  Blurred Technologies
                </a>
              </Link>
              .
            </p>
          </article>
        </section>
        <section className={classNames(styles.photo, 'photo-section')} onMouseOut={pause} onMouseOver={play}>
          <Image
              itemProp="image"
              alt='Александр Сидоренко в мексиканской шляпе и с банджо в руках'
              className={classNames(styles.me, 'photo', 'u-photo')}
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
