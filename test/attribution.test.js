import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { JSDOM } from 'jsdom'

import {
  ATTRIBUTION_KEYS,
  buildCtaUrl,
  captureAttribution,
  isOfferCta,
  PRESELL_PARAM,
  SALES_PAGE,
} from '../src/client/attribution.js'
import { MUST_NOT_REWRITE } from './fixtures/landra-dom.js'

const PAGE_URL = 'https://learn.hormonefocus.jjsmithonline.com/night-sweats-women-over-40-solutions'

/** One anchor, parsed on a page served from the real presell origin. */
function anchor(attributes) {
  const markup = Object.entries(attributes)
    .filter(([key]) => key !== 'id')
    .map(([key, value]) => (value === '' ? ` ${key}` : ` ${key}="${value}"`))
    .join('')
  const dom = new JSDOM(`<!doctype html><body><a${markup}>cta</a>`, { url: PAGE_URL })
  return dom.window.document.querySelector('a')
}

describe('captureAttribution', () => {
  it('captures every supported key and nothing else', () => {
    const captured = captureAttribution(
      '?utm_source=facebook&utm_medium=paid&utm_campaign=hf-261003-sleep' +
        '&utm_content=v1&utm_term=image&fbclid=test123&gclid=g1&ref=spam&id=99',
    )
    assert.deepEqual(captured, {
      utm_source: 'facebook',
      utm_medium: 'paid',
      utm_campaign: 'hf-261003-sleep',
      utm_content: 'v1',
      utm_term: 'image',
      fbclid: 'test123',
      gclid: 'g1',
    })
  })

  it('returns nothing for a bare visit', () => {
    assert.deepEqual(captureAttribution(''), {})
    assert.deepEqual(captureAttribution('?'), {})
    assert.deepEqual(captureAttribution('?foo=bar'), {})
  })

  it('drops a present-but-blank param instead of capturing an empty value', () => {
    assert.deepEqual(captureAttribution('?utm_source=&utm_medium=paid'), { utm_medium: 'paid' })
  })

  it('passes values through verbatim, including casing and encoding', () => {
    const captured = captureAttribution('?utm_campaign=HF-261003-Sleep&utm_content=v1%20a%2Bb')
    assert.equal(captured.utm_campaign, 'HF-261003-Sleep')
    assert.equal(captured.utm_content, 'v1 a+b')
  })

  it('ignores a repeated key beyond the first, rather than concatenating', () => {
    assert.equal(captureAttribution('?utm_source=facebook&utm_source=tiktok').utm_source, 'facebook')
  })
})

describe('buildCtaUrl', () => {
  const slug = 'night-sweats-women-over-40-solutions'
  const full = {
    utm_source: 'facebook',
    utm_medium: 'paid',
    utm_campaign: 'hf-261003-sleep',
    utm_content: 'v1',
    utm_term: 'image',
    fbclid: 'test123',
  }

  it('produces the documented URL for the brief’s test case', () => {
    const built = buildCtaUrl(
      'https://hormonefocus.jjsmithonline.com/?utm_source=meta&utm_medium=paid' +
        '&utm_campaign=hf_meta_adv_nightsweats_v1&utm_content=cta1#offer',
      full,
      slug,
    )
    assert.equal(
      built,
      'https://hormonefocus.jjsmithonline.com/?utm_source=facebook&utm_medium=paid' +
        '&utm_campaign=hf-261003-sleep&utm_content=v1&utm_term=image&fbclid=test123' +
        `&${PRESELL_PARAM}=${slug}#offer`,
    )
  })

  it('overrides the UTMs Landra baked into the link', () => {
    const built = new URL(
      buildCtaUrl(
        'https://hormonefocus.jjsmithonline.com/?utm_source=meta&utm_content=cta1',
        { utm_source: 'instagram' },
        slug,
      ),
    )
    assert.equal(built.searchParams.get('utm_source'), 'instagram')
    // Not carried by the visit, so Jane's value survives rather than being
    // deleted or replaced with an invented one.
    assert.equal(built.searchParams.get('utm_content'), 'cta1')
  })

  it('invents nothing when the visit carried no attribution', () => {
    const built = new URL(buildCtaUrl('https://hormonefocus.jjsmithonline.com/', {}, slug))
    assert.equal(built.search, `?${PRESELL_PARAM}=${slug}`)
    for (const key of ATTRIBUTION_KEYS) assert.equal(built.searchParams.has(key), false)
  })

  it('always appends hf_presell, with or without UTMs', () => {
    for (const attribution of [{}, full, { gclid: 'g1' }]) {
      const built = new URL(buildCtaUrl(SALES_PAGE, attribution, slug))
      assert.equal(built.searchParams.get(PRESELL_PARAM), slug)
    }
  })

  it('redirects a CTA authored at another host onto the sales page', () => {
    // Page 4's mobile sticky bar.
    const built = new URL(
      buildCtaUrl('https://www.jjsmithonline.com/supplements/hormonal-imbalance/', full, slug),
    )
    assert.equal(built.origin, 'https://hormonefocus.jjsmithonline.com')
    assert.equal(built.pathname, '/')
    assert.equal(built.searchParams.get('utm_source'), 'facebook')
  })

  it('never produces a second question mark, however often it is re-applied', () => {
    let href = 'https://hormonefocus.jjsmithonline.com/?utm_source=meta&utm_content=cta1#offer'
    for (let pass = 0; pass < 5; pass += 1) href = buildCtaUrl(href, full, slug)
    assert.equal(href.split('?').length - 1, 1)
    assert.equal(href.split('#').length - 1, 1)
  })

  it('is a fixed point, so repeated sweeps write nothing new', () => {
    const once = buildCtaUrl(SALES_PAGE, full, slug)
    assert.equal(buildCtaUrl(once, full, slug), once)
    assert.equal(buildCtaUrl(buildCtaUrl(once, full, slug), full, slug), once)
  })

  it('keeps the #offer hash Jane authored', () => {
    assert.ok(buildCtaUrl(`${SALES_PAGE}#offer`, full, slug).endsWith('#offer'))
  })

  it('keeps non-attribution params the link carries', () => {
    const built = new URL(buildCtaUrl(`${SALES_PAGE}?variant=4411&discount=JJ10`, full, slug))
    assert.equal(built.searchParams.get('variant'), '4411')
    assert.equal(built.searchParams.get('discount'), 'JJ10')
  })

  it('encodes values rather than splicing them in', () => {
    const built = new URL(
      buildCtaUrl(SALES_PAGE, { utm_campaign: 'hf-261003-sleep&evil=1 x' }, slug),
    )
    assert.equal(built.searchParams.get('utm_campaign'), 'hf-261003-sleep&evil=1 x')
    assert.equal(built.searchParams.get('evil'), null)
  })

  it('ignores inherited object keys on the attribution bag', () => {
    const hostile = Object.create({ utm_source: 'attacker' })
    const built = new URL(buildCtaUrl(SALES_PAGE, hostile, slug))
    assert.equal(built.searchParams.has('utm_source'), false)
  })

  it('falls back to the sales page when handed an unparseable href', () => {
    const built = new URL(buildCtaUrl('http://[', full, slug))
    assert.equal(built.origin, 'https://hormonefocus.jjsmithonline.com')
  })
})

describe('isOfferCta', () => {
  it('accepts anything already aimed at the sales host', () => {
    assert.equal(isOfferCta(anchor({ href: SALES_PAGE })), true)
    assert.equal(isOfferCta(anchor({ href: `${SALES_PAGE}?utm_source=meta#offer` })), true)
  })

  it('accepts a Landra CTA class pointed somewhere else', () => {
    assert.equal(
      isOfferCta(
        anchor({
          class: 'mobile-sticky-cta',
          href: 'https://www.jjsmithonline.com/supplements/hormonal-imbalance/',
        }),
      ),
      true,
    )
  })

  it('leaves every link that is not an offer alone', () => {
    for (const link of MUST_NOT_REWRITE) {
      assert.equal(isOfferCta(anchor(link)), false, `${link.id} should not be rewritten`)
    }
  })

  it('leaves an unclassed link to an unrelated host alone', () => {
    assert.equal(isOfferCta(anchor({ href: 'https://example.com/study' })), false)
  })

  it('is not fooled by a host that merely ends with the sales host', () => {
    assert.equal(
      isOfferCta(anchor({ href: 'https://evil-hormonefocus.jjsmithonline.com.attacker.test/' })),
      false,
    )
  })

  it('ignores an href it cannot parse', () => {
    assert.equal(isOfferCta(anchor({ href: '' })), false)
    assert.equal(isOfferCta(anchor({ class: 'lc-btn', href: 'javascript:void(0)' })), false)
  })
})
