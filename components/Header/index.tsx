import React, { useEffect } from 'react'
import Menu from '../Menu'
import styles from './Header.module.scss'
import classNames from 'classnames'
import {useLocalStorage} from "../../lib/hooks/useLocalStorage";

const Header = () => {
    const [theme, setTheme] = useLocalStorage<'dark' | 'light'>('dark', 'theme')

    useEffect(() => {
        document.body.setAttribute('data-theme', theme)
    }, [theme])

    return (
        <header className={styles.header}>
            <Menu />
            <div className={styles.settings}>
                <label className={styles.switch} id='switch'>
                    <input
                        checked={theme === 'light'}
                        id='slider'
                        type='checkbox'
                        onChange={() => {
                            const newTheme = theme === 'light' ? 'dark' : 'light'
                            setTheme(newTheme)
                            document.body.setAttribute('data-theme', newTheme)
                        }}
                    />
                    <span className={classNames(styles.slider, styles.round)} />
                </label>
            </div>
        </header>
    )
}

export default Header
