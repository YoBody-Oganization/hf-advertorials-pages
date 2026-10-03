/**
 * Runs the real presell module against the real, live Landra embeds.
 *
 * This is the test that notices when Jane adds a CTA our class list does not
 * know about, or when Landra changes how it serves the live assets. It needs
 * the network; it skips rather than fails when there isn't one, so the suite
 * still runs offline.
 */
import assert from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'

import { isOfferCta, PRESELL_PARAM, SALES_HOST } from '../src/client/attribution.js'
import { LANDRA_RUNTIME, assetUrl } from '../src/config.js'
import { pages } from '../src/pages.js'
import { boot } from './harness.js'

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

/** Classes that read as a CTA to a human. A hit here must classify as one. */
const LOOKS_LIKE_A_CTA = /(^|[\s-])(cta|btn|button|buy|shop|order)([\s-]|$)/i
const LEGAL = /(privacy|terms|policy|disclaimer|disclosure|legal|refund|shipping|cookie)/i

const live = new Map()

const fetchText = async (url) => {
  const response = await fetch(url, { redirect: 'follow' })
  assert.ok(response.ok, `${url} → HTTP ${response.status}`)
  return { body: await response.text(), response }
}

/**
 * Fetched at module scope rather than in a before() hook: node:test evaluates
 * a suite's `skip` when describe() is called, which is before any hook has
 * run. (And `skip` wants a boolean — a function is simply truthy, which
 * silently skips everything.)
 */
let offline = false
try {
  for (const page of pages) {
    const { body, response } = await fetchText(assetUrl(page.embedId, 'html'))
    live.set(page.slug, { html: body, response })
  }
} catch (error) {
  offline = `live Landra assets unreachable (${error.message})`
  console.log(`# ${offline}`)
}

let session
afterEach(() => {
  session?.restore()
  session = undefined
})

describe('the live Landra assets', { skip: offline }, () => {
  it('serves current.html for all six embed ids', () => {
    assert.equal(live.size, 6)
    for (const [slug, { html }] of live) assert.ok(html.length > 1000, slug)
  })

  it('serves them with a short max-age, so Jane’s edits propagate', () => {
    for (const [slug, { response }] of live) {
      const cacheControl = response.headers.get('cache-control') || ''
      const maxAge = Number((cacheControl.match(/max-age=(\d+)/) || [])[1])
      assert.ok(Number.isFinite(maxAge), `${slug}: ${cacheControl}`)
      // Anything long-lived here would mean a publish in Landra did not show
      // up on the hosted page, which is the point of using live embeds.
      assert.ok(maxAge <= 3600, `${slug} max-age=${maxAge} is too long for a live embed`)
      assert.ok(!/immutable/.test(cacheControl), slug)
    }
  })

  it('serves current.css for all six', async () => {
    for (const page of pages) {
      const { body } = await fetchText(assetUrl(page.embedId, 'css'))
      assert.ok(body.includes('.landra-page'), page.slug)
    }
  })

  it('serves the runtime we pinned, and it is still the one-shot loader', async () => {
    const { body } = await fetchText(LANDRA_RUNTIME)
    assert.ok(body.includes('document.currentScript'), 'reads currentScript synchronously')
    assert.ok(body.includes('[data-landra-embed]'), 'queries the host')
    assert.ok(body.includes('data-landra-src'), 'fetches the live source')
    assert.ok(body.includes('innerHTML'), 'injects the markup')
  })

  it('loads no analytics of its own', () => {
    for (const [slug, { html }] of live) {
      for (const vendor of [
        'googletagmanager.com',
        'google-analytics.com',
        'connect.facebook.net',
        'facebook.com/tr',
        'analytics',
        'gtag(',
        'fbq(',
        'dataLayer',
      ]) {
        assert.ok(!html.includes(vendor), `${slug} unexpectedly references ${vendor}`)
      }
    }
  })
})

describe('CTA coverage against the live markup', { skip: offline }, () => {
  for (const page of pages) {
    it(`${page.slug}: every offer CTA is attributed`, async () => {
      session = await boot({ slug: page.slug, search: BRIEF_CASE, embedId: page.embedId })
      await session.render(live.get(page.slug).html)

      const anchors = session.anchors()
      assert.ok(anchors.length > 0, 'the live page has links')

      let offers = 0
      for (const anchor of anchors) {
        const isOffer = isOfferCta(anchor)
        const href = anchor.getAttribute('href')

        if (!isOffer) {
          // Anything we skip must be visibly not an offer.
          assert.ok(
            !href.includes(SALES_HOST),
            `${page.slug}: skipped a link to the sales host — ${href}`,
          )
          const className = anchor.getAttribute('class') || ''
          assert.ok(
            !LOOKS_LIKE_A_CTA.test(className) || LEGAL.test(href),
            `${page.slug}: "${className}" looks like a CTA but was skipped — ${href}`,
          )
          continue
        }

        offers += 1
        session.click(anchor)
        const url = new URL(anchor.href)
        assert.equal(url.origin, `https://${SALES_HOST}`, href)
        assert.equal(url.pathname, '/', href)
        for (const [key, value] of Object.entries(EXPECTED)) {
          assert.equal(url.searchParams.get(key), value, `${key} on ${href}`)
        }
        assert.equal(url.searchParams.get(PRESELL_PARAM), page.slug)
        assert.equal(anchor.href.split('?').length - 1, 1, `one question mark in ${anchor.href}`)
        assert.notEqual(anchor.getAttribute('target'), '_blank')
      }

      assert.ok(offers > 0, `${page.slug} has at least one offer CTA`)
      assert.equal(
        session.dataLayer.filter((entry) => entry.event === 'presell_cta_click').length,
        offers,
      )
    })
  }

  it('reports what each live page contains', () => {
    for (const page of pages) {
      const matches = live.get(page.slug).html.match(/<a\s[^>]*>/g) || []
      console.log(`#   ${page.slug}: ${matches.length} links`)
    }
  })
})
