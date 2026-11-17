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
import Celebration from './ui/Celebration'
import Avatar, { EYE_OPTIONS, HAIR_OPTIONS } from './ui/Avatar'
import { DEFAULT_AVATAR } from './domain/replay'
import { House, Swords, User, ChartLine, ShoppingBag, Settings as SettingsIcon } from 'lucide-react'

const TABS = [
  { id: 'Главная', Icon: House, label: true }, { id: 'Задания', Icon: Swords, label: true },
  { id: 'Герой', Icon: User, label: true }, { id: 'Анализ', Icon: ChartLine, label: true },
  { id: 'Магазин', Icon: ShoppingBag, label: true }, { id: 'Настройки', Icon: SettingsIcon, label: false },
] as const
type Tab = (typeof TABS)[number]['id']

export default function App() {
  const state = useGame()
  const sync = useSync()
  const [tab, setTab] = useState<Tab>('Главная')
  const [login, setLogin] = useState(() => parseLoginHash(location.hash))
  // переход на вкладку и прокрутка к блоку; блок дорисовывается асинхронно — ждём его высоту (до ~1 с)
  const go = (t: 'Герой' | 'Настройки', id: string) => {
    setTab(t)
    let n = 0
    const tick = () => { const el = document.getElementById(id); if (el?.offsetHeight) el.scrollIntoView({ block: 'start' }); else if (n++ < 20) setTimeout(tick, 50) }
    setTimeout(tick, 50)
  }
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
      <Celebration state={state} />
      <main className="content">
        {tab === 'Главная' ? <Home state={state} profile={state.profile} go={go} />
          : tab === 'Задания' ? <Quests state={state} />
          : tab === 'Герой' ? <Character state={state} go={go} />
          : tab === 'Магазин' ? <Shop state={state} />
          : tab === 'Анализ' ? <Analytics state={state} />
          : <Settings state={state} sync={sync} />}
      </main>
      <nav className="tabbar">
        {TABS.map((t) => (
          <button key={t.id} className={t.id === tab ? 'active' : ''} aria-label={t.id} aria-current={t.id === tab ? 'page' : undefined} onClick={() => setTab(t.id)}>
            <t.Icon aria-hidden="true" />{t.label && <span aria-hidden="true">{t.id}</span>}
          </button>
        ))}
      </nav>
    </div>
  )
}
