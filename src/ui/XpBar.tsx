const SEGS = 30

export default function XpBar({ into, need, label = 'Опыт до следующего уровня', unit = ' XP' }: { into: number; need: number; label?: string; unit?: string }) {
  const on = need > 0 ? Math.min(SEGS, Math.max(0, Math.round((into / need) * SEGS))) : 0
  return (
    <div className="xp-seg">
      <div className="segs" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={need} aria-valuenow={Math.min(into, need)}>
        {Array.from({ length: SEGS }, (_, i) => <i key={i} className={i < on ? 'on' : undefined} style={{ animationDelay: `${i * 12}ms` }} />)}
      </div>
      <div className="meta"><b>{into.toLocaleString('ru-RU')}</b> / {need.toLocaleString('ru-RU')}{unit}</div>
    </div>
  )
}
