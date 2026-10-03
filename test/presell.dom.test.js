import assert from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'

import { PRESELL_PARAM, SALES_HOST } from '../src/client/attribution.js'
import { pages } from '../src/pages.js'
import { LIVE_CTA_STRUCTURE, MUST_NOT_REWRITE, renderFixture } from './fixtures/landra-dom.js'
import { boot, landraForwardParams, tick } from './harness.js'

const BRIEF_CASE =
  '?utm_source=facebook&utm_medium=paid&utm_campaign=hf-261003-sleep' +
  '&utm_content=v1&utm_term=image&fbclid=test123'

const EXPECTED = {
  utm_source: 'facebook',
  utm_medium: 'paid',
  utm_campaign: 'hf-261003-sleep',
  utm_content: 'v1',
  utm_term: 'image',
  fbclid: 'test123',
}

let page
afterEach(() => {
  page?.restore()
  page = undefined
})

const ctaHrefs = (session) =>
  session
    .anchors()
    .map((a) => a.getAttribute('href'))
    .filter((href) => href.includes(SALES_HOST))

function assertFullyAttributed(href, slug) {
  const url = new URL(href)
  assert.equal(url.origin, `https://${SALES_HOST}`, href)
  assert.equal(url.pathname, '/', href)
  for (const [key, value] of Object.entries(EXPECTED)) {
    assert.equal(url.searchParams.get(key), value, `${key} in ${href}`)
  }
  assert.equal(url.searchParams.get(PRESELL_PARAM), slug, href)
  assert.equal(href.split('?').length - 1, 1, `one question mark in ${href}`)
}

describe('the brief’s test case, end to end', () => {
  const slug = 'night-sweats-women-over-40-solutions'

  it('attributes every CTA on the page after Landra renders', async () => {
    page = await boot({ slug, search: BRIEF_CASE })
    await page.render(renderFixture(LIVE_CTA_STRUCTURE[slug]))

    const hrefs = ctaHrefs(page)
    assert.equal(hrefs.length, LIVE_CTA_STRUCTURE[slug].length)
    for (const href of hrefs) assertFullyAttributed(href, slug)
  })

  it('clicking every CTA navigates to the attributed sales page', async () => {
    page = await boot({ slug, search: BRIEF_CASE })
    await page.render(renderFixture(LIVE_CTA_STRUCTURE[slug]))

    const anchors = page.anchors()
    assert.equal(anchors.length, 8)
    for (const anchor of anchors) {
      page.click(anchor)
      assertFullyAttributed(anchor.href, slug)
      assert.notEqual(anchor.getAttribute('target'), '_blank')
    }

    const clicks = page.dataLayer.filter((entry) => entry.event === 'presell_cta_click')
    assert.equal(clicks.length, 8)
    for (const entry of clicks) {
      assert.equal(entry.presell_slug, slug)
      assertFullyAttributed(entry.destination, slug)
      assert.deepEqual(Object.keys(entry).sort(), ['destination', 'event', 'presell_slug'])
    }
  })

  it('produces exactly the URL the brief documents', async () => {
    page = await boot({ slug, search: BRIEF_CASE })
    await page.render(renderFixture(LIVE_CTA_STRUCTURE[slug]))

    const button = page.document.querySelector('a.lc-btn')
    page.click(button)
    assert.equal(
      button.href,
      'https://hormonefocus.jjsmithonline.com/?utm_source=facebook&utm_medium=paid' +
        '&utm_campaign=hf-261003-sleep&utm_content=v1&utm_term=image&fbclid=test123' +
        '&hf_presell=night-sweats-women-over-40-solutions#offer',
    )
  })
})

describe('all six routes', () => {
  for (const { slug } of pages) {
    it(`${slug} attributes every CTA`, async () => {
      page = await boot({ slug, search: BRIEF_CASE })
      await page.render(renderFixture(LIVE_CTA_STRUCTURE[slug]))

      const anchors = page.anchors()
      assert.equal(anchors.length, LIVE_CTA_STRUCTURE[slug].length)
      for (const anchor of anchors) {
        page.click(anchor)
        assertFullyAttributed(anchor.href, slug)
      }
    })
  }

  it('sends page 4’s off-target sticky CTA to the sales page', async () => {
    const slug = 'belly-weight-loss-40s-hormones'
    page = await boot({ slug, search: BRIEF_CASE })
    await page.render(renderFixture(LIVE_CTA_STRUCTURE[slug]))

    const sticky = page.document.querySelector('a.mobile-sticky-cta')
    page.click(sticky)
    assert.equal(new URL(sticky.href).origin, `https://${SALES_HOST}`)
    assertFullyAttributed(sticky.href, slug)
  })
})

describe('traffic shapes', () => {
  const slug = 'hormones-40s-sleep-weight-energy'
  const fixture = () => renderFixture(LIVE_CTA_STRUCTURE[slug])

  it('a direct load with no UTMs invents none but still tags hf_presell', async () => {
    page = await boot({ slug })
    await page.render(fixture())

    for (const anchor of page.anchors()) {
      page.click(anchor)
      const url = new URL(anchor.href)
      assert.equal(url.searchParams.get(PRESELL_PARAM), slug)
      // Jane's authored values survive; nothing is fabricated.
      assert.equal(url.searchParams.get('utm_term'), null)
      assert.equal(url.searchParams.get('fbclid'), null)
      assert.equal(url.searchParams.get('gclid'), null)
    }
  })

  it('carries an Instagram organic visit through', async () => {
    page = await boot({ slug, search: '?utm_source=instagram&utm_medium=story' })
    await page.render(fixture())

    const url = new URL(page.document.querySelector('a.lc-btn').href)
    assert.equal(url.searchParams.get('utm_source'), 'instagram')
    assert.equal(url.searchParams.get('utm_medium'), 'story')
    // The link was authored with utm_campaign/utm_content; the visit carried
    // neither, so they are left alone rather than blanked.
    assert.equal(url.searchParams.get('utm_campaign'), 'hf_meta_adv_peri_v1')
    assert.equal(url.searchParams.get('utm_content'), 'cta1')
  })

  it('carries gclid through', async () => {
    page = await boot({ slug, search: '?utm_source=google&utm_medium=paid&gclid=Cj0KCQabc' })
    await page.render(fixture())
    const url = new URL(page.document.querySelector('a.lc-btn').href)
    assert.equal(url.searchParams.get('gclid'), 'Cj0KCQabc')
    assert.equal(url.searchParams.get('utm_source'), 'google')
  })

  it('handles a missing utm_term', async () => {
    page = await boot({
      slug,
      search: '?utm_source=facebook&utm_medium=paid&utm_campaign=hf-261003-sweats&utm_content=v3',
    })
    await page.render(fixture())
    const url = new URL(page.document.querySelector('a.lc-btn').href)
    assert.equal(url.searchParams.get('utm_campaign'), 'hf-261003-sweats')
    assert.equal(url.searchParams.has('utm_term'), false)
  })

  it('survives a refresh, because the query is still in the URL', async () => {
    page = await boot({ slug, search: BRIEF_CASE })
    await page.render(fixture())
    const first = page.document.querySelector('a.lc-btn').href
    const carried = page.snapshot()
    page.restore()

    page = await boot({ slug, search: BRIEF_CASE, store: carried })
    await page.render(fixture())
    assert.equal(page.document.querySelector('a.lc-btn').href, first)
  })

  it('remembers the visit when an internal move drops the query', async () => {
    page = await boot({ slug, search: BRIEF_CASE })
    await page.render(fixture())
    const carried = page.snapshot()
    page.restore()

    // Same tab, no UTMs on the URL any more.
    page = await boot({ slug, store: carried })
    await page.render(fixture())
    assertFullyAttributed(page.document.querySelector('a.lc-btn').href, slug)
  })

  it('lets a fresh ad click replace a stored visit', async () => {
    page = await boot({ slug, search: BRIEF_CASE })
    const carried = page.snapshot()
    page.restore()

    page = await boot({ slug, search: '?utm_source=tiktok&utm_medium=paid', store: carried })
    await page.render(fixture())
    const url = new URL(page.document.querySelector('a.lc-btn').href)
    assert.equal(url.searchParams.get('utm_source'), 'tiktok')
    assert.equal(url.searchParams.get('fbclid'), null)
  })

  it('still attributes when sessionStorage throws', async () => {
    page = await boot({ slug, search: BRIEF_CASE })
    // Simulated after boot as well as during: either way must not throw.
    Object.defineProperty(page.window, 'sessionStorage', {
      get() {
        throw new Error('blocked')
      },
    })
    await page.render(fixture())
    assertFullyAttributed(page.document.querySelector('a.lc-btn').href, slug)
  })

  it('ignores a tampered sessionStorage entry', async () => {
    page = await boot({
      slug,
      store: { hf_attribution: JSON.stringify({ utm_source: { toString: 1 }, evil: 'x' }) },
    })
    await page.render(fixture())
    const url = new URL(page.document.querySelector('a.lc-btn').href)
    assert.equal(url.searchParams.get('utm_source'), 'meta') // the authored value
    assert.equal(url.searchParams.has('evil'), false)
  })
})

describe('links that must be left alone', () => {
  const slug = 'night-sweats-women-over-40-solutions'

  it('does not rewrite legal, in-page, mailto, citation or popup links', async () => {
    page = await boot({ slug, search: BRIEF_CASE })
    await page.render(renderFixture(MUST_NOT_REWRITE))

    for (const link of MUST_NOT_REWRITE) {
      const anchor = page.document.querySelector(`a[href="${link.href}"]`)
      assert.ok(anchor, `${link.id} still present`)
      page.click(anchor)
      assert.equal(anchor.getAttribute('href'), link.href, `${link.id} untouched after a click`)
    }
    assert.equal(page.dataLayer.filter((e) => e.event === 'presell_cta_click').length, 0)
  })
})

describe('dynamic Landra content', () => {
  const slug = 'metabolism-changes-40s-nutrition-strategy'

  it('attributes a CTA inserted long after the page settled', async () => {
    page = await boot({ slug, search: BRIEF_CASE })
    await page.render(renderFixture(LIVE_CTA_STRUCTURE[slug]))
    await tick()

    const late = page.document.createElement('a')
    late.className = 'lc-btn'
    late.href = 'https://hormonefocus.jjsmithonline.com/#offer'
    page.host.append(late)
    await tick()

    assertFullyAttributed(late.href, slug)
  })

  it('attributes a CTA clicked before the observer has run', async () => {
    page = await boot({ slug, search: BRIEF_CASE })
    await page.render(renderFixture(LIVE_CTA_STRUCTURE[slug]))

    // Inserted and clicked in the same synchronous turn: the MutationObserver
    // callback is still queued. The click handler is what catches this.
    const racing = page.document.createElement('a')
    racing.className = 'mobile-sticky-cta'
    racing.href = 'https://hormonefocus.jjsmithonline.com/'
    page.host.append(racing)
    page.click(racing)

    assertFullyAttributed(racing.href, slug)
  })

  it('attributes a clone of an already-decorated CTA', async () => {
    page = await boot({ slug, search: BRIEF_CASE })
    await page.render(renderFixture(LIVE_CTA_STRUCTURE[slug]))

    const original = page.document.querySelector('a.lc-btn')
    const clone = original.cloneNode(true)
    clone.setAttribute('href', 'https://hormonefocus.jjsmithonline.com/')
    page.host.append(clone)
    page.click(clone)

    assertFullyAttributed(clone.href, slug)
  })

  it('attributes a CTA inside a whole re-render of the embed', async () => {
    page = await boot({ slug, search: BRIEF_CASE })
    await page.render(renderFixture(LIVE_CTA_STRUCTURE[slug]))
    await page.render(renderFixture(LIVE_CTA_STRUCTURE['belly-weight-loss-40s-hormones']))

    for (const anchor of page.anchors()) assertFullyAttributed(anchor.href, slug)
  })

  it('re-attributes an href something else overwrote, then settles', async () => {
    page = await boot({ slug, search: BRIEF_CASE })
    await page.render(renderFixture(LIVE_CTA_STRUCTURE[slug]))

    const anchor = page.document.querySelector('a.lc-btn')
    for (let i = 0; i < 3; i += 1) {
      anchor.setAttribute('href', 'https://hormonefocus.jjsmithonline.com/?utm_source=meta')
      await tick()
      assertFullyAttributed(anchor.getAttribute('href'), slug)
    }

    // The href observer rewrites hrefs. It must reach a fixed point rather
    // than feed itself: another turn with nobody touching the link changes
    // nothing.
    const settled = anchor.getAttribute('href')
    await tick()
    await tick()
    assert.equal(anchor.getAttribute('href'), settled)
  })
})

describe('coexistence with Landra’s own param forwarding', () => {
  const slug = 'belly-weight-gain-after-40-hormones'

  it('wins over __landraForwardParams’ never-clobber rule', async () => {
    page = await boot({ slug, search: BRIEF_CASE })
    await page.render(renderFixture(LIVE_CTA_STRUCTURE[slug]))

    // Landra's forwarder runs after us, as it does on a real page load.
    landraForwardParams(page.window)
    await tick()

    const anchor = page.document.querySelector('a.lc-btn')
    page.click(anchor)
    // Left to Landra alone this would still read utm_source=meta.
    assertFullyAttributed(anchor.href, slug)
  })

  it('wins even when Landra forwards first', async () => {
    page = await boot({ slug, search: BRIEF_CASE })
    page.host.innerHTML = renderFixture(LIVE_CTA_STRUCTURE[slug])
    landraForwardParams(page.window)
    await tick()

    const anchor = page.document.querySelector('a.lc-btn')
    page.click(anchor)
    assertFullyAttributed(anchor.href, slug)
  })
})

describe('click semantics', () => {
  const slug = 'night-sweats-40s-sleep-solutions'

  it('forces offer CTAs into the same tab and keeps the referrer', async () => {
    page = await boot({ slug, search: BRIEF_CASE })
    await page.render(
      renderFixture([
        {
          class: 'lc-img-link',
          href: 'https://hormonefocus.jjsmithonline.com/',
          target: '_blank',
          rel: 'noopener noreferrer',
        },
      ]),
    )

    const anchor = page.document.querySelector('a')
    assert.equal(anchor.hasAttribute('target'), false)
    assert.equal(anchor.getAttribute('rel'), 'noopener')
  })

  it('does not count a middle click or a right click as a CTA click', async () => {
    page = await boot({ slug, search: BRIEF_CASE })
    await page.render(renderFixture(LIVE_CTA_STRUCTURE[slug]))

    const anchor = page.document.querySelector('a.lc-btn')
    anchor.dispatchEvent(new page.window.MouseEvent('auxclick', { bubbles: true, button: 1 }))
    anchor.dispatchEvent(new page.window.MouseEvent('contextmenu', { bubbles: true }))
    assert.equal(page.dataLayer.filter((e) => e.event === 'presell_cta_click').length, 0)
    // …but the href they would copy or open is still the attributed one.
    assertFullyAttributed(anchor.href, slug)
  })

  it('attributes a click that lands on an element inside the CTA', async () => {
    page = await boot({ slug, search: BRIEF_CASE })
    await page.render(
      '<a class="lc-btn" href="https://hormonefocus.jjsmithonline.com/#offer"><span>Shop now</span></a>',
    )

    const span = page.document.querySelector('span')
    page.click(span)
    assertFullyAttributed(page.document.querySelector('a').href, slug)
    assert.equal(page.dataLayer.filter((e) => e.event === 'presell_cta_click').length, 1)
  })

  it('does not fire a second event when another handler already cancelled the click', async () => {
    page = await boot({ slug, search: BRIEF_CASE })
    await page.render(renderFixture(LIVE_CTA_STRUCTURE[slug]))

    const anchor = page.document.querySelector('a.lc-btn')
    const event = new page.window.MouseEvent('click', { bubbles: true, cancelable: true, button: 0 })
    event.preventDefault()
    anchor.dispatchEvent(event)
    assert.equal(page.dataLayer.filter((e) => e.event === 'presell_cta_click').length, 0)
  })
})
