/** Build-time constants. Runtime attribution rules live in src/client/attribution.js. */
export { SALES_PAGE, SALES_HOST, PRESELL_PARAM, ATTRIBUTION_KEYS } from './client/attribution.js'

/** Canonical origin. No trailing slash. */
export const SITE_ORIGIN = 'https://learn.hormonefocus.jjsmithonline.com'

export const GTM_ID = 'GTM-WT4MWLTH'
export const META_PIXEL_ID = '1614860232058835'

export const LANDRA_ORIGIN = 'https://www.getlandra.com'
/** Where Landra serves the fonts and images its pages reference. */
export const LANDRA_ASSET_ORIGIN = 'https://ahxicvvvnelbwoisdexl.supabase.co'

/**
 * Landra's shared, content-hashed live loader — the same file for all six
 * embeds, so the browser fetches it once and reuses it across routes.
 *
 * When Landra publishes a new loader they issue a new filename; the embed
 * snippet Jane copies out of Landra is where that shows up. Updating this one
 * constant updates all six pages. It does NOT need to change for Jane's
 * content edits, which are picked up from current.html at page load.
 */
export const LANDRA_RUNTIME =
  'https://www.getlandra.com/api/assets/runtime/live-37926ec5bf79.js'

export const assetUrl = (embedId, ext) =>
  `${LANDRA_ORIGIN}/api/assets/${embedId}/current.${ext}`
