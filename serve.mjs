#!/usr/bin/env node
/** Local preview of the built site on :4321. Node built-ins only. */
import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { createServer } from 'node:http'
import { extname, join, normalize } from 'node:path'

// The build writes the routes at the repository root, so that is the docroot.
const docroot = new URL('./', import.meta.url).pathname
const port = Number(process.env.PORT) || 4321

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
}

const resolve = async (pathname) => {
  // normalize() collapses ../ before it is joined, so a crafted path cannot
  // read outside the docroot.
  const safe = normalize(decodeURIComponent(pathname)).replace(/^(\.\.[/\\])+/, '')
  for (const candidate of [join(docroot, safe), join(docroot, safe, 'index.html')]) {
    try {
      if ((await stat(candidate)).isFile()) return candidate
    } catch {
      /* try the next shape */
    }
  }
  return null
}

createServer(async (request, response) => {
  const { pathname } = new URL(request.url, 'http://localhost')
  const file = (await resolve(pathname)) ?? join(docroot, '404.html')
  const found = file.endsWith('404.html') && pathname !== '/404.html'
  response.writeHead(found ? 404 : 200, {
    'content-type': TYPES[extname(file)] ?? 'application/octet-stream',
    'cache-control': 'no-store',
  })
  createReadStream(file).pipe(response)
}).listen(port, () => console.log(`http://localhost:${port}`))
