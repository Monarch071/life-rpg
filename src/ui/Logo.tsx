/** Символ LifeRPG: шестигранник с шевроном роста. */
export default function Logo({ size = 28 }: { size?: number }) {
  return (
    <svg className="logo" width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <defs>
        <linearGradient id="lg-a" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#c9b8ff" /><stop offset="1" stopColor="#8757ff" /></linearGradient>
      </defs>
      <path d="M16 2.5 27.7 9.25v13.5L16 29.5 4.3 22.75V9.25Z" fill="none" stroke="url(#lg-a)" strokeWidth="2" strokeLinejoin="round" />
      <path d="M10 19.5 16 13l6 6.5" fill="none" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M12.5 23.5 16 19.8l3.5 3.7" fill="none" stroke="url(#lg-a)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" opacity=".8" />
    </svg>
  )
}

/** Логотип со словом: для шапки главной. */
export function Wordmark() {
  return <span className="wordmark"><Logo size={22} /><b>LIFE<em>RPG</em></b></span>
}
