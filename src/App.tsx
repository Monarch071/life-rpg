import { useState } from 'react'
import { useGame } from './useGame'
import Onboarding from './screens/Onboarding'

const TABS = ['Главная', 'Персонаж', 'Настройки'] as const
type Tab = (typeof TABS)[number]

export default function App() {
  const state = useGame()
  const [tab, setTab] = useState<Tab>('Главная')
  if (!state) return <div className="app"><p className="loading">Загрузка…</p></div>
  if (state.profile === null) return <Onboarding />
  return (
    <div className="app">
      <main className="content">
        <section className="panel">
          <h1>{tab}</h1>
          <p>Скоро здесь будет контент.</p>
        </section>
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
