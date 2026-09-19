// فاز ۶ — بوت‌استرپ نیتیو: تشخیص، نرمال‌سازی URL و ریدایرکت (jsdom، بدون نیاز به Capacitor واقعی)
import { describe, it, expect } from 'vitest'
import { normalizeServerUrl, isNativeApp, setServerBase, getServerBase, nativeBoot } from '../native-boot'

const mkStorage = (init = {}) => {
  const m = new Map(Object.entries(init))
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }
}

describe('native-boot', () => {
  it('normalizeServerUrl: adds https, strips path tail/query/hash, rejects junk & localhost', () => {
    expect(normalizeServerUrl('panah.fit/')).toBe('https://panah.fit')
    expect(normalizeServerUrl(' http://192.168.1.9:8787/some?x=1#z ')).toBe('http://192.168.1.9:8787/some')
    expect(normalizeServerUrl('panah.فیت')).toBeNull()
    expect(normalizeServerUrl('localhost:8787')).toBeNull()
    expect(normalizeServerUrl('127.0.0.1')).toBeNull()
    expect(normalizeServerUrl('')).toBeNull()
    expect(normalizeServerUrl('ftp://x.dev')).toBeNull()
    expect(normalizeServerUrl('https://pf.example:8443/sub/')).toBe('https://pf.example:8443/sub')
  })

  it('isNativeApp: Capacitor flag or UA marker', () => {
    expect(isNativeApp({ navigator: { userAgent: 'Mozilla/5.0' } })).toBe(false)
    expect(isNativeApp({ navigator: { userAgent: 'x PanahFitApp' } })).toBe(true)
    expect(isNativeApp({ navigator: { userAgent: 'z' }, Capacitor: { isNativePlatform: () => true } })).toBe(true)
    expect(isNativeApp({ navigator: { userAgent: 'z' }, Capacitor: { isNativePlatform: () => false } })).toBe(false)
  })

  it('storage roundtrip uses localStorage key', () => {
    const st = mkStorage()
    expect(setServerBase('panah.fit', st)).toBe('https://panah.fit')
    expect(getServerBase(st)).toBe('https://panah.fit')
    expect(getServerBase(mkStorage({ 'pf.server.v1': 'garbage://x' }))).toBeNull()
  })

  it('nativeBoot: web=noop true; native without server=form (false); native with server=redirect (false)', () => {
    const replaced = []
    const web = { location: { origin: 'https://panah.fit', pathname: '/', search: '', hash: '' }, navigator: { userAgent: 'Mozilla/5.0' } }
    expect(nativeBoot({ win: web, doc: { documentElement: {}, body: { innerHTML: '' } }, storage: mkStorage() })).toBe(true)

    const docFake = { documentElement: { dir: '' }, body: { innerHTML: '' }, getElementById: () => ({ value: 'panah.fit', addEventListener() {}, focus() {} }) }
    const nativeNoCfg = { location: { origin: 'http://localhost', pathname: '/', search: '', hash: '', replace: (x) => replaced.push(x) }, navigator: { userAgent: 'PanahFitApp' } }
    const st1 = mkStorage()
    expect(nativeBoot({ win: nativeNoCfg, doc: docFake, storage: st1 })).toBe(false)
    expect(docFake.body.innerHTML).toContain('اتصال به سرور')

    const nativeCfg = { location: { origin: 'http://localhost', pathname: '/', search: '', hash: '', replace: (x) => replaced.push(x) }, navigator: { userAgent: 'PanahFitApp' } }
    expect(nativeBoot({ win: nativeCfg, doc: docFake, storage: mkStorage({ 'pf.server.v1': 'https://panah.fit' }) })).toBe(false)
    expect(replaced.at(-1)).toBe('https://panah.fit')
  })
})
