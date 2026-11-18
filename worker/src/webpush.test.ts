import { describe, expect, it } from 'vitest'
import { b64u, encrypt, isPushEndpoint, sendPush, unb64u, vapidHeader } from './webpush'

// RFC 8291, приложение A
const V = {
  plaintext: 'V2hlbiBJIGdyb3cgdXAsIEkgd2FudCB0byBiZSBhIHdhdGVybWVsb24',
  asPublic: 'BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8',
  asPrivate: 'yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw',
  uaPublic: 'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4',
  salt: 'DGv6ra1nlYgDCS1FRnbzlw',
  auth: 'BTBZMqHH6r4Tts7J_aSIgg',
  header: 'DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8',
  ct: '8pfeW0KbunFT06SuDKoJH9Ql87S1QUrdirN6GcG7sFz1y1sqLgVi1VhjVkHsUoEsbI_0LpXMuGvnzQ',
}

async function vapidKeys() {
  const kp = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']) as CryptoKeyPair
  const pub = new Uint8Array(await crypto.subtle.exportKey('raw', kp.publicKey) as ArrayBuffer)
  const { d } = await crypto.subtle.exportKey('jwk', kp.privateKey) as JsonWebKey
  return { kp, v: { publicKey: b64u(pub), privateD: d!, subject: 'https://example.com/app/' } }
}

describe('webpush', () => {
  it('шифрование совпадает с вектором RFC 8291', async () => {
    const out = await encrypt(unb64u(V.plaintext), V.uaPublic, V.auth, unb64u(V.salt),
      { publicRaw: unb64u(V.asPublic), privateD: V.asPrivate })
    expect(b64u(out.slice(0, 86))).toBe(V.header)
    expect(b64u(out.slice(86))).toBe(V.ct)
  })

  it('VAPID: JWT подписан ключом и адресован origin push-сервиса', async () => {
    const { kp, v } = await vapidKeys()
    const h = await vapidHeader('https://web.push.apple.com/abc', v, 1000)
    const m = /^vapid t=([^.]+)\.([^.]+)\.([^,]+), k=(.+)$/.exec(h)!
    expect(m[4]).toBe(v.publicKey)
    expect(JSON.parse(new TextDecoder().decode(unb64u(m[2])))).toEqual({ aud: 'https://web.push.apple.com', exp: 1000 + 43200, sub: v.subject })
    const ok = await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, kp.publicKey, unb64u(m[3]), new TextEncoder().encode(`${m[1]}.${m[2]}`))
    expect(ok).toBe(true)
  })

  it('sendPush шлёт зашифрованное тело с нужными заголовками', async () => {
    const { v } = await vapidKeys()
    let seen: { url: string; init: RequestInit } | null = null
    const status = await sendPush({ endpoint: 'https://fcm.googleapis.com/x', p256dh: V.uaPublic, auth: V.auth }, { title: 't' }, v,
      (async (url: string, init: RequestInit) => { seen = { url, init }; return new Response(null, { status: 201 }) }) as typeof fetch)
    expect(status).toBe(201)
    const h = seen!.init.headers as Record<string, string>
    expect(h['content-encoding']).toBe('aes128gcm')
    expect(h.authorization).toMatch(/^vapid t=/)
    expect((seen!.init.body as Uint8Array).length).toBeGreaterThan(86)
  })

  it('принимает только https-адреса известных push-сервисов', () => {
    expect(isPushEndpoint('https://web.push.apple.com/QK')).toBe(true)
    expect(isPushEndpoint('https://fcm.googleapis.com/fcm/send/x')).toBe(true)
    expect(isPushEndpoint('https://updates.push.services.mozilla.com/wpush/v2/x')).toBe(true)
    expect(isPushEndpoint('http://web.push.apple.com/x')).toBe(false)
    expect(isPushEndpoint('https://evil.com/web.push.apple.com')).toBe(false)
    expect(isPushEndpoint('https://push.apple.com.evil.com/x')).toBe(false)
    expect(isPushEndpoint(42)).toBe(false)
  })
})
