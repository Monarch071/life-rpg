import { Fragment, useEffect, useState } from 'react'
import { refreshPush } from './push'
import { seedDefaultRewards } from './seed'
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
import Interview from './screens/Interview'
import Celebration from './ui/Celebration'
import Avatar, { EYE_OPTIONS, HAIR_OPTIONS } from './ui/Avatar'
import { DEFAULT_AVATAR } from './domain/replay'
import { House, Swords, User, ChartLine, ShoppingBag, Settings as SettingsIcon, X } from 'lucide-react'
import Logo from './ui/Logo'
import { useDialog } from './ui/useDialog'

// нижняя панель по брифу: 4 раздела и кнопка-символ в центре (меню: магазин, настройки)
const TABS = [
  { id: 'Главная', label: 'Главная', Icon: House }, { id: 'Анализ', label: 'Прогресс', Icon: ChartLine },
  { id: 'Задания', label: 'Задания', Icon: Swords }, { id: 'Герой', label: 'Профиль', Icon: User },
] as const
type Tab = (typeof TABS)[number]['id'] | 'Магазин' | 'Настройки'

function GameMenu({ go, onClose }: { go: (t: Tab) => void; onClose: () => void }) {
  const dlg = useDialog<HTMLDivElement>(onClose)
  const item = (t: Tab, Icon: typeof House, title: string, sub: string) => (
    <button className="menu-item" onClick={() => { go(t); onClose() }}>
      <span className="ico" style={{ '--c': 'var(--fire)' } as React.CSSProperties}><Icon aria-hidden="true" /></span>
      <span><b>{title}</b><small>{sub}</small></span>
    </button>
  )
  return (
    <div className="sheet-wrap" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="sheet" ref={dlg} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="menu-title">
        <div className="sheet-head"><h2 id="menu-title">Меню</h2><button className="icon-btn" aria-label="Закрыть" onClick={onClose}><X size={20} aria-hidden="true" /></button></div>
        {item('Магазин', ShoppingBag, 'Магазин и инвентарь', 'Награды за золото, одежда и эффекты')}
        {item('Настройки', SettingsIcon, 'Настройки', 'Синхронизация, ИИ, уведомления, валюта')}
      </div>
    </div>
  )
}

export default function App() {
  const state = useGame()
  useEffect(() => { void refreshPush().catch(() => {}); void seedDefaultRewards().catch(() => {}) }, [])
  const sync = useSync()
  const [tab, setTab] = useState<Tab>('Главная')
  const [ivw, setIvw] = useState(false)
  const [menu, setMenu] = useState(false)
  const openIvw = () => setIvw(true)
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
      {ivw && <Interview state={state} onClose={() => setIvw(false)} />}
      <main className="content">
        {tab === 'Главная' ? <Home state={state} profile={state.profile} go={go} interview={openIvw} />
          : tab === 'Задания' ? <Quests state={state} />
          : tab === 'Герой' ? <Character state={state} go={go} interview={openIvw} />
          : tab === 'Магазин' ? <Shop state={state} />
          : tab === 'Анализ' ? <Analytics state={state} />
          : <Settings state={state} sync={sync} />}
      </main>
      {menu && <GameMenu go={setTab} onClose={() => setMenu(false)} />}
      <nav className="tabbar">
        {TABS.map((t, i) => (<Fragment key={t.id}>
          {i === 2 && <button className={`tab-core${tab === 'Магазин' || tab === 'Настройки' ? ' active' : ''}`} aria-label="Меню: магазин и настройки" onClick={() => setMenu(true)}><Logo /></button>}
          <button className={t.id === tab ? 'active' : ''} aria-label={t.label} aria-current={t.id === tab ? 'page' : undefined} onClick={() => setTab(t.id)}>
            <t.Icon aria-hidden="true" /><span aria-hidden="true">{t.label}</span>
          </button>
        </Fragment>))}
      </nav>
    </div>
  )
}
