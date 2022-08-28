import Image from 'next/image'
import { NextPage } from 'next'
import classNames from 'classnames'
import styles from './index.module.scss'
import Helmet from '../components/Helmet'

const HomePage: NextPage = () => {
  const play = () => document.getElementsByTagName('audio')[0].play()

  const pause = () => document.getElementsByTagName('audio')[0].pause()
  return (
    <>
      <Helmet />
      <section className={classNames(styles.page, 'h-card')}>
        <section className={styles.text}>
          <article>
            <h1 className={classNames(styles.name, 'p-name')}>
              <a className='u-url' href='https://alexandr-sidorenko.me'>
                Александр Сидоренко
              </a>
            </h1>
            <p className='p-note'>
              &quot;Это алхимия!&quot; - говорю я, когда пишу код. Программист,
              усопший вождь, взломщик. Участвую в хакатонах, соревнованиях по
              информационной безопасности и веду образовательный проект Blurred
              Education. Хочу сыграть ООО &quot;Моя оборона&quot; на всех струнных
              музыкальных инструментах (сейчас сыграл на шести) и разработать
              бомбический проект с командой{' '}
              <a className='p-org h-card' href='https://blur.tech/'>
                Blurred Technologies
              </a>
              .
            </p>
          </article>
        </section>
        <section className={styles.photo} onMouseOut={pause} onMouseOver={play}>
          <Image
              alt='Александр Сидоренко в мексиканской шляпе и с банджо в руках'
              className={classNames(styles.me, 'u-photo')}
              src='/images/me.png'
              width='450px'
              height='450px'
          />
          <audio>
            <source src='/banjo.mp3' />
          </audio>
        </section>
      </section>
    </>
  )
}

export default HomePage
