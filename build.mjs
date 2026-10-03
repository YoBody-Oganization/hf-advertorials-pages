#!/usr/bin/env node
/**
 * Build the six presell shells into dist/.
 *
 * No bundler and no framework. Each route is a static document whose entire
 * body is one Landra embed host; the article itself is fetched from Landra by
 * the visitor's browser on every load, which is what keeps Jane's edits live.
 * A bundler here would add weight to a page that has nothing to bundle.
 *
 * The two client modules are content-hashed so they can be served immutable,
 * which means rewriting the import specifier inside presell.js before hashing
 * it. That is the only clever thing in this file.
 */
import { createHash } from 'node:crypto'
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { SITE_ORIGIN } from './src/config.js'
import { pages } from './src/pages.js'
import { renderPage } from './src/template.js'

const root = dirname(fileURLToPath(import.meta.url))
const dist = join(root, 'dist')

const hash = (contents) => createHash('sha256').update(contents).digest('hex').slice(0, 8)

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

/**
 * Catch the mistakes that would otherwise ship silently: a slug that does not
 * match the URL marketing is about to put in an ad, or two routes pointed at
 * the same Landra page.
 */
function validate(list) {
  const slugs = new Set()
  const embeds = new Set()
  for (const page of list) {
    if (!SLUG.test(page.slug)) throw new Error(`Invalid slug: ${page.slug}`)
    if (!UUID.test(page.embedId)) throw new Error(`Invalid Landra embed id: ${page.embedId}`)
    if (!page.title || !page.title.trim()) throw new Error(`Missing title for ${page.slug}`)
    if (slugs.has(page.slug)) throw new Error(`Duplicate slug: ${page.slug}`)
    if (embeds.has(page.embedId)) throw new Error(`Duplicate embed id: ${page.embedId}`)
    slugs.add(page.slug)
    embeds.add(page.embedId)
  }
  if (!list.length) throw new Error('No pages configured')
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

  await mkdir(join(dist, 'assets'), { recursive: true })
  await writeFile(join(dist, 'assets', attributionName), attribution)
  await writeFile(join(dist, 'assets', presellName), presell)

  return {
    attributionPath: `/assets/${attributionName}`,
    scriptPath: `/assets/${presellName}`,
  }
}

function renderSitemap(list) {
  const urls = list
    .map((page) => `  <url>\n    <loc>${SITE_ORIGIN}/${page.slug}</loc>\n  </url>`)
    .join('\n')
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`
}

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

async function main() {
  validate(pages)

  await rm(dist, { recursive: true, force: true })
  await mkdir(dist, { recursive: true })

  const assets = await buildClientAssets()

  for (const page of pages) {
    const dir = join(dist, page.slug)
    await mkdir(dir, { recursive: true })
    await writeFile(join(dir, 'index.html'), renderPage(page, assets))
  }

  await writeFile(join(dist, '404.html'), notFound)
  await writeFile(join(dist, 'sitemap.xml'), renderSitemap(pages))
  await writeFile(
    join(dist, 'robots.txt'),
    `User-agent: *\nAllow: /\n\nSitemap: ${SITE_ORIGIN}/sitemap.xml\n`,
  )

  // Static hosts that do not read vercel.json / netlify.toml still get the
  // headers and the bare-root redirect from here.
  await cp(join(root, 'public'), dist, { recursive: true })

  console.log(`Built ${pages.length} routes into dist/`)
  for (const page of pages) console.log(`  ${SITE_ORIGIN}/${page.slug}  →  ${page.embedId}`)
  console.log(`  assets: ${assets.scriptPath}, ${assets.attributionPath}`)
}

await main()
