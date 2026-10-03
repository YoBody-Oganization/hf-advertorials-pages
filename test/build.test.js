import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { before, describe, it } from 'node:test'

import {
  GTM_ID,
  LANDRA_RUNTIME,
  META_PIXEL_ID,
  ROOT_ROUTE,
  SITE_ORIGIN,
} from '../src/config.js'
import { pages } from '../src/pages.js'

const root = new URL('..', import.meta.url).pathname
const read = (relative) => readFileSync(new URL(`../${relative}`, import.meta.url), 'utf8')
const count = (haystack, needle) => haystack.split(needle).length - 1

const documents = new Map()

before(() => {
  execFileSync('node', ['build.mjs'], { cwd: root, stdio: 'pipe' })
  for (const page of pages) documents.set(page.slug, read(`${page.slug}/index.html`))
})

describe('build output', () => {
  it('emits one clean route per page', () => {
    assert.equal(documents.size, 6)
    for (const page of pages) assert.ok(documents.get(page.slug).startsWith('<!doctype html>'))
  })

  it('emits robots.txt, sitemap.xml and a 404', () => {
    const sitemap = read('sitemap.xml')
    for (const page of pages) assert.ok(sitemap.includes(`${SITE_ORIGIN}/${page.slug}`))
    assert.equal(count(sitemap, '<loc>'), 6)
    assert.ok(read('robots.txt').includes(`${SITE_ORIGIN}/sitemap.xml`))
    assert.ok(read('404.html').includes('noindex'))
  })

  it('ships the host config alongside the pages', () => {
    assert.ok(read('_headers').includes('immutable'))
    assert.ok(read('_headers').includes('/assets/*'))
  })

  it('serves content-hashed client modules that actually exist', () => {
    const html = documents.get(pages[0].slug)
    const script = html.match(/<script type="module" src="(\/assets\/presell\.[0-9a-f]{8}\.js)">/)
    const preload = html.match(/<link rel="modulepreload" href="(\/assets\/attribution\.[0-9a-f]{8}\.js)"/)
    assert.ok(script, 'hashed module script')
    assert.ok(preload, 'hashed modulepreload')

    const presell = read(script[1].slice(1))
    // The import specifier must have been rewritten to the hashed filename,
    // or the browser would 404 on a file the build never wrote.
    assert.ok(presell.includes(`from '.${preload[1].replace('/assets', '')}'`), 'import rewritten')
    assert.ok(read(preload[1].slice(1)).includes('export function buildCtaUrl'))
  })
})

describe('Landra live embed wiring', () => {
  for (const page of pages) {
    it(`${page.slug} points at live asset ${page.embedId}`, () => {
      const html = documents.get(page.slug)
      const base = `https://www.getlandra.com/api/assets/${page.embedId}/current`

      assert.equal(count(html, `data-landra-embed="${page.embedId}"`), 1)
      assert.equal(count(html, `data-landra-src="${base}.html"`), 1)
      assert.equal(count(html, `href="${base}.css"`), 1)

      // `current.*` is the live pointer. A pinned version or a local copy here
      // would freeze the page against Jane's edits.
      assert.equal(count(html, '/current.'), 2)
      assert.equal(count(html, page.embedId), 3)
    })
  }

  it('loads the Landra runtime exactly once per page, deferred', () => {
    for (const [slug, html] of documents) {
      assert.equal(count(html, LANDRA_RUNTIME), 1, slug)
      assert.equal(count(html, `<script src="${LANDRA_RUNTIME}" defer></script>`), 1, slug)
      assert.equal(count(html, 'getlandra.com/api/assets/runtime/'), 1, slug)
    }
  })

  it('contains none of Jane’s article copy', () => {
    for (const [slug, html] of documents) {
      // The shell is a shell: one embed host, no prose, no inlined markup.
      assert.equal(count(html, 'landra-page-outer'), 0, slug)
      assert.ok(html.length < 7000, `${slug} shell is ${html.length} bytes`)
    }
  })
})

describe('tracking', () => {
  it('installs GTM once per page', () => {
    for (const [slug, html] of documents) {
      assert.equal(count(html, GTM_ID), 2, slug) // the snippet and the noscript iframe
      assert.equal(count(html, 'googletagmanager.com/gtm.js'), 1, slug)
      assert.equal(count(html, 'googletagmanager.com/ns.html'), 1, slug)
      assert.equal(count(html, '__hfGtmInit'), 2, slug) // the guard reads then sets
    }
  })

  it('installs the Meta Pixel once per page', () => {
    for (const [slug, html] of documents) {
      assert.equal(count(html, META_PIXEL_ID), 2, slug) // the init call and the noscript img
      assert.equal(count(html, 'connect.facebook.net/en_US/fbevents.js'), 1, slug)
      assert.equal(count(html, "fbq('init'"), 1, slug)
      assert.equal(count(html, '__hfPixelInit'), 2, slug)
    }
  })

  it('fires PageView and ViewContent once each, and never Purchase', () => {
    for (const [slug, html] of documents) {
      assert.equal(count(html, "fbq('track', 'PageView')"), 1, slug)
      assert.equal(count(html, "fbq('track', 'ViewContent')"), 1, slug)
      // Shopify owns Purchase, into this same dataset. Nothing here may send
      // one — not under any name, and not as a dataLayer event either.
      assert.equal(count(html, "'Purchase'"), 0, slug)
      assert.equal(count(html, "'InitiateCheckout'"), 0, slug)
      assert.equal(count(html, "'AddToCart'"), 0, slug)
      assert.equal(count(html, 'fbq(\'track\''), 2, slug)
    }
  })

  it('pushes presell_view with the page slug, before GTM boots', () => {
    for (const page of pages) {
      const html = documents.get(page.slug)
      assert.equal(count(html, "'presell_view'"), 1)
      assert.ok(html.includes(`presell_slug: ${JSON.stringify(page.slug)}`))
      assert.ok(
        html.indexOf("'presell_view'") < html.indexOf('gtm.js'),
        'the view event must already be on the dataLayer when GTM initialises',
      )
      // No health terms, no article text, no personal data — the slug and
      // the event name are the whole payload.
      assert.equal(count(html, 'presell_cta_click'), 0)
    }
  })
})

describe('metadata', () => {
  for (const page of pages) {
    it(`${page.slug} carries its title and canonical`, () => {
      const html = documents.get(page.slug)
      const canonical = `${SITE_ORIGIN}/${page.slug}`
      assert.equal(count(html, `<link rel="canonical" href="${canonical}" />`), 1)
      assert.equal(count(html, `<meta property="og:url" content="${canonical}" />`), 1)
      assert.equal(count(html, `data-hf-presell="${page.slug}"`), 1)

      const title = html.match(/<title>([^<]*)<\/title>/)[1]
      const decoded = title.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
      assert.equal(decoded, page.title)
    })
  }

  it('omits a meta description rather than inventing one', () => {
    for (const page of pages) {
      const html = documents.get(page.slug)
      const hasTag = html.includes('<meta name="description"')
      assert.equal(hasTag, Boolean(page.description.trim()), page.slug)
    }
  })

  it('escapes the titles it is given', () => {
    const hostile = {
      slug: 'x',
      embedId: '00000000-0000-4000-8000-000000000000',
      title: 'Quote " angle < & amp',
      description: '',
    }
    return import('../src/template.js').then(({ renderPage }) => {
      const html = renderPage(hostile, { scriptPath: '/a.js', attributionPath: '/b.js' })
      assert.ok(html.includes('<title>Quote " angle &lt; &amp; amp</title>'))
      assert.ok(html.includes('content="Quote &quot; angle &lt; &amp; amp"'))
    })
  })
})

describe('build guards', () => {
  const build = async (overrides) => {
    const { renderPage } = await import('../src/template.js')
    return renderPage(overrides, { scriptPath: '/a.js', attributionPath: '/b.js' })
  }

  it('renders without a description', async () => {
    const html = await build({
      slug: 'a-b',
      embedId: '00000000-0000-4000-8000-000000000000',
      title: 'T',
      description: '',
    })
    assert.equal(count(html, '<meta name="description"'), 0)
  })
})

describe('output at the repository root', () => {
  it('puts each route where a plain static host will find it', () => {
    // Not dist/<slug> — the built pages are committed, and a host that only
    // serves the checked-out files must resolve /<slug> on its own.
    for (const page of pages) {
      assert.ok(existsSync(new URL(`../${page.slug}/index.html`, import.meta.url)), page.slug)
    }
    assert.ok(existsSync(new URL('../assets', import.meta.url)))
  })

  it('serves a real presell at the bare root', () => {
    const root = read('index.html')
    const page = pages.find((entry) => entry.slug === ROOT_ROUTE)
    assert.ok(page, 'ROOT_ROUTE names a configured page')

    // Byte-identical to the slug route, so it tracks and attributes the same.
    assert.equal(root, read(`${page.slug}/index.html`))
    assert.equal(count(root, `data-landra-embed="${page.embedId}"`), 1)
    assert.equal(count(root, `data-hf-presell="${page.slug}"`), 1)
    assert.equal(count(root, GTM_ID), 2)
    assert.equal(count(root, META_PIXEL_ID), 2)

    // Canonical stays on the slug URL, so the two paths are not indexed twice.
    assert.equal(
      count(root, `<link rel="canonical" href="${SITE_ORIGIN}/${page.slug}" />`),
      1,
    )
  })

  it('has no host redirect that would hide the root page', () => {
    // A "/" redirect fires before any static file is served. With a presell at
    // the root, one here would mean nobody ever sees it.
    assert.equal(JSON.parse(read('vercel.json')).redirects, undefined)
    const redirects = read('_redirects')
      .split('\n')
      .filter((line) => line.trim() && !line.trim().startsWith('#'))
    assert.deepEqual(redirects, [])
  })

  it('records everything it wrote in the manifest', () => {
    const manifest = JSON.parse(read('.build-manifest.json'))
    for (const page of pages) assert.ok(manifest.outputs.includes(page.slug), page.slug)
    for (const entry of ['assets', 'index.html', '404.html', 'sitemap.xml', 'robots.txt']) {
      assert.ok(manifest.outputs.includes(entry), entry)
    }
  })

  it('retires a route the config no longer lists, and never touches the source', () => {
    const manifestPath = new URL('../.build-manifest.json', import.meta.url)
    const real = JSON.parse(readFileSync(manifestPath, 'utf8'))

    // A route from an earlier build, plus entries a corrupted or hand-edited
    // manifest might name. The second group must be refused outright: source
    // and output share a directory here, so this is the one place a bug could
    // delete the repository.
    const stale = 'tmp-retired-route'
    mkdirSync(new URL(`../${stale}/`, import.meta.url), { recursive: true })
    writeFileSync(new URL(`../${stale}/index.html`, import.meta.url), 'old')

    const hostile = ['src', 'test', 'build.mjs', 'package.json', '..', '.git', 'node_modules']
    writeFileSync(
      manifestPath,
      JSON.stringify({ outputs: [...real.outputs, stale, ...hostile] }, null, 2),
    )

    execFileSync('node', ['build.mjs'], { cwd: root, stdio: 'pipe' })

    assert.equal(existsSync(new URL(`../${stale}`, import.meta.url)), false, 'stale route retired')
    for (const entry of hostile) {
      if (entry === '..') continue
      assert.ok(existsSync(new URL(`../${entry}`, import.meta.url)), `${entry} survived`)
    }
    // And the live routes are still there.
    for (const page of pages) {
      assert.ok(existsSync(new URL(`../${page.slug}/index.html`, import.meta.url)), page.slug)
    }
  })

  it('refuses a slug that would collide with the source tree', async () => {
    const { pages: real } = await import('../src/pages.js')
    assert.ok(real.every((page) => !['src', 'test', 'assets', 'public'].includes(page.slug)))
  })
})
