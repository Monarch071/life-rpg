import { useEffect, useId, useState } from 'react'
import type { AvatarParams } from '../domain/types'

export const HAIR_OPTIONS = ['short', 'spiky', 'long', 'ponytail'] as const
export const EYE_OPTIONS = ['round', 'sharp', 'calm'] as const

const GOLD = '#ffd166'

// Силуэт смотрит влево в 3/4, ветер дует вправо: волосы, полы и плащ летят вправо.
const HEAD = 'M90 46 C94 32 118 30 123 44 C126 55 124 67 119 74 L108 84 L98 85 C94 83 91 78 90 73 L87 65 C87 57 88 51 90 46Z'
const NECK = 'M99 76 L117 74 L118 94 L99 96Z'
const TORSO = 'M82 94 C70 96 63 102 62 112 L70 136 L80 150 L78 164 L124 164 L122 150 L132 136 L142 112 C141 101 133 96 121 93 L110 91 L96 91Z'
const COAT_BACK = 'M104 160 L124 152 C140 182 158 214 182 246 L164 244 L172 268 L150 254 L148 274 L132 252 L118 240Z'
const LEG_L = 'M84 158 L103 162 L97 246 L92 312 L95 330 L64 330 C66 322 72 316 78 312 L82 246Z'
const LEG_R = 'M102 162 L120 158 L130 242 L148 310 L166 330 L136 330 L134 314 L114 246Z'
const FLAP_L = 'M80 152 L99 162 L95 236 L84 254 L75 244 L58 264 L67 200Z'
const ARM_L = 'M66 100 C56 102 50 112 48 128 L42 152 L40 192 L38 205 L51 209 L53 194 L57 156 L64 133 L70 116Z'
const ARM_R = 'M138 100 C148 102 154 112 156 128 L160 152 L162 192 L165 205 L152 209 L150 194 L146 156 L139 133 L134 116Z'
const DETAIL = 'M96 92 L104 106 L112 92 M104 106 L104 150 M80 150 L122 150 M99 164 L95 236 M106 164 L118 240'

// Волосы: front — поверх головы (входит в силуэт), back — за телом
const HAIR: Record<string, { front: string; back?: string }> = {
  short: { front: 'M89 56 L84 47 L92 45 L88 35 L99 38 L101 27 L109 35 L118 27 L119 37 L130 35 L125 45 L133 50 L123 52 L124 63 L117 57 L113 49 L106 54 L103 47 L97 56 L94 49Z' },
  spiky: { front: 'M88 58 L76 50 L88 45 L74 30 L93 35 L90 13 L106 29 L117 6 L121 29 L139 16 L131 37 L152 35 L135 49 L145 61 L126 57 L124 71 L117 58 L112 50 L105 56 L101 49 L95 61 L93 53Z' },
  long: {
    front: 'M89 57 L85 46 L93 43 L91 33 L102 34 L108 27 L117 32 L127 31 L126 42 L131 52 L122 52 L123 62 L116 55 L112 48 L105 54 L102 47 L96 57 L94 50Z',
    back: 'M112 34 C128 30 136 46 140 70 C144 96 152 120 166 148 L150 140 L156 162 L138 140 L134 152 L126 124 C122 100 120 80 116 62Z',
  },
  ponytail: {
    front: 'M89 56 L85 47 L93 44 L91 36 L102 35 L110 29 L120 33 L126 42 L131 50 L122 52 L123 60 L116 54 L112 48 L105 53 L102 47 L97 56 L94 50Z',
    back: 'M117 36 C132 32 144 44 152 56 C160 68 172 74 188 74 L174 80 L188 90 L166 88 L174 100 L152 90 C140 82 132 68 122 56Z',
  },
}
// Светящиеся глаза — щёлки (дальний глаз меньше: голова в 3/4)
const EYE: Record<string, string> = {
  round: 'M-4 0 Q0 -3.2 4 0 Q0 2 -4 0Z',
  sharp: 'M-5 1 L5 -2.5 L3 1.2Z',
  calm: 'M-4 0 Q0 -1.6 4 -0.6 Q0 1.2 -4 0Z',
}
const CAPE = 'M74 96 C66 150 64 210 62 268 L76 260 L84 280 L96 264 L120 280 L130 262 L150 290 L156 266 L182 288 L178 258 L198 262 C178 210 160 140 130 94Z'
const PAULDRONS = 'M50 106 L68 92 L84 98 L78 112 L58 120 L48 116Z M120 96 L140 90 L156 104 L152 118 L132 112Z'

/** Светлее на долю t: смешение с белым. */
function light(hex: string, t = 0.55) {
  if (!/^#[0-9a-f]{6}$/i.test(hex)) return hex
  const c = [1, 3, 5].map(i => Math.round(parseInt(hex.slice(i, i + 2), 16) * (1 - t) + 255 * t))
  return `#${c.map(v => v.toString(16).padStart(2, '0')).join('')}`
}

interface Props { params: AvatarParams; tier: 1 | 2 | 3 | 4; shadow?: boolean; size?: number; decorative?: boolean; image?: string | null }

/** Тёмный аниме‑силуэт в полный рост с контурной подсветкой. Детали растут с тиром; shadow — фиолетовая Тень. */
export default function Avatar({ params, tier, shadow = false, size = 220, decorative = false, image = null }: Props) {
  const [bad, setBad] = useState(false)
  useEffect(() => setBad(false), [image])
  const uid = useId().replace(/:/g, '')
  const id = (k: string) => `${uid}${k}`
  const url = (k: string) => `url(#${uid}${k})`
  const hair = HAIR[params.hair] ?? HAIR.short
  const eye = EYE[params.eyes] ?? EYE.round
  const glow = params.outfitColor
  const glowL = light(glow)

  if (image && !bad) {
    return (
      <span className={`avatar-img${shadow ? ' avatar-img-shadow' : ''}`} style={{ width: (size * 2) / 3, height: size }}>
        <img src={image} alt={decorative ? '' : shadow ? 'Тень' : 'Твой персонаж'} onError={() => setBad(true)} />
      </span>
    )
  }

  return (
    <svg
      className={`avatar${shadow ? ' avatar-shadow' : ''}`}
      viewBox="0 0 200 340"
      width={(size * 200) / 340}
      height={size}
      {...(decorative ? { 'aria-hidden': true } : { role: 'img', 'aria-label': shadow ? 'Тень' : 'Твой персонаж' })}
    >
      <defs>
        <linearGradient id={id('b')} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#1b1b26" />
          <stop offset="1" stopColor="#0e0e14" />
        </linearGradient>
        {/* подсветка слева, слабый контровой свет справа */}
        <linearGradient id={id('r')} gradientUnits="userSpaceOnUse" x1="36" y1="0" x2="196" y2="0">
          <stop offset="0" stopColor={glowL} />
          <stop offset="0.3" stopColor={glow} stopOpacity={0.85} />
          <stop offset="0.55" stopColor={glow} stopOpacity={0} />
          <stop offset="1" stopColor={glow} stopOpacity={0.4} />
        </linearGradient>
        <linearGradient id={id('c')} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#14121c" />
          <stop offset="1" stopColor={glow} stopOpacity={0.28} />
        </linearGradient>
        <linearGradient id={id('s')} gradientUnits="userSpaceOnUse" x1="155" y1="210" x2="190" y2="322">
          <stop offset="0" stopColor="#fff" />
          <stop offset="1" stopColor={glowL} />
        </linearGradient>
        <radialGradient id={id('a')}>
          <stop offset="0" stopColor={glow} stopOpacity={0.45} />
          <stop offset="1" stopColor={glow} stopOpacity={0} />
        </radialGradient>
        <filter id={id('g')} x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="2.2" /></filter>
        <g id={id('sil')}>
          {hair.back && <path d={hair.back} />}
          <path d={COAT_BACK} />
          <path d={LEG_L} /><path d={LEG_R} />
          <path d={TORSO} /><path d={FLAP_L} />
          <path d={ARM_L} /><path d={ARM_R} />
          <path d={NECK} /><path d={HEAD} /><path d={hair.front} />
          {tier >= 3 && <path d={PAULDRONS} />}
        </g>
      </defs>

      {tier === 4 && (
        <g className="aura">
          <ellipse cx={100} cy={170} rx={96} ry={160} fill={url('a')} />
          <ellipse cx={100} cy={170} rx={88} ry={150} fill="none" stroke={glow} strokeOpacity={0.35} strokeWidth={1} strokeDasharray="2 6" />
        </g>
      )}
      <ellipse cx={104} cy={331} rx={58} ry={6} fill="#000" opacity={0.55} />
      {tier === 4 && <g fill="none" stroke={glowL} strokeWidth={1.2}>
        <ellipse cx={104} cy={330} rx={62} ry={8} opacity={0.8} />
        <ellipse cx={104} cy={330} rx={84} ry={11} opacity={0.4} />
      </g>}

      {tier >= 2 && <path d={CAPE} fill={url('c')} stroke={url('r')} strokeWidth={2.4} strokeLinejoin="round" />}

      {/* контур: обводка снизу, заливка сверху — видна только внешняя кромка */}
      <use href={`#${id('sil')}`} fill="none" stroke={url('r')} strokeWidth={6} strokeLinejoin="round" filter={url('g')} opacity={0.7} />
      <use href={`#${id('sil')}`} fill={url('b')} stroke={url('r')} strokeWidth={3.4} strokeLinejoin="round" />
      <use href={`#${id('sil')}`} fill={url('b')} />
      <path d={hair.front} fill={params.hairColor} opacity={0.3} />
      {hair.back && <path d={hair.back} fill={params.hairColor} opacity={0.22} />}
      <path d={DETAIL} fill="none" stroke={glow} strokeOpacity={0.22} strokeWidth={1} strokeLinecap="round" />
      {tier >= 3 && <path d={PAULDRONS} fill="none" stroke={glow} strokeOpacity={0.55} strokeWidth={1} strokeLinejoin="round" />}

      {/* глаза */}
      <g fill={glowL}>
        <g filter={url('g')} opacity={0.9}>
          <path d={eye} transform="translate(97 63) scale(0.8)" fill={glow} />
          <path d={eye} transform="translate(111 62)" fill={glow} />
        </g>
        <path d={eye} transform="translate(97 63) scale(0.8)" />
        <path d={eye} transform="translate(111 62)" />
      </g>

      {/* меч в правой руке */}
      {tier >= 3 && (
        <g>
          <path d="M155 210 L162 208 L193 322 L189 323Z" fill={glow} filter={url('g')} opacity={0.9} />
          <path d="M155 210 L162 208 L193 322 L189 323Z" fill={url('s')} />
          <path d="M146 214 L169 206" stroke="#0e0e14" strokeWidth={4} strokeLinecap="round" />
          <path d="M146 214 L169 206" stroke={glow} strokeOpacity={0.7} strokeWidth={1} strokeLinecap="round" />
          <path d="M153 196 L157 208" stroke="#0e0e14" strokeWidth={4} strokeLinecap="round" />
        </g>
      )}

      {/* корона из света */}
      {tier === 4 && (
        <g className="crown">
          <path d="M88 22 L92 10 L97 18 L104 4 L111 18 L116 10 L120 22 Q104 28 88 22Z" fill={GOLD} filter={url('g')} opacity={0.8} />
          <path d="M88 22 L92 10 L97 18 L104 4 L111 18 L116 10 L120 22 Q104 28 88 22Z" fill="none" stroke="#fff6d6" strokeWidth={1.2} strokeLinejoin="round" />
          {[[34, 96], [168, 128], [42, 240], [172, 246], [150, 40]].map(([x, y]) => <circle key={x} cx={x} cy={y} r={1.8} fill={glowL} />)}
        </g>
      )}
    </svg>
  )
}
