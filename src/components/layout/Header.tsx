import React from 'react'
import Menu from './Menu'
import styles from '../../styles/Header.module.scss'
import classNames from 'classnames'
import { useAmp } from "next/amp";
import useTranslation from "../../lib/hooks/useTranslation";

export const Header = (props) => {
    const { t, locale, setLocale } = useTranslation()
    const isAmp = useAmp()

    return (
        <header className={styles.header}>
            <Menu />
            <div className="settings">
            {isAmp ? null : <div className="languageSwitch" onClick={() => setLocale(locale === 'ru' ? 'en' : 'ru')}>{locale.toUpperCase()}</div>}
            {isAmp ? null : <div className={styles.settings}>
                <label className={styles.switch} id='switch' htmlFor='slider'>
                    <input
                        role="switch"
                        aria-label={t('ARIA_THEME_SWITCH')}
                        aria-checked={props.theme === 'light'}
                        checked={props.theme === 'light'}
                        id='slider'
                        type='checkbox'
                        onChange={() => {
                            const newTheme = props.theme === 'light' ? 'dark' : 'light'
                            props.setTheme(newTheme)
                            document.body.setAttribute('data-theme', newTheme)
                        }}
                    />
                    <span className={classNames(styles.slider, styles.round)} />
                </label>
            </div>}
            </div>
        </header>
    )
}
