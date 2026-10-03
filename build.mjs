#!/usr/bin/env node
/**
 * Build the six presell shells, in place, at the repository root.
 *
 * No bundler and no framework. Each route is a static document whose entire
 * body is one Landra embed host; the article itself is fetched from Landra by
 * the visitor's browser on every load, which is what keeps Jane's edits live.
 *
 * Output lands at the root, and is committed, so that *any* static host
 * serves the routes at `/<slug>` with no configuration — a host that runs
 * `npm run build` and one that only serves the checked-out files behave
 * identically. The cost is that generated files sit beside the source; the
 * manifest below is what keeps that honest.
 *
 * The two client modules are content-hashed so they can be served immutable,
 * which means rewriting the import specifier inside presell.js before hashing
 * it. That is the only clever thing in this file.
 */
import { createHash } from 'node:crypto'
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { ROOT_ROUTE, SALES_PAGE, SITE_ORIGIN } from './src/config.js'
import { pages } from './src/pages.js'
import { renderPage } from './src/template.js'

const root = dirname(fileURLToPath(import.meta.url))
const MANIFEST = '.build-manifest.json'

/**
 * Never deletable, whatever a stale manifest claims. Generated output and
 * source share a directory here, so the cleanup step is the one place a bug
 * could eat the repository.
 */
const PROTECTED = new Set([
  '.git',
  '.github',
  '.gitignore',
  '.nvmrc',
  'README.md',
  'build.mjs',
  'serve.mjs',
  'package.json',
  'package-lock.json',
  'netlify.toml',
  'vercel.json',
  'node_modules',
  'public',
  'src',
  'test',
  MANIFEST,
])

const hash = (contents) => createHash('sha256').update(contents).digest('hex').slice(0, 8)

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

/**
 * Catch the mistakes that would otherwise ship silently: a slug that does not
 * match the URL marketing is about to put in an ad, two routes pointed at the
 * same Landra page, or a slug that would collide with the source tree.
 */
function validate(list) {
  const slugs = new Set()
  const embeds = new Set()
  for (const page of list) {
    if (!SLUG.test(page.slug)) throw new Error(`Invalid slug: ${page.slug}`)
    if (PROTECTED.has(page.slug)) throw new Error(`Slug collides with the source tree: ${page.slug}`)
    if (!UUID.test(page.embedId)) throw new Error(`Invalid Landra embed id: ${page.embedId}`)
    if (!page.title || !page.title.trim()) throw new Error(`Missing title for ${page.slug}`)
    if (slugs.has(page.slug)) throw new Error(`Duplicate slug: ${page.slug}`)
    if (embeds.has(page.embedId)) throw new Error(`Duplicate embed id: ${page.embedId}`)
    slugs.add(page.slug)
    embeds.add(page.embedId)
  }
  if (!list.length) throw new Error('No pages configured')
}

/**
 * Remove what the previous build wrote, and only that.
 *
 * Driven by a manifest rather than by the current config, so renaming a slug
 * retires the old route instead of leaving it live forever — which, on a
 * domain taking paid traffic, is the difference between a dead ad link and a
 * page nobody remembers publishing.
 */
async function cleanPreviousBuild() {
  let previous
  try {
    previous = JSON.parse(await readFile(join(root, MANIFEST), 'utf8'))
  } catch {
    return [] // first build, or the manifest was removed by hand
  }

  const removed = []
  for (const entry of previous.outputs ?? []) {
    if (typeof entry !== 'string' || !entry || entry.includes('/') || entry.includes('\\')) continue
    if (entry.startsWith('.') || PROTECTED.has(entry)) continue
    await rm(join(root, entry), { recursive: true, force: true })
    removed.push(entry)
  }
  return removed
}

async function buildClientAssets() {
  const attribution = await readFile(join(root, 'src/client/attribution.js'), 'utf8')
  const attributionName = `attribution.${hash(attribution)}.js`

  const presellSource = await readFile(join(root, 'src/client/presell.js'), 'utf8')
  const presell = presellSource.replace("'./attribution.js'", `'./${attributionName}'`)
  if (presell === presellSource) {
    throw new Error('presell.js no longer imports ./attribution.js — update the build')
  }
  const presellName = `presell.${hash(presell)}.js`

  await mkdir(join(root, 'assets'), { recursive: true })
  await writeFile(join(root, 'assets', attributionName), attribution)
  await writeFile(join(root, 'assets', presellName), presell)

  return {
    attributionPath: `/assets/${attributionName}`,
    scriptPath: `/assets/${presellName}`,
  }
}

const renderSitemap = (list) =>
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
  list.map((page) => `  <url>\n    <loc>${SITE_ORIGIN}/${page.slug}</loc>\n  </url>`).join('\n') +
  `\n</urlset>\n`

const notFound = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="robots" content="noindex" />
    <title>Page not found</title>
    <style>
      html { background: #fff; color: #333; font: 16px/1.6 system-ui, sans-serif; }
      body { margin: 0; display: grid; place-items: center; min-height: 100vh; padding: 24px; }
    </style>
  </head>
  <body>
    <p>This page is not available.</p>
  </body>
</html>
`

/** The bare root, when ROOT_ROUTE is null: send it to the offer. */
const rootRedirect = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="robots" content="noindex" />
    <meta http-equiv="refresh" content="0; url=${SALES_PAGE}" />
    <link rel="canonical" href="${SALES_PAGE}" />
    <title>Hormone Focus</title>
  </head>
  <body>
    <a href="${SALES_PAGE}">Continue to Hormone Focus</a>
  </body>
</html>
`

async function main() {
  validate(pages)

  const removed = await cleanPreviousBuild()
  const assets = await buildClientAssets()

  for (const page of pages) {
    await mkdir(join(root, page.slug), { recursive: true })
    await writeFile(join(root, page.slug, 'index.html'), renderPage(page, assets))
  }

  // The bare domain. Serving a real presell here means a stray visit lands on
  // an article rather than on a bounce, and it is the same shell as the slug
  // route — same tracking, same attribution, canonical pointed at the slug.
  const rootPage = ROOT_ROUTE ? pages.find((page) => page.slug === ROOT_ROUTE) : null
  if (ROOT_ROUTE && !rootPage) throw new Error(`ROOT_ROUTE is not a configured slug: ${ROOT_ROUTE}`)
  await writeFile(
    join(root, 'index.html'),
    rootPage ? renderPage(rootPage, assets) : rootRedirect,
  )
  await writeFile(join(root, '404.html'), notFound)
  await writeFile(join(root, 'sitemap.xml'), renderSitemap(pages))
  await writeFile(
    join(root, 'robots.txt'),
    `User-agent: *\nAllow: /\n\nSitemap: ${SITE_ORIGIN}/sitemap.xml\n`,
  )

  // Host config that lives beside the pages: _headers and _redirects.
  await cp(join(root, 'public'), root, { recursive: true })

  const outputs = [
    ...pages.map((page) => page.slug),
    'assets',
    'index.html',
    '404.html',
    'sitemap.xml',
    'robots.txt',
    '_headers',
    '_redirects',
  ]
  await writeFile(
    join(root, MANIFEST),
    `${JSON.stringify({ outputs: outputs.sort() }, null, 2)}\n`,
  )

  const retired = removed.filter((entry) => !outputs.includes(entry))
  if (retired.length) console.log(`Retired: ${retired.join(', ')}`)
  console.log(`Built ${pages.length} routes at the repository root`)
  console.log(`  /  →  ${rootPage ? rootPage.slug : SALES_PAGE}`)
  for (const page of pages) console.log(`  /${page.slug}  →  ${page.embedId}`)
  console.log(`  assets: ${assets.scriptPath}, ${assets.attributionPath}`)
}

await main()
