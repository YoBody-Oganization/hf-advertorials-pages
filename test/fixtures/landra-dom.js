/**
 * The link structure of the six live Landra embeds, recorded on 2026-10-03.
 *
 * Structure only — classes, hrefs and targets. None of Jane's article copy is
 * reproduced here; the real pages are fetched live in live-embed.test.js. This
 * fixture exists so the suite still proves the CTA rules offline.
 */

export const LIVE_CTA_STRUCTURE = {
  'night-sweats-women-over-40-solutions': [
    { class: 'lc-img-link', href: 'https://hormonefocus.jjsmithonline.com/' },
    { class: 'lc-img-link', href: 'https://hormonefocus.jjsmithonline.com/' },
    { class: 'lc-img-link', href: 'https://hormonefocus.jjsmithonline.com/' },
    { class: 'lc-img-link', href: 'https://hormonefocus.jjsmithonline.com/' },
    {
      class: 'lc-btn',
      href: 'https://hormonefocus.jjsmithonline.com/?utm_source=meta&utm_medium=paid&utm_campaign=hf_meta_adv_nightsweats_v1&utm_content=cta1#offer',
    },
    {
      class: 'lc-img-link',
      href: 'https://hormonefocus.jjsmithonline.com/',
      target: '_blank',
      rel: 'noopener noreferrer',
    },
    { class: 'lr-cta', href: 'https://hormonefocus.jjsmithonline.com/' },
    { class: 'mobile-sticky-cta', href: 'https://hormonefocus.jjsmithonline.com/' },
  ],
  'hormones-40s-sleep-weight-energy': [
    {
      class: 'lc-btn',
      href: 'https://hormonefocus.jjsmithonline.com/?utm_source=meta&utm_medium=paid&utm_campaign=hf_meta_adv_peri_v1&utm_content=cta1#offer',
    },
    {
      class: 'lc-img-link',
      href: 'https://hormonefocus.jjsmithonline.com/',
      target: '_blank',
      rel: 'noopener noreferrer',
    },
    { class: 'lr-cta', href: 'https://hormonefocus.jjsmithonline.com/' },
    { class: 'mobile-sticky-cta', href: 'https://hormonefocus.jjsmithonline.com/' },
  ],
  'belly-weight-gain-after-40-hormones': [
    {
      class: 'lc-btn',
      href: 'https://hormonefocus.jjsmithonline.com/?utm_source=meta&utm_medium=paid&utm_campaign=hf_meta_adv_belly_v1&utm_content=cta1#offer',
    },
    {
      class: 'lc-img-link',
      href: 'https://hormonefocus.jjsmithonline.com/?utm_source=meta&utm_medium=paid&utm_campaign=hf_meta_adv_belly_v1&utm_content=cta2#offer',
      target: '_blank',
      rel: 'noopener noreferrer',
    },
    {
      class: 'lr-cta',
      href: 'https://hormonefocus.jjsmithonline.com/?utm_source=meta&utm_medium=paid&utm_campaign=hf_meta_adv_belly_v1&utm_content=cta2#offer',
    },
    { class: 'mobile-sticky-cta', href: 'https://hormonefocus.jjsmithonline.com/' },
  ],
  'belly-weight-loss-40s-hormones': [
    {
      class: 'lc-btn',
      href: 'https://hormonefocus.jjsmithonline.com/?utm_source=meta&utm_medium=paid&utm_campaign=hf_meta_lst_belly7_v1&utm_content=cta1#offer',
    },
    // The one CTA across all six that is not pointed at the sales page.
    // Caught by its class, not its host.
    {
      class: 'mobile-sticky-cta',
      href: 'https://www.jjsmithonline.com/supplements/hormonal-imbalance/',
    },
  ],
  'metabolism-changes-40s-nutrition-strategy': [
    {
      class: 'lc-ri-item-cta',
      href: 'https://hormonefocus.jjsmithonline.com/?utm_source=meta&utm_medium=paid&utm_campaign=hf_meta_lst_jj6_v1&utm_content=cta3#offer',
    },
    {
      class: 'lc-btn',
      href: 'https://hormonefocus.jjsmithonline.com/?utm_source=meta&utm_medium=paid&utm_campaign=hf_meta_lst_jj6_v1&utm_content=cta1#offer',
    },
    { class: 'mobile-sticky-cta', href: 'https://hormonefocus.jjsmithonline.com/' },
  ],
  'night-sweats-40s-sleep-solutions': [
    {
      class: 'lc-ri-item-cta',
      href: 'https://hormonefocus.jjsmithonline.com/?utm_source=meta&utm_medium=paid&utm_campaign=hf_meta_lst_sleep7_v1&utm_content=cta3#offer',
    },
    {
      class: 'lc-btn',
      href: 'https://hormonefocus.jjsmithonline.com/?utm_source=meta&utm_medium=paid&utm_campaign=hf_meta_lst_sleep7_v1&utm_content=cta1#offer',
    },
    { class: 'mobile-sticky-cta', href: 'https://hormonefocus.jjsmithonline.com/' },
  ],
}

/**
 * Links that must come out of a sweep untouched. Nothing in the six embeds
 * looks like these today; they are what Jane is free to add tomorrow.
 */
export const MUST_NOT_REWRITE = [
  { id: 'privacy', href: 'https://www.jjsmithonline.com/pages/privacy-policy' },
  // Legal pages styled as CTAs, which is the case the class rule has to survive.
  { id: 'terms-as-button', class: 'lc-btn', href: 'https://www.jjsmithonline.com/pages/terms-of-service' },
  { id: 'disclosure', class: 'lr-cta', href: 'https://www.jjsmithonline.com/pages/affiliate-disclosure' },
  { id: 'in-page', href: '#offer' },
  { id: 'mail', href: 'mailto:support@jjsmithonline.com' },
  { id: 'tel', href: 'tel:+15551234567' },
  { id: 'citation', href: 'https://pubmed.ncbi.nlm.nih.gov/28364426/' },
  // Landra opens this one in a dialog and reads the href itself at click time.
  { id: 'popup', class: 'lc-btn', href: 'https://forms.example.com/quiz', 'data-lp-popup': '' },
  { id: 'opted-out', class: 'lc-btn', href: 'https://hormonefocus.jjsmithonline.com/', 'data-hf-no-attribution': '' },
]

const attributes = (link) =>
  Object.entries(link)
    .filter(([key]) => key !== 'id')
    .map(([key, value]) => (value === '' ? ` ${key}` : ` ${key}="${value}"`))
    .join('')

/** Wrap a link list in the same two containers Landra's fragment opens with. */
export function renderFixture(links) {
  const anchors = links.map((link) => `<a${attributes(link)}>cta</a>`).join('\n')
  return `<div class="landra-page-outer"><div class="landra-page"><div class="landra-main">${anchors}</div></div></div>`
}
