import { useEffect } from 'react'
import { setMoneyStyle } from '@/app/components/grid/parse.ts'
import { useSettings } from '@/state/settingsStore.ts'

/** Applies theme, density and number format [FR-UI-16]. */
export function useDisplaySettings() {
  const theme = useSettings((s) => s.theme)
  const density = useSettings((s) => s.density)
  const numberFormat = useSettings((s) => s.numberFormat)
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const apply = () =>
      document.documentElement.classList.toggle('dark', theme === 'dark' || (theme === 'system' && mq.matches))
    apply()
    mq.addEventListener('change', apply)
    return () => mq.removeEventListener('change', apply)
  }, [theme])
  useEffect(() => {
    document.documentElement.style.fontSize = density === 'comfortable' ? '17.5px' : ''
  }, [density])
  setMoneyStyle(numberFormat)
}
