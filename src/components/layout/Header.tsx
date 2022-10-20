import React from 'react'
import Menu from './Menu'
import styles from '../../styles/Header.module.scss'
import classNames from 'classnames'
import { useAmp } from "next/amp";

export const Header = (props) => {
    const isAmp = useAmp()

    return (
        <header className={styles.header}>
            <Menu />
            {isAmp ? null : <div className={styles.settings}>
                <label className={styles.switch} id='switch' htmlFor='slider'>
                    <input
                        role="switch"
                        aria-label='Переключатель темы'
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
        </header>
    )
}
