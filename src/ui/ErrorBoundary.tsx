import { Component, type ReactNode } from 'react'
import { exportData, importData } from '../backup'
import { saveBackup } from './saveFile'

export default class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean; msg: string }> {
  state = { failed: false, msg: '' }
  static getDerivedStateFromError() { return { failed: true } }
  componentDidCatch(e: unknown) { console.error(e) }

  backup = async () => {
    try { await saveBackup(await exportData()); this.setState({ msg: 'Копия сохранена.' }) }
    catch { this.setState({ msg: 'Не удалось сохранить копию.' }) }
  }
  restore = async (f?: File) => {
    if (!f) return
    const r = await importData(f)
    if (r.ok) location.reload()
    else this.setState({ msg: r.error })
  }

  render() {
    if (!this.state.failed) return this.props.children
    return (
      <div className="content"><section className="panel stack" role="alert">
        <h1>Что-то пошло не так</h1>
        <p className="muted">Приложение столкнулось с ошибкой. Данные на устройстве целы — на всякий случай сохраните резервную копию.</p>
        <button className="btn primary big" onClick={this.backup}>Сохранить резервную копию</button>
        <label className="btn big" style={{ cursor: 'pointer' }}>Восстановить из файла
          <input type="file" accept="application/json,.json" hidden aria-label="Восстановить из файла"
            onChange={e => { void this.restore(e.target.files?.[0]); e.target.value = '' }} />
        </label>
        <button className="btn ghost big" onClick={() => location.reload()}>Перезагрузить</button>
        {this.state.msg && <p aria-live="polite">{this.state.msg}</p>}
      </section></div>
    )
  }
}
