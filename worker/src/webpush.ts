// Web Push без библиотек: шифрование RFC 8291 (aes128gcm) и подпись VAPID RFC 8292 на WebCrypto.

const te = new TextEncoder()

export const b64u = (b: Uint8Array): string => {
  let s = ''
  for (const x of b) s += String.fromCharCode(x)
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
export const unb64u = (s: string): Uint8Array =>
  Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0))

const cat = (...a: Uint8Array[]): Uint8Array => {
  const out = new Uint8Array(a.reduce((n, x) => n + x.length, 0))
  let o = 0
  for (const x of a) { out.set(x, o); o += x.length }
  return out
}

async function hmac(key: Uint8Array, data: Uint8Array): Promise<Uint8Array> {
  const k = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  return new Uint8Array(await crypto.subtle.sign('HMAC', k, data))
}

// JWK из несжатой точки P-256 (65 байт) и, опционально, приватного d
const jwk = (pub: Uint8Array, d?: string): JsonWebKey => ({
  kty: 'EC', crv: 'P-256', x: b64u(pub.slice(1, 33)), y: b64u(pub.slice(33, 65)), ...(d ? { d } : {}),
})

export interface ServerKeys { publicRaw: Uint8Array; privateD: string }

async function ephemeral(): Promise<ServerKeys> {
  const kp = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']) as CryptoKeyPair
  const publicRaw = new Uint8Array(await crypto.subtle.exportKey('raw', kp.publicKey) as ArrayBuffer)
  const { d } = await crypto.subtle.exportKey('jwk', kp.privateKey) as JsonWebKey
  return { publicRaw, privateD: d! }
}

/** Тело запроса aes128gcm. salt и keys передаются только в тестах (вектор RFC 8291). */
export async function encrypt(
  plaintext: Uint8Array, p256dh: string, auth: string,
  salt = crypto.getRandomValues(new Uint8Array(16)), keys?: ServerKeys,
): Promise<Uint8Array> {
  const ua = unb64u(p256dh)
  const as = keys ?? await ephemeral()
  const priv = await crypto.subtle.importKey('jwk', jwk(as.publicRaw, as.privateD), { name: 'ECDH', namedCurve: 'P-256' }, false, ['deriveBits'])
  const pubUa = await crypto.subtle.importKey('raw', ua, { name: 'ECDH', namedCurve: 'P-256' }, false, [])
  const ecdh = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: pubUa }, priv, 256))
  const prkKey = await hmac(unb64u(auth), ecdh)
  const ikm = await hmac(prkKey, cat(te.encode('WebPush: info\0'), ua, as.publicRaw, new Uint8Array([1])))
  const prk = await hmac(salt, ikm)
  const cek = (await hmac(prk, te.encode('Content-Encoding: aes128gcm\0\x01'))).slice(0, 16)
  const nonce = (await hmac(prk, te.encode('Content-Encoding: nonce\0\x01'))).slice(0, 12)
  const key = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt'])
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, key, cat(plaintext, new Uint8Array([2]))))
  const header = cat(salt, new Uint8Array([0, 0, 0x10, 0, 65]), as.publicRaw) // rs = 4096
  return cat(header, ct)
}

export interface Vapid { publicKey: string; privateD: string; subject: string }

export async function vapidHeader(endpoint: string, v: Vapid, nowSec = Math.floor(Date.now() / 1000)): Promise<string> {
  const enc = (o: object) => b64u(te.encode(JSON.stringify(o)))
  const unsigned = `${enc({ typ: 'JWT', alg: 'ES256' })}.${enc({ aud: new URL(endpoint).origin, exp: nowSec + 12 * 3600, sub: v.subject })}`
  const key = await crypto.subtle.importKey('jwk', jwk(unb64u(v.publicKey), v.privateD), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign'])
  const sig = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, te.encode(unsigned)))
  return `vapid t=${unsigned}.${b64u(sig)}, k=${v.publicKey}`
}

export interface PushSub { endpoint: string; p256dh: string; auth: string }

/** Возвращает HTTP-статус push-сервиса (404/410 — подписка мертва). */
export async function sendPush(sub: PushSub, payload: object, v: Vapid, fetcher: typeof fetch = fetch): Promise<number> {
  const body = await encrypt(te.encode(JSON.stringify(payload)), sub.p256dh, sub.auth)
  const res = await fetcher(sub.endpoint, {
    method: 'POST',
    headers: {
      authorization: await vapidHeader(sub.endpoint, v),
      'content-encoding': 'aes128gcm',
      'content-type': 'application/octet-stream',
      ttl: String(4 * 3600),
      urgency: 'normal',
    },
    body,
  })
  return res.status
}

// Только известные push-сервисы: сервер не должен слать POST на произвольные адреса
const PUSH_HOSTS = [/\.push\.apple\.com$/, /^fcm\.googleapis\.com$/, /\.push\.services\.mozilla\.com$/, /\.notify\.windows\.com$/]
export function isPushEndpoint(s: unknown): s is string {
  if (typeof s !== 'string' || s.length > 1000) return false
  try {
    const u = new URL(s)
    return u.protocol === 'https:' && PUSH_HOSTS.some(r => r.test(u.hostname))
  } catch { return false }
}
