export async function copyText(text) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(String(text))
      return true
    }
  } catch { /* fallback */ }
  try {
    const ta = document.createElement('textarea')
    ta.value = String(text)
    ta.style.cssText = 'position:fixed;opacity:0'
    document.body.appendChild(ta)
    ta.select()
    const ok = document.execCommand ? document.execCommand('copy') : false
    ta.remove()
    return !!ok
  } catch {
    return false
  }
}
