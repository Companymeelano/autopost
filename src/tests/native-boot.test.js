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
    expect(docFake.body.innerHTML).toContain('میلانو')
    expect(docFake.body.innerHTML).toContain('مشاهده دمو')

    const nativeCfg = { location: { origin: 'http://localhost', pathname: '/', search: '', hash: '', replace: (x) => replaced.push(x) }, navigator: { userAgent: 'PanahFitApp' } }
    expect(nativeBoot({ win: nativeCfg, doc: docFake, storage: mkStorage({ 'pf.server.v1': 'https://panah.fit' }) })).toBe(false)
    expect(replaced.at(-1)).toBe('https://panah.fit')
  })
})

describe('renderBootForm — اتصال + بررسی سلامت + دمو', () => {
  it('submit معتبر → چک health → replace؛ دکمه دمو → pf.demo', async () => {
    const el = () => { const m = new Map(); return { value: '', textContent: '', innerHTML: '', style: {}, addEventListener: (ev, f) => m.set(ev, f), focus: () => {}, fire: (ev) => m.get(ev) && m.get(ev)() } }
    const elems = {}
    const doc = { documentElement: { dir: '' }, body: { innerHTML: '' }, getElementById: (id) => (elems[id] = elems[id] || el()) }
    let replaced = []
    const st = mkStorage()
    const prevFetch = globalThis.fetch
    globalThis.fetch = async () => ({ ok: true, json: async () => ({ version: 3, db: { engine: 'mysql' } }) })
    const { renderBootForm } = await import('../native-boot.js')
    {
      renderBootForm(doc, (raw) => { const n = setServerBase(raw, st); if (n) replaced.push(n); return n }, () => { st.setItem('pf.demo', '1') })
      elems.pu.value = 'shop.example.ir'
      elems.pb.fire('click')
      await new Promise((r) => setTimeout(r, 120))
      expect(replaced[0]).toBe('https://shop.example.ir')
      expect(elems.pc.innerHTML).toContain('MySQL')
      elems.pd.fire('click')
      expect(st.getItem('pf.demo')).toBe('1')
    }
    globalThis.fetch = prevFetch
  })
})
