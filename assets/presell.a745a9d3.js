/**
 * Presell runtime: keeps the Landra offer CTAs pointed at the Hormone Focus
 * sales page with this visit's attribution attached.
 *
 * Landra renders the article by fetching it and assigning innerHTML, so no CTA
 * exists when this module runs. Worse, Landra's own inner runtime ships
 * __landraForwardParams(), which merges the landing URL's params onto every
 * link but *never clobbers* a param the link already has — and Jane's CTAs are
 * hard-coded with utm_source=meta&utm_campaign=hf_meta_adv_*. Left to Landra,
 * a real `utm_source=facebook` ad click would arrive at the sales page as
 * `utm_source=meta`. So this has to be authoritative rather than additive.
 *
 * Two layers, both cheap:
 *
 *   1. A MutationObserver rewrites CTA hrefs as they appear. This is what
 *      makes the status bar, "copy link address", and open-in-new-tab honest,
 *      and it re-settles after Landra's forwarder has had its turn.
 *   2. A capture-phase click listener on the document recomputes the href one
 *      more time at click time. This is the layer that cannot be outrun — by
 *      a node cloned after the last sweep, by a late re-render, or by Landra
 *      rewriting an href between the sweep and the click.
 *
 * The click layer sets the href and lets the browser's own default action run,
 * rather than calling location.assign(). The browser reads href when it
 * performs the default action, which is after this listener returns, so
 * cmd-click, middle-click and "open link in new tab" all keep working and all
 * get the decorated URL.
 */

import {
  ATTRIBUTION_KEYS,
  buildCtaUrl,
  captureAttribution,
  isOfferCta,
} from './attribution.06cc1679.js'

const STORAGE_KEY = 'hf_attribution'

const slug = document.documentElement.getAttribute('data-hf-presell') || ''

/**
 * Re-read a stored visit, key by key. Iterating ATTRIBUTION_KEYS rather than
 * the parsed object means a tampered sessionStorage entry can contribute
 * nothing but strings under names we already allow.
 */
function readStoredAttribution() {
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return null
    const clean = {}
    for (const key of ATTRIBUTION_KEYS) {
      const value = parsed[key]
      if (typeof value === 'string' && value !== '') clean[key] = value
    }
    return clean
  } catch {
    // Safari private mode, blocked storage, malformed JSON. Not fatal.
    return null
  }
}

/**
 * The visit's attribution.
 *
 * A URL carrying attribution is a fresh ad click and always wins — that is the
 * only thing that may replace a stored visit. A URL carrying none is an
 * internal move (a refresh keeps the query; a hash jump or a back button may
 * not), so it falls back to what the visit arrived with instead of blanking it.
 *
 * No UTMs anywhere means no UTMs: nothing is invented, and hf_presell is still
 * appended on the way out.
 */
function resolveAttribution() {
  const fromUrl = captureAttribution(window.location.search)
  if (Object.keys(fromUrl).length > 0) {
    try {
      window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(fromUrl))
    } catch {
      // Storage unavailable. The in-memory value still serves this page.
    }
    return fromUrl
  }
  return readStoredAttribution() || {}
}

const attribution = resolveAttribution()

function pushDataLayer(payload) {
  window.dataLayer = window.dataLayer || []
  window.dataLayer.push(payload)
}

/**
 * Point one anchor at the sales page with attribution attached.
 *
 * Idempotent: buildCtaUrl is a fixed point, so re-running over an
 * already-decorated link produces the identical string and writes nothing.
 * That is what stops the href MutationObserver from feeding itself.
 */
function decorate(anchor) {
  if (!isOfferCta(anchor)) return

  const destination = buildCtaUrl(anchor.href, attribution, slug)
  if (anchor.getAttribute('href') !== destination) {
    anchor.setAttribute('href', destination)
  }

  // Offer CTAs open in the same tab.
  const target = anchor.getAttribute('target')
  if (target && target !== '_self') anchor.removeAttribute('target')

  // `noreferrer` was there to pair with target="_blank". Keeping it on a
  // same-tab navigation would hide the referrer from the sales page, which
  // for an unattributed visit is the only signal that it came through a
  // presell at all. `noopener` stays — it costs nothing.
  const rel = anchor.getAttribute('rel')
  if (rel && /\bnoreferrer\b/i.test(rel)) {
    const kept = rel.split(/\s+/).filter((token) => token && !/^noreferrer$/i.test(token))
    if (kept.length) anchor.setAttribute('rel', kept.join(' '))
    else anchor.removeAttribute('rel')
  }

  return destination
}

function sweep(node) {
  if (!node || node.nodeType !== 1) return
  if (typeof node.matches === 'function' && node.matches('a[href]')) decorate(node)
  if (typeof node.querySelectorAll !== 'function') return
  const anchors = node.querySelectorAll('a[href]')
  for (let i = 0; i < anchors.length; i += 1) decorate(anchors[i])
}

function handleActivation(event, countsAsClick) {
  const origin = event.target
  if (!origin || typeof origin.closest !== 'function') return
  const anchor = origin.closest('a[href]')
  if (!anchor) return

  const destination = decorate(anchor)
  if (!destination) return

  if (countsAsClick) {
    pushDataLayer({
      event: 'presell_cta_click',
      presell_slug: slug,
      destination,
    })
  }
}

export function start() {
  sweep(document.documentElement)

  const observer = new MutationObserver((records) => {
    for (const record of records) {
      if (record.type === 'attributes') {
        sweep(record.target)
        continue
      }
      for (let i = 0; i < record.addedNodes.length; i += 1) sweep(record.addedNodes[i])
    }
  })
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['href'],
  })

  // Capture phase: runs before anything inside the Landra content can stop
  // propagation, and well before the browser performs the navigation.
  document.addEventListener(
    'click',
    (event) => handleActivation(event, event.button === 0 && !event.defaultPrevented),
    true,
  )
  // Middle-click. Decorate the href, but do not count it as a CTA click —
  // auxclick on an anchor is just as often a paste-and-go or a back gesture.
  document.addEventListener('auxclick', (event) => handleActivation(event, false), true)
  // Right-click, so "copy link address" copies the decorated URL even if the
  // observer has not caught up with a just-inserted node.
  document.addEventListener('contextmenu', (event) => handleActivation(event, false), true)

  return observer
}

// A module script is deferred, so the document is parsed and the embed host
// exists by now. Guarded so a double include cannot install two observers.
if (!window.__hfPresellStarted) {
  window.__hfPresellStarted = true
  start()
}
