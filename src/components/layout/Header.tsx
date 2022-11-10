import classNames from 'classnames'
import { useAmp } from 'next/amp'
import React from 'react'
import useTranslation from '../../lib/hooks/useTranslation'
import { Locale, Theme } from '../../lib/types'
import styles from '../../styles/Header.module.scss'
import Menu from './Menu'

type HeaderProps = {
  theme: Theme
  setTheme: (theme: Theme) => void
}

export const Header = (props: HeaderProps) => {
  const { t, locale, setLocale, isForeign } = useTranslation()
  const isAmp = useAmp()

  return (
    <header className={styles.header}>
      <Menu />
      <div className='settings'>
        {isAmp ? null : (
          <div
            className='languageSwitch'
            onClick={() => setLocale(isForeign ? Locale.RU : Locale.EN)}
          >
            {locale.toUpperCase()}
          </div>
        )}
        {isAmp ? null : (
          <div className={styles.settings}>
            <label className={styles.switch} htmlFor='slider' id='switch'>
              <input
                aria-checked={props.theme === 'light'}
                aria-label={t('ARIA_THEME_SWITCH')}
                checked={props.theme === 'light'}
                id='slider'
                role='switch'
                type='checkbox'
                onChange={() => {
                  const newTheme =
                    props.theme === Theme.Light ? Theme.Dark : Theme.Light
                  props.setTheme(newTheme)
                  document.body.setAttribute('data-theme', newTheme)
                }}
              />
              <span className={classNames(styles.slider, styles.round)} />
            </label>
          </div>
        )}
      </div>
    </header>
  )
}
