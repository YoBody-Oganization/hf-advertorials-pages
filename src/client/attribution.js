/**
 * Attribution rules for the Hormone Focus presell pages.
 *
 * Pure: no DOM, no globals, no side effects. The browser loads this as a
 * native ES module and the Node test suite imports the very same file, so the
 * rules that ship are the rules that are tested.
 */

/** The one destination every offer CTA resolves to. */
export const SALES_PAGE = 'https://hormonefocus.jjsmithonline.com/'
export const SALES_HOST = 'hormonefocus.jjsmithonline.com'

/** Identifies which of the six presells a buyer came through. Not a UTM. */
export const PRESELL_PARAM = 'hf_presell'

/**
 * The only params carried from the ad click through to the sales page.
 * Values are passed through untouched — the UTM spec is enforced by whoever
 * builds the ad URL, never reinterpreted here.
 */
export const ATTRIBUTION_KEYS = Object.freeze([
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_content',
  'utm_term',
  'fbclid',
  'gclid',
])

/**
 * Classes Landra puts on offer CTAs, read off the six live embeds:
 * the inline button, image links, the rail/offer-card button, the listicle
 * item button, and the mobile sticky bar.
 */
export const CTA_CLASSES = Object.freeze([
  'lc-btn',
  'lc-img-link',
  'lr-cta',
  'lc-ri-item-cta',
  'mobile-sticky-cta',
])

/**
 * Guard for the class-based branch only. Jane can style a policy link as a
 * button; she cannot make one an offer. Checked against the path, so the
 * word appearing in a campaign value can never trip it.
 */
const LEGAL_PATH =
  /(privacy|terms|policy|policies|disclaimer|disclosure|legal|refund|returns|shipping|cookie|dmca|accessibility|unsubscribe|imprint|affiliate-disclosure)/i

/** Opt out of rewriting a single link by hand, from inside Landra. */
export const OPT_OUT_ATTRIBUTE = 'data-hf-no-attribution'

/**
 * Pull the supported attribution params out of a landing URL's query string.
 *
 * A present-but-blank param is dropped rather than captured: `?utm_source=`
 * from a mangled share link must not erase the value a CTA already carries.
 */
export function captureAttribution(search) {
  const params = new URLSearchParams(search || '')
  const captured = {}
  for (const key of ATTRIBUTION_KEYS) {
    const value = params.get(key)
    if (value !== null && value !== '') captured[key] = value
  }
  return captured
}

function hasCtaClass(anchor) {
  const list = anchor.classList
  if (!list) return false
  for (const name of CTA_CLASSES) {
    if (list.contains(name)) return true
  }
  return false
}

/**
 * Is this anchor one of the offer CTAs that should carry attribution?
 *
 * Deliberately narrow. Two ways to qualify:
 *
 *  1. It already points at the Hormone Focus sales host. Nothing on an
 *     advertorial links there except the offer, and this survives Jane
 *     restyling a button or Landra renaming a class.
 *  2. It carries one of Landra's CTA classes. This is what catches a CTA
 *     Jane has re-pointed somewhere else — page 4's sticky bar currently
 *     goes to www.jjsmithonline.com/supplements/hormonal-imbalance/ — and
 *     it is the branch the legal-path guard protects.
 *
 * Everything else (in-page jumps, mailto/tel, Landra's own popup links,
 * policy pages, external citations) is left exactly as authored.
 */
export function isOfferCta(anchor) {
  if (!anchor || typeof anchor.getAttribute !== 'function') return false

  const raw = anchor.getAttribute('href')
  if (!raw) return false
  if (raw.trim().charAt(0) === '#') return false

  // Landra opens these in a dialog over the page; it reads link.href itself
  // at click time and must keep the href it was authored with.
  if (anchor.hasAttribute('data-lp-popup')) return false
  if (anchor.hasAttribute(OPT_OUT_ATTRIBUTE)) return false

  let url
  try {
    // The IDL property, so a relative href resolves against the current page.
    url = new URL(anchor.href)
  } catch {
    return false
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return false

  if (url.hostname === SALES_HOST) return true

  if (!hasCtaClass(anchor)) return false
  if (LEGAL_PATH.test(url.pathname)) return false
  return true
}

/**
 * Build the final sales-page URL for one CTA.
 *
 * Start from the sales page itself — that is the destination for all six
 * presells, whatever the CTA was authored to point at — then layer on:
 *
 *   - the CTA's own query and hash, so Jane's per-link settings and the
 *     `#offer` jump survive;
 *   - the visit's attribution, which outranks the hard-coded `utm_source=meta`
 *     style values baked into the Landra links;
 *   - hf_presell.
 *
 * A key the visit did not carry is left exactly as Jane authored it: we never
 * invent a UTM, and we never drop one.
 *
 * Built with the URL API throughout, so the result is always well formed no
 * matter how many times it is re-applied to the same element.
 */
export function buildCtaUrl(currentHref, attribution, slug) {
  let source
  try {
    source = new URL(currentHref, SALES_PAGE)
  } catch {
    source = new URL(SALES_PAGE)
  }

  const target = new URL(SALES_PAGE)
  target.search = source.search
  target.hash = source.hash

  const values = attribution || {}
  for (const key of ATTRIBUTION_KEYS) {
    // Own-property check only: `attribution` can be rebuilt from storage, and
    // an inherited `constructor` must never read as a captured param.
    if (Object.prototype.hasOwnProperty.call(values, key) && values[key] !== '') {
      target.searchParams.set(key, values[key])
    }
  }

  if (slug) target.searchParams.set(PRESELL_PARAM, slug)

  return target.toString()
}
