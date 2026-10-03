/**
 * Runtime verification of the tracking tags.
 *
 * Executes each built page's inline scripts for real and records what `fbq`
 * and `dataLayer` actually receive, rather than matching strings in the HTML.
 * The external fbevents.js and gtm.js are never fetched (jsdom does not load
 * subresources by default), so the pixel stub's own queue is the record of
 * every call the page made.
 */
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { before, describe, it } from 'node:test'

import { JSDOM } from 'jsdom'

import { GTM_ID, META_PIXEL_ID, ROOT_ROUTE, SITE_ORIGIN } from '../src/config.js'
import { pages } from '../src/pages.js'
import { quietConsole } from './harness.js'

const root = new URL('..', import.meta.url).pathname

/** Load one built page and run its inline tags. */
function load(file, url) {
  const dom = new JSDOM(readFileSync(`${root}${file}`, 'utf8'), {
    url,
    runScripts: 'dangerously',
    virtualConsole: quietConsole(),
  })
  const { window } = dom
  // The stub the Meta snippet installs queues every call while the real
  // library is absent, which is exactly the log we want.
  const calls = [...(window.fbq?.queue ?? [])].map((args) => [...args])
  return {
    window,
    calls,
    tracked: calls.filter(([method]) => method === 'track').map(([, event]) => event),
    inits: calls.filter(([method]) => method === 'init').map(([, id]) => id),
    // Re-made in this realm: a jsdom object carries jsdom's Object.prototype,
    // which deepStrictEqual rejects against a plain literal.
    dataLayer: [...(window.dataLayer ?? [])].map((entry) => ({ ...entry })),
    close: () => window.close(),
  }
}

/** Every document the site serves, root included. */
const documents = [
  ...pages.map((page) => ({
    name: `/${page.slug}`,
    file: `${page.slug}/index.html`,
    url: `${SITE_ORIGIN}/${page.slug}`,
    slug: page.slug,
  })),
  { name: '/', file: 'index.html', url: `${SITE_ORIGIN}/`, slug: ROOT_ROUTE },
]

before(() => execFileSync('node', ['build.mjs'], { cwd: root, stdio: 'pipe' }))

describe('Meta Pixel', () => {
  for (const page of documents) {
    it(`${page.name} initialises ${META_PIXEL_ID} exactly once`, () => {
      const session = load(page.file, page.url)
      assert.deepEqual(session.inits, [META_PIXEL_ID])
      assert.equal(typeof session.window.fbq, 'function')
      session.close()
    })

    it(`${page.name} fires PageView once and ViewContent once, and nothing else`, () => {
      const session = load(page.file, page.url)
      assert.deepEqual(session.tracked, ['PageView', 'ViewContent'])
      session.close()
    })

    it(`${page.name} never fires Purchase`, () => {
      const session = load(page.file, page.url)
      for (const event of ['Purchase', 'InitiateCheckout', 'AddToCart', 'AddPaymentInfo']) {
        assert.equal(session.tracked.includes(event), false, `${page.name} fired ${event}`)
      }
      session.close()
    })
  }

  it('sends Meta nothing but the event names', () => {
    // No slug, no title, no article text, no URL payload — the pixel calls
    // carry the pixel id and the standard event name, and that is all.
    for (const page of documents) {
      const session = load(page.file, page.url)
      for (const [method, ...rest] of session.calls) {
        if (method === 'init') continue
        assert.deepEqual(rest.slice(1), [], `${page.name}: ${method} carried a payload`)
      }
      session.close()
    }
  })

  it('cannot initialise twice if the snippet is ever included twice', () => {
    const session = load(documents[0].file, documents[0].url)
    const { window } = session
    // Re-run the page's own inline pixel block.
    const block = [...window.document.querySelectorAll('script:not([src])')].find((node) =>
      node.textContent.includes('__hfPixelInit'),
    )
    assert.ok(block, 'found the pixel block')
    window.eval(block.textContent)

    assert.deepEqual([...window.fbq.queue].map((args) => [...args]), session.calls)
    session.close()
  })
})

describe('GTM', () => {
  for (const page of documents) {
    it(`${page.name} boots ${GTM_ID} once and pushes presell_view once`, () => {
      const session = load(page.file, page.url)

      const starts = session.dataLayer.filter((entry) => entry['gtm.start'])
      assert.equal(starts.length, 1, 'one gtm.start')

      const views = session.dataLayer.filter((entry) => entry.event === 'presell_view')
      assert.equal(views.length, 1, 'one presell_view')
      assert.deepEqual(views[0], { event: 'presell_view', presell_slug: page.slug })

      // The container must already have the view event when it initialises.
      assert.ok(
        session.dataLayer.indexOf(views[0]) < session.dataLayer.indexOf(starts[0]),
        'presell_view is pushed before gtm.js',
      )

      const tags = [...session.window.document.querySelectorAll('script[src]')].filter((node) =>
        node.src.includes('googletagmanager.com'),
      )
      assert.equal(tags.length, 1, 'one gtm.js tag injected')
      assert.ok(tags[0].src.includes(`id=${GTM_ID}`))
      session.close()
    })
  }

  it('cannot boot twice if the snippet is ever included twice', () => {
    const session = load(documents[0].file, documents[0].url)
    const { window } = session
    const block = [...window.document.querySelectorAll('script:not([src])')].find((node) =>
      node.textContent.includes('__hfGtmInit'),
    )
    window.eval(block.textContent)
    assert.equal(window.dataLayer.filter((entry) => entry['gtm.start']).length, 1)
    session.close()
  })
})

describe('no duplication across routes', () => {
  it('each route is its own document, so a navigation is one fresh page view', () => {
    // There is no client-side router here: every route is a static document
    // and a navigation is a full load. One PageView each, by construction.
    for (const page of documents) {
      const session = load(page.file, page.url)
      assert.equal(session.tracked.filter((event) => event === 'PageView').length, 1, page.name)
      session.close()
    }
  })

  it('loads each third-party library at most once per document', () => {
    for (const page of documents) {
      const session = load(page.file, page.url)
      const srcs = [...session.window.document.querySelectorAll('script[src]')].map(
        (node) => node.src,
      )
      for (const host of [
        'connect.facebook.net',
        'googletagmanager.com/gtm.js',
        'getlandra.com/api/assets/runtime/',
      ]) {
        assert.equal(
          srcs.filter((src) => src.includes(host)).length,
          1,
          `${page.name} loads ${host} once`,
        )
      }
      session.close()
    }
  })
})
