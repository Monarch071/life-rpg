import { useState } from 'react'
import { useGame } from './useGame'
import Onboarding from './screens/Onboarding'
import Home from './screens/Home'
import Character from './screens/Character'
import Settings from './screens/Settings'
import Avatar, { EYE_OPTIONS, HAIR_OPTIONS } from './ui/Avatar'
import { DEFAULT_AVATAR } from './domain/replay'

const TABS = ['Главная', 'Персонаж', 'Настройки'] as const
type Tab = (typeof TABS)[number]

export default function App() {
  const state = useGame()
  const [tab, setTab] = useState<Tab>('Главная')
  // dev-only витрина аватара: ?avatars
  if (import.meta.env.DEV && new URLSearchParams(location.search).has('avatars')) return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, padding: 8, overflow: 'auto', height: '100%' }}>
      {([1, 2, 3, 4] as const).flatMap(tier => [false, true].map(shadow => (
        <Avatar key={`${tier}${shadow}`} tier={tier} shadow={shadow} size={170}
          params={{ ...DEFAULT_AVATAR, hair: HAIR_OPTIONS[tier - 1], eyes: EYE_OPTIONS[(tier - 1) % 3], hairColor: ['#2b1d14', '#e8e8f0', '#c2185b', '#ffb703'][tier - 1] }} />
      )))}
    </div>
  )
  if (!state) return <div className="app"><p className="loading">Загрузка…</p></div>
  if (state.profile === null) return <Onboarding />
  return (
    <div className="app">
      <main className="content">
        {tab === 'Главная' ? (
          <Home state={state} profile={state.profile} />
        ) : tab === 'Персонаж' ? (
          <Character state={state} />
        ) : (
          <Settings />
        )}
      </main>
      <nav className="tabbar">
        {TABS.map((t) => (
          <button key={t} className={t === tab ? 'active' : ''} onClick={() => setTab(t)}>
            {t}
          </button>
        ))}
      </nav>
    </div>
  )
}
