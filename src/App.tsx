import { useState } from 'react'
import { useGame } from './useGame'
import { useSync } from './useSync'
import { parseLoginHash } from './sync'
import JoinSync from './screens/JoinSync'
import Onboarding from './screens/Onboarding'
import Home from './screens/Home'
import Character from './screens/Character'
import Settings from './screens/Settings'
import Quests from './screens/Quests'
import Shop from './screens/Shop'
import Analytics from './screens/Analytics'
import Avatar, { EYE_OPTIONS, HAIR_OPTIONS } from './ui/Avatar'
import { DEFAULT_AVATAR } from './domain/replay'
import { House, Swords, User, ChartLine, ShoppingBag, Settings as SettingsIcon } from 'lucide-react'

const TABS = [
  { id: 'Главная', Icon: House }, { id: 'Задания', Icon: Swords },
  { id: 'Герой', Icon: User }, { id: 'Анализ', Icon: ChartLine },
  { id: 'Магазин', Icon: ShoppingBag }, { id: 'Настройки', Icon: SettingsIcon },
] as const
type Tab = (typeof TABS)[number]['id']

export default function App() {
  const state = useGame()
  const sync = useSync()
  const [tab, setTab] = useState<Tab>('Главная')
  const [login, setLogin] = useState(() => parseLoginHash(location.hash))
  const closeLogin = () => { history.replaceState(null, '', location.pathname + location.search); setLogin(null); sync.run() }
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
  const joinSheet = login && <JoinSync initial={login} onDone={closeLogin} />
  if (state.profile === null) return <>{joinSheet || <Onboarding />}</>
  return (
    <div className="app">
      {joinSheet}
      <main className="content">
        {tab === 'Главная' ? <Home state={state} profile={state.profile} />
          : tab === 'Задания' ? <Quests state={state} />
          : tab === 'Герой' ? <Character state={state} />
          : tab === 'Магазин' ? <Shop state={state} />
          : tab === 'Анализ' ? <Analytics state={state} />
          : <Settings state={state} sync={sync} />}
      </main>
      <nav className="tabbar">
        {TABS.map((t) => (
          <button key={t.id} className={t.id === tab ? 'active' : ''} aria-label={t.id} aria-current={t.id === tab ? 'page' : undefined} onClick={() => setTab(t.id)}>
            <t.Icon aria-hidden="true" />
          </button>
        ))}
      </nav>
    </div>
  )
}
