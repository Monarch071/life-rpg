import { useId } from 'react'
import type { AvatarParams } from '../domain/types'

export const HAIR_OPTIONS = ['short', 'spiky', 'long', 'ponytail'] as const
export const EYE_OPTIONS = ['round', 'sharp', 'calm'] as const

const SKIN = '#f6d7c3'
const INK = '#1b1b2a'
const GOLD = '#ffd166'
const SHADE = { fill: '#000', opacity: 0.22 } // затемнение поверх любого цвета

// Волосы: задний слой (за лицом) и чёлка (поверх лба)
const HAIR_BACK: Record<string, string> = {
  short: 'M64 74 Q58 24 100 22 Q142 24 136 74 L134 96 L66 96Z',
  spiky: 'M64 82 L48 58 L68 50 L58 22 L84 32 L92 6 L108 28 L128 8 L124 34 L150 26 L134 54 L154 64 L136 86Z',
  long: 'M62 60 Q56 20 100 20 Q144 20 138 60 L148 196 Q124 212 100 204 Q76 212 52 196Z',
  ponytail: 'M64 74 Q58 24 100 22 Q142 24 136 74 L134 96 L66 96Z M124 40 Q172 56 160 140 Q154 176 166 204 Q132 186 136 130 Q140 84 118 56Z',
}
const HAIR_FRONT: Record<string, string> = {
  short: 'M66 72 Q62 28 100 26 Q138 28 134 72 L128 58 L122 72 L112 54 L104 70 L96 52 L86 70 L80 56 L72 72Z',
  spiky: 'M64 74 Q60 30 100 28 Q140 30 136 74 L130 56 L124 76 L114 50 L106 70 L98 46 L88 72 L82 52 L72 76Z',
  long: 'M64 104 Q58 30 100 26 Q142 30 136 104 L130 106 L128 64 L118 58 L108 72 L100 52 L90 72 L82 58 L72 64 L70 106Z',
  ponytail: 'M66 74 Q62 28 100 26 Q138 28 134 66 Q118 50 96 66 Q90 56 84 70 Q76 60 70 76Z',
}
// Глаза в локальных координатах левого глаза (внешний угол слева); правый — зеркально
const EYE: Record<string, { shape: string; lid: string; brow: string }> = {
  round: { shape: 'M-9 0 C-9 -13 9 -13 9 0 C9 12 -9 12 -9 0Z', lid: 'M-11 -1 C-9 -14 9 -14 10 -3 M-10 -3 L-14 -7', brow: 'M-8 -18 Q0 -21 8 -18' },
  sharp: { shape: 'M-11 -4 Q-2 -11 9 -5 Q8 6 0 7 Q-7 6 -11 -4Z', lid: 'M-12 -4 Q-2 -12 10 -5 M-11 -5 L-15 -9', brow: 'M-10 -19 L9 -13' },
  calm: { shape: 'M-10 -1 Q0 -7 10 -1 Q8 7 0 7 Q-8 7 -10 -1Z', lid: 'M-11 -1 Q0 -8 11 -1', brow: 'M-8 -16 Q0 -18 8 -16' },
}

interface Props { params: AvatarParams; tier: 1 | 2 | 3 | 4; shadow?: boolean; size?: number }

/** Оригинальный аниме‑персонаж в полный рост. Одежда и аура растут с тиром; shadow — тёмная копия‑Тень. */
export default function Avatar({ params, tier, shadow = false, size = 220 }: Props) {
  const uid = useId().replace(/:/g, '')
  const hair = HAIR_BACK[params.hair] ? params.hair : 'short'
  const eye = EYE[params.eyes] ?? EYE.round
  const outfit = params.outfitColor
  const hairColor = params.hairColor
  const hips = tier >= 3 // уверенная поза: руки на поясе
  const armL = hips ? 'M76 142 L50 178 L70 204' : 'M76 142 Q62 170 62 214'
  const sleeveL = tier >= 2 ? armL : hips ? 'M76 142 L62 160' : 'M76 142 Q69 156 66 168'
  const handL: [number, number] = hips ? [71, 204] : [62, 218]
  const pants = tier === 1 ? '#2c3e66' : tier === 2 ? '#2a2f45' : '#20243a'
  const mirror = (d: string) => <g transform="translate(200 0) scale(-1 1)"><path d={d} /></g>

  const eyeG = (x: number, flip: boolean) => (
    <g transform={`translate(${x} 86)${flip ? ' scale(-1 1)' : ''}`}>
      <path d={eye.brow} stroke={hairColor} strokeWidth={2.8} strokeLinecap="round" fill="none" />
      <g clipPath={`url(#${uid}e)`}>
        <path d={eye.shape} fill="#fff" />
        <circle cx={0} cy={1} r={7.5} fill={outfit} />
        <circle cx={0} cy={-3} r={7.5} {...SHADE} />
        <circle cx={0} cy={1.5} r={3.4} fill={INK} />
        <circle cx={-3} cy={-3} r={2.6} fill="#fff" />
        <circle cx={3} cy={4} r={1.2} fill="#fff" />
      </g>
      <path d={eye.lid} stroke={INK} strokeWidth={2.6} strokeLinecap="round" fill="none" />
    </g>
  )

  return (
    <svg
      className={`avatar${shadow ? ' avatar-shadow' : ''}`}
      viewBox="0 0 200 340"
      width={(size * 200) / 340}
      height={size}
      role="img"
      aria-label={shadow ? 'Тень' : 'Твой персонаж'}
    >
      <defs>
        <clipPath id={`${uid}e`}><path d={eye.shape} /></clipPath>
        <radialGradient id={`${uid}a`}>
          <stop offset="0" stopColor={GOLD} stopOpacity={0.55} />
          <stop offset="0.6" stopColor={outfit} stopOpacity={0.25} />
          <stop offset="1" stopColor={outfit} stopOpacity={0} />
        </radialGradient>
      </defs>

      {tier === 4 && (
        <g className="aura">
          <ellipse cx={100} cy={180} rx={98} ry={165} fill={`url(#${uid}a)`} />
          {[[30, 90], [172, 120], [40, 250], [160, 280], [100, 14]].map(([x, y]) => (
            <circle key={x} cx={x} cy={y} r={2.5} fill={GOLD} />
          ))}
        </g>
      )}

      {/* плащ */}
      {tier >= 3 && (
        <g>
          <path d="M70 136 Q38 220 44 328 L156 328 Q162 220 130 136Z" fill={outfit} stroke={tier === 4 ? GOLD : 'none'} strokeWidth={3} />
          <path d="M70 136 Q38 220 44 328 L156 328 Q162 220 130 136Z" {...SHADE} opacity={0.45} />
        </g>
      )}

      {/* волосы сзади */}
      <path d={HAIR_BACK[hair]} fill={hairColor} />
      {hair === 'ponytail' && <circle cx={126} cy={46} r={5} fill={outfit} />}

      {/* ноги */}
      <g fill={pants}>
        <path d="M68 208 L99 208 L96 318 L76 318Z" />
        <path d="M101 208 L132 208 L124 318 L104 318Z" />
      </g>
      <path d="M99 214 L98 316 L104 318Z" {...SHADE} />
      {tier >= 3 && <g fill="#8a94b0"><ellipse cx={86} cy={262} rx={10} ry={8} /><ellipse cx={114} cy={262} rx={10} ry={8} /></g>}
      <g fill={tier === 1 ? '#f2f4f8' : '#2b2233'}>
        <path d="M72 316 L98 316 Q100 330 92 332 L66 332 Q62 324 72 316Z" />
        <path d="M102 316 L128 316 Q138 324 134 332 L108 332 Q100 330 102 316Z" />
      </g>
      {tier === 1 && <path d="M66 330 L92 330 M108 330 L134 330" stroke={outfit} strokeWidth={3} />}

      {/* руки (кожа), рукава поверх */}
      <g stroke={SKIN} strokeWidth={12} strokeLinecap="round" strokeLinejoin="round" fill="none">
        <path d={armL} />{mirror(armL)}
      </g>
      <g stroke={tier >= 2 ? '#1d2338' : outfit} strokeWidth={13} strokeLinecap="round" strokeLinejoin="round" fill="none">
        <path d={sleeveL} />{mirror(sleeveL)}
      </g>
      <g fill={SKIN}><circle cx={handL[0]} cy={handL[1]} r={7} /><circle cx={200 - handL[0]} cy={handL[1]} r={7} /></g>

      {/* торс */}
      <path d="M70 140 Q72 132 92 130 L108 130 Q128 132 130 140 L134 212 L66 212Z" fill={outfit} />
      <path d="M118 134 Q128 136 130 140 L134 212 L116 212Z" {...SHADE} />
      <path d="M90 131 Q100 140 110 131" stroke={INK} strokeOpacity={0.4} strokeWidth={2} fill="none" />
      {tier === 1 && <circle cx={100} cy={168} r={8} fill="#fff" opacity={0.85} />}

      {/* куртка + первая экипировка */}
      {tier >= 2 && (
        <g>
          <path d="M70 140 Q72 132 90 130 L96 212 L66 212Z" fill="#1d2338" />
          <path d="M130 140 Q128 132 110 130 L104 212 L134 212Z" fill="#1d2338" />
          <path d="M90 130 L84 150 L94 146Z M110 130 L116 150 L106 146Z" fill={outfit} />
          <rect x={66} y={196} width={68} height={8} fill="#3a2a1e" />
          <rect x={95} y={195} width={10} height={10} rx={2} fill={GOLD} />
          <rect x={112} y={199} width={12} height={14} rx={3} fill="#5a4030" />
          {!hips && <rect x={56} y={190} width={12} height={12} rx={3} fill="#8a94b0" />}
        </g>
      )}

      {/* броня */}
      {tier >= 3 && (
        <g>
          <path d="M80 140 Q100 132 120 140 L118 182 Q100 192 82 182Z" fill={tier === 4 ? '#c9d2ea' : '#9aa6c4'} stroke={tier === 4 ? GOLD : '#5d6785'} strokeWidth={2} />
          <ellipse cx={72} cy={142} rx={14} ry={10} fill={tier === 4 ? GOLD : '#8a94b0'} stroke="#5d6785" strokeWidth={1.5} />
          <ellipse cx={128} cy={142} rx={14} ry={10} fill={tier === 4 ? GOLD : '#8a94b0'} stroke="#5d6785" strokeWidth={1.5} />
          {tier === 4 && <circle className="gem" cx={100} cy={160} r={6} fill="#2fb5ff" />}
        </g>
      )}

      {/* шея и голова */}
      <rect x={92} y={110} width={16} height={24} fill={SKIN} />
      <rect x={92} y={110} width={16} height={8} {...SHADE} />
      <ellipse cx={67} cy={86} rx={5} ry={8} fill={SKIN} />
      <ellipse cx={133} cy={86} rx={5} ry={8} fill={SKIN} />
      <path d="M68 66 Q68 104 86 116 Q100 126 114 116 Q132 104 132 66 Q132 32 100 32 Q68 32 68 66Z" fill={SKIN} />
      <g fill="#ff8fa3" opacity={0.3}><ellipse cx={80} cy={100} rx={6} ry={3} /><ellipse cx={120} cy={100} rx={6} ry={3} /></g>
      {eyeG(86, false)}
      {eyeG(114, true)}
      <path d="M100 94 L99 98" stroke={INK} strokeOpacity={0.5} strokeWidth={1.5} strokeLinecap="round" />
      <path d={hips ? 'M94 106 Q101 110 107 104' : 'M95 106 Q100 109 105 106'} stroke={INK} strokeWidth={2} strokeLinecap="round" fill="none" />

      {/* чёлка */}
      <path d={HAIR_FRONT[hair]} fill={hairColor} />
      <path d="M78 40 Q100 31 122 40" stroke="#fff" strokeOpacity={0.35} strokeWidth={3} strokeLinecap="round" fill="none" />
      {tier === 4 && <path d="M74 52 Q100 42 126 52" stroke={GOLD} strokeWidth={3} fill="none" />}
    </svg>
  )
}
