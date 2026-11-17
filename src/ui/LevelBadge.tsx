export default function LevelBadge({ level, big }: { level: number; big?: boolean }) {
  return <div className={big ? 'lvl-badge big' : 'lvl-badge'} aria-label={`Уровень ${level}`}><b>{level}</b><small>LEVEL</small></div>
}
