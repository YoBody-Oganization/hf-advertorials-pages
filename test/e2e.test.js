/**
 * The whole chain, for real: the built page, hydrated by Landra's own live
 * loader, pulling Jane's current article off Landra, then clicked.
 *
 * Nothing here is a stand-in except the browser. The HTML is what the build
 * writes, the loader is the file our <script> tag points at, the markup is
 * whatever Landra is serving right now, and the module under test is the one
 * that ships.
 */
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { afterEach, describe, it } from 'node:test'

import { JSDOM } from 'jsdom'

import { PRESELL_PARAM, SALES_HOST } from '../src/client/attribution.js'
import { LANDRA_RUNTIME, SITE_ORIGIN } from '../src/config.js'
import { pages } from '../src/pages.js'
import { boot, quietConsole, tick } from './harness.js'

const root = new URL('..', import.meta.url).pathname
const PAGE = pages[0]
const SEARCH =
  '?utm_source=facebook&utm_medium=paid&utm_campaign=hf-261003-sleep' +
  '&utm_content=v1&utm_term=image&fbclid=test123'

let offline = false
let loaderSource = ''
try {
  const response = await fetch(LANDRA_RUNTIME)
  assert.ok(response.ok)
  loaderSource = await response.text()
} catch (error) {
  offline = `Landra runtime unreachable (${error.message})`
  console.log(`# ${offline}`)
}

execFileSync('node', ['build.mjs'], { cwd: root, stdio: 'pipe' })
const builtHtml = readFileSync(`${root}${PAGE.slug}/index.html`, 'utf8')

async function waitForReady(host, attempts = 60) {
  for (let i = 0; i < attempts; i += 1) {
    if (host.getAttribute('data-landra-state') === 'ready') return true
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  return false
}

let session
afterEach(() => {
  session?.restore()
  session = undefined
})

describe('built page + live Landra loader + live article', { skip: offline }, () => {
  it('hydrates and attributes every CTA', async () => {
    const dom = new JSDOM(builtHtml, {
      url: `${SITE_ORIGIN}/${PAGE.slug}${SEARCH}`,
      // Our own inline GTM/Pixel snippets and the module script stay inert —
      // this test is about the embed, not about third-party tags.
      runScripts: 'outside-only',
      virtualConsole: quietConsole(),
      pretendToBeVisual: true,
    })
    const { window } = dom
    window.fetch = (input, init) => fetch(input, init)

    // Install our attribution first, exactly as the deferred module script in
    // the built page does, and before the loader can inject anything.
    session = await boot({ slug: PAGE.slug, dom })

    const host = window.document.querySelector('[data-landra-embed]')
    assert.ok(host, 'the built page has an embed host')

    const tag = window.document.querySelector(`script[src="${LANDRA_RUNTIME}"]`)
    assert.ok(tag, 'the built page loads the pinned Landra runtime')
    assert.ok(tag.defer, 'deferred, so the host is parsed before it runs')
    // The loader reads document.currentScript on its synchronous pass; jsdom
    // only sets that for scripts it executes itself.
    Object.defineProperty(window.document, 'currentScript', {
      value: tag,
      configurable: true,
    })

    window.eval(loaderSource)

    assert.ok(await waitForReady(host), 'Landra hydrated the embed')
    await tick()

    const anchors = [...window.document.querySelectorAll('a[href]')]
    assert.ok(anchors.length >= 5, `live article rendered ${anchors.length} links`)
    assert.ok(
      window.document.querySelector('.landra-page-outer'),
      'the article markup, not our shell, is what rendered',
    )

    let offers = 0
    for (const anchor of anchors) {
      if (!anchor.getAttribute('href').includes(SALES_HOST)) continue
      offers += 1
      session.click(anchor)
      const url = new URL(anchor.href)
      assert.equal(url.origin, `https://${SALES_HOST}`)
      assert.equal(url.pathname, '/')
      assert.equal(url.searchParams.get('utm_source'), 'facebook')
      assert.equal(url.searchParams.get('utm_medium'), 'paid')
      assert.equal(url.searchParams.get('utm_campaign'), 'hf-261003-sleep')
      assert.equal(url.searchParams.get('utm_content'), 'v1')
      assert.equal(url.searchParams.get('utm_term'), 'image')
      assert.equal(url.searchParams.get('fbclid'), 'test123')
      assert.equal(url.searchParams.get(PRESELL_PARAM), PAGE.slug)
    }
    assert.ok(offers >= 5, `${offers} offer CTAs attributed`)

    const clicks = session.dataLayer.filter((entry) => entry.event === 'presell_cta_click')
    assert.equal(clicks.length, offers)
    console.log(`#   hydrated ${anchors.length} links, attributed ${offers} offer CTAs`)
  })

  it('renders live content rather than anything committed here', async () => {
    // The shell on disk must contain none of what the loader puts on screen.
    const dom = new JSDOM(builtHtml, {
      url: `${SITE_ORIGIN}/${PAGE.slug}`,
      runScripts: 'outside-only',
      virtualConsole: quietConsole(),
    })
    const { window } = dom
    window.fetch = (input, init) => fetch(input, init)
    const host = window.document.querySelector('[data-landra-embed]')

    assert.equal(host.innerHTML, '', 'the shipped shell is empty before hydration')

    Object.defineProperty(window.document, 'currentScript', {
      value: window.document.querySelector(`script[src="${LANDRA_RUNTIME}"]`),
      configurable: true,
    })
    window.eval(loaderSource)
    assert.ok(await waitForReady(host))

    assert.ok(host.innerHTML.length > 5000, 'the article arrived over the network')

    // The copy that arrived must exist nowhere on disk. The <h1> is excluded
    // on purpose: the article title is also our <title>, which the brief asks
    // for. Body prose is the real test of "not a static copy".
    const prose = [...window.document.querySelectorAll('p')]
      .map((node) => node.textContent.trim())
      .filter((text) => text.length > 80)
    assert.ok(prose.length >= 3, `the live article has prose (${prose.length} paragraphs)`)
    for (const paragraph of prose) {
      assert.ok(!builtHtml.includes(paragraph), 'no article copy is committed to this repo')
    }

    const heading = window.document.querySelector('h1')?.textContent.trim() ?? ''
    console.log(`#   live <h1>:  ${heading}`)
    console.log(`#   our <title>: ${PAGE.title}`)
    dom.window.close()
  })
})
