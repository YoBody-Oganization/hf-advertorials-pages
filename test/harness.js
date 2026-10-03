import { JSDOM, VirtualConsole } from 'jsdom'

const PRESELL = new URL('../src/client/presell.js', import.meta.url).href
const ORIGIN = 'https://learn.hormonefocus.jjsmithonline.com'

/** Globals presell.js reads off the window it runs in. */
const BOUND = ['window', 'document', 'MutationObserver', 'sessionStorage']

let bootCount = 0

export const tick = () => new Promise((resolve) => setTimeout(resolve, 0))

/**
 * Boot the real presell module against a fresh jsdom window.
 *
 * The module is imported with a cache-busting query so each boot re-runs its
 * top-level start(), the same way a fresh page load would. A `store` can be
 * carried between boots to stand in for sessionStorage surviving a navigation.
 */
export function quietConsole() {
  const virtualConsole = new VirtualConsole()
  // jsdom reports anchor navigation as a jsdomError. Expected here: we assert
  // on the href the browser would have followed, not on jsdom following it.
  virtualConsole.on('jsdomError', () => {})
  return virtualConsole
}

export async function boot({ slug, search = '', embedId = 'e2e', store, dom: existing } = {}) {
  const dom =
    existing ??
    new JSDOM(
      `<!doctype html><html lang="en" data-hf-presell="${slug}"><head></head>` +
        `<body><div data-landra-embed="${embedId}" data-landra-src="https://www.getlandra.com/api/assets/${embedId}/current.html"></div></body></html>`,
      {
        url: `${ORIGIN}/${slug}${search}`,
        virtualConsole: quietConsole(),
        pretendToBeVisual: true,
      },
    )

  const { window } = dom
  if (store) for (const [key, value] of Object.entries(store)) window.sessionStorage.setItem(key, value)

  const saved = new Map()
  for (const key of BOUND) {
    saved.set(key, Object.getOwnPropertyDescriptor(globalThis, key))
    globalThis[key] = window[key]
  }
  globalThis.window = window
  globalThis.document = window.document

  bootCount += 1
  await import(`${PRESELL}?boot=${bootCount}`)

  const host = window.document.querySelector('[data-landra-embed]')

  return {
    window,
    document: window.document,
    host,

    /** Reproduce what the Landra loader does: innerHTML, then state=ready. */
    async render(markup) {
      host.innerHTML = markup
      host.setAttribute('data-landra-state', 'ready')
      await tick()
      return this
    },

    /** The sessionStorage contents, to carry into a follow-up boot. */
    snapshot() {
      const out = {}
      for (let i = 0; i < window.sessionStorage.length; i += 1) {
        const key = window.sessionStorage.key(i)
        out[key] = window.sessionStorage.getItem(key)
      }
      return out
    },

    click(element, init = {}) {
      const event = new window.MouseEvent('click', {
        bubbles: true,
        cancelable: true,
        button: 0,
        ...init,
      })
      element.dispatchEvent(event)
      return event
    },

    anchors(selector = 'a[href]') {
      return [...window.document.querySelectorAll(selector)]
    },

    get dataLayer() {
      return window.dataLayer || []
    },

    restore() {
      for (const [key, descriptor] of saved) {
        if (descriptor) Object.defineProperty(globalThis, key, descriptor)
        else delete globalThis[key]
      }
      window.close()
    },
  }
}

/**
 * Landra's own __landraForwardParams, reduced to the rule that matters: it
 * merges the landing URL's params onto every link but never clobbers a param
 * the link already carries. Used to prove our handler still wins.
 */
export function landraForwardParams(window) {
  const search = window.location.search
  if (!search || search === '?') return
  const incoming = new URLSearchParams(search)
  for (const a of window.document.querySelectorAll('a[href]')) {
    const raw = a.getAttribute('href')
    if (!raw || raw.charAt(0) === '#') continue
    let url
    try {
      url = new URL(a.href)
    } catch {
      continue
    }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') continue
    let changed = false
    incoming.forEach((value, key) => {
      if (!url.searchParams.has(key)) {
        url.searchParams.set(key, value)
        changed = true
      }
    })
    if (changed) a.setAttribute('href', url.toString())
  }
}
