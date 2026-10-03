# Hormone Focus presell pages

Six advertorial / presell pages at `learn.hormonefocus.jjsmithonline.com`, each
a **live Landra embed** that feeds the Hormone Focus sales page.

```
Meta ad → presell page → hormonefocus.jjsmithonline.com → Shopify → purchase
```

Jane keeps editing these articles in Landra. Nothing in this repo contains her
copy — the browser fetches each article from Landra on every page load, so
"Update live embed" in Landra is the whole publishing step. **No deploy here is
needed for a content change.**

## Routes

| Route | Landra embed id |
| --- | --- |
| `/night-sweats-women-over-40-solutions` | `32738fc0-5785-452b-b0e4-3d2149b308e3` |
| `/hormones-40s-sleep-weight-energy` | `3dc0c8cf-743a-4b8a-8a2b-822dc03ed678` |
| `/belly-weight-gain-after-40-hormones` | `e7cabdbd-8cb5-4f53-b0b3-d44ca4d1cf59` |
| `/belly-weight-loss-40s-hormones` | `f40eaddb-b7b0-4b14-ae49-cd897010362e` |
| `/metabolism-changes-40s-nutrition-strategy` | `747b6e28-9283-433d-99cb-0bf524bd7fe9` |
| `/night-sweats-40s-sleep-solutions` | `a43060aa-d30f-4432-ba6b-9417a336d5d1` |

Routes live in [`src/pages.js`](src/pages.js). Adding a seventh presell is one
entry in that array.

## Commands

```bash
npm install     # one dev dependency: jsdom, for the test suite
npm run build   # regenerates the six routes at the repo root
npm test        # 132 tests; the live ones skip when offline
npm run dev     # build, then serve on http://localhost:4321
```

Node 22 (`.nvmrc`). **Zero runtime dependencies** — nothing is shipped to the
browser but two small ES modules.

## Why not Next.js

The brief allowed a simpler architecture if one was clearly better, and here it
is. Every one of these pages is an empty shell: the entire body is fetched from
Landra at runtime. React would add ~90 KB and a hydration pass to a document
with nothing to hydrate, on pages whose traffic is paid mobile.

It also removes a real hazard. Landra's loader is a one-shot IIFE: it reads
`document.currentScript` on its synchronous pass and queries
`[data-landra-embed]` exactly once, never re-scanning. In a static document a
plain `<script defer>` is unambiguously correct. Under `next/script`,
`afterInteractive` would delay the article fetch until after hydration and
`beforeInteractive` risks running before the host element exists.

So: a ~100-line build script that renders six static documents from one
template. Clean routing comes from the output shape (`dist/<slug>/index.html`).

## How a page works

```
<slug>/index.html           the shell: metadata, GTM, Pixel, one embed host
  └─ Landra current.css     the published stylesheet for this page
  └─ Landra live runtime    fetches current.html, assigns innerHTML
  └─ /assets/presell.js     keeps the offer CTAs attributed
```

### Why the built pages are in the repo

`npm run build` writes the routes **at the repository root**, and that output
is committed. It means any static host serves `/<slug>` with no configuration
— one that runs the build and one that only serves the checked-out files
behave identically. Build output beside source is the price.

Two consequences worth knowing:

- **Rebuild and commit** after changing the template, the tracking IDs, the
  route list or the CTA logic. Jane's content edits still need nothing.
- `.build-manifest.json` records what the last build wrote, so renaming a slug
  retires the old route instead of leaving a stale page live on a domain
  taking paid traffic. The cleanup refuses to touch anything in the source
  tree, and `test/build.test.js` proves it against a hostile manifest.

Serving the root also serves `src/`, `test/` and `package.json` — true of any
repo-served static site. There is nothing secret in them; the GTM and Pixel
IDs are public by nature and already in every page's HTML.

The shell is under 7 KB and renders nothing of its own — no header, no footer,
no fonts. Landra's stylesheet is scoped to `.landra-page-outer` and opens with
`all: revert`, so any chrome we added would be both visible and unstyled. The
advertorial is the page.

## Attribution

### What is captured

`utm_source`, `utm_medium`, `utm_campaign`, `utm_content`, `utm_term`, `fbclid`,
`gclid` — read off the landing URL, passed through **verbatim**. The UTM spec
(`hf-YYMMDD-<angle>` and the allowed source/medium/term values) is enforced by
whoever builds the ad URL; nothing here validates, rewrites or reinterprets a
value.

The visit is kept in `sessionStorage` under `hf_attribution`. A URL carrying
attribution is a fresh ad click and replaces it; a URL carrying none falls back
to the stored visit, so an internal move cannot blank it. A visit with no UTMs
gets no UTMs — none are invented.

### Which presell

`hf_presell=<slug>` is appended to every CTA. It is a separate parameter, never
a UTM, and never a substitute for `utm_content` (which identifies the ad
creative).

### The merge rule

| Key | Visit carried it | Visit did not |
| --- | --- | --- |
| `utm_*`, `fbclid`, `gclid` | **the visit's value wins** | Jane's authored value is kept |
| `hf_presell` | always set to the page slug | always set to the page slug |
| anything else on the link | kept | kept |
| `#offer` hash | kept | kept |

Jane's CTAs are authored with hard-coded UTMs
(`utm_source=meta&utm_campaign=hf_meta_adv_nightsweats_v1&utm_content=cta1`).
A real ad click overrides those. Keys the visit did not carry are left alone
rather than deleted, so a bare visit still reaches the sales page tagged the
way Jane tagged it.

Example — in:

```
/night-sweats-women-over-40-solutions?utm_source=facebook&utm_medium=paid
  &utm_campaign=hf-261003-sleep&utm_content=v1&utm_term=image&fbclid=test123
```

out:

```
https://hormonefocus.jjsmithonline.com/?utm_source=facebook&utm_medium=paid
  &utm_campaign=hf-261003-sleep&utm_content=v1&utm_term=image&fbclid=test123
  &hf_presell=night-sweats-women-over-40-solutions#offer
```

### Which links get rewritten

An anchor is an offer CTA if **either**:

1. it already points at `hormonefocus.jjsmithonline.com` — nothing on an
   advertorial links there except the offer; or
2. it carries a Landra CTA class — `lc-btn`, `lc-img-link`, `lr-cta`,
   `lc-ri-item-cta`, `mobile-sticky-cta` — **and** its path does not look
   legal (`privacy`, `terms`, `policy`, `disclosure`, …).

Everything else is left exactly as authored: in-page jumps, `mailto:`/`tel:`,
external citations, policy pages, and Landra's own `data-lp-popup` dialog
links. Add `data-hf-no-attribution` to any link in Landra to opt it out by hand.

### How it survives dynamic content

Landra injects the article with `innerHTML` after a network round trip, so no
CTA exists when our module runs. Two layers, in
[`src/client/presell.js`](src/client/presell.js):

1. **A `MutationObserver`** rewrites CTA hrefs as they appear. This is what
   makes the status bar, *copy link address* and *open in new tab* honest.
2. **A capture-phase `click` listener on `document`** recomputes the href one
   last time at click time, then lets the browser's own default action run.
   The browser reads `href` when it performs that action — after our listener
   returns — so modifier-click and middle-click keep working and still get the
   decorated URL. This layer is what cannot be outrun by a late re-render or a
   cloned node.

`buildCtaUrl` is a fixed point, so re-running over a decorated link writes
nothing and the href observer cannot feed itself.

### Landra forwards params too — and we have to beat it

Landra's inner runtime ships `__landraForwardParams()`, which merges the
landing URL's params onto every link but **never clobbers** a param the link
already carries. Since Jane's CTAs are hard-coded with `utm_source=meta` and
none carry `data-lp-utm`, Landra on its own would deliver a `utm_source=facebook`
ad click to the sales page as `utm_source=meta`. Our handling is authoritative
rather than additive for exactly this reason, and
`test/presell.dom.test.js` proves it wins whichever order the two run in.

## Tracking

| | |
| --- | --- |
| GTM | `GTM-WT4MWLTH`, one inline snippet + one `noscript` iframe per page |
| Meta Pixel | `1614860232058835`, `PageView` and `ViewContent`, once each |
| Purchase | **never fired here** — Shopify owns it, into this same dataset |

Both are guarded (`__hfGtmInit`, `__hfPixelInit`) so a double include cannot
initialise twice. **Landra loads no analytics of its own** — its runtime makes
no network calls at all; `test/live-embed.test.js` asserts this against the
live assets so a future Landra change surfaces as a test failure.

> [!IMPORTANT]
> Check that the `GTM-WT4MWLTH` container does not also contain a Meta Pixel
> base tag or a PageView tag. This repo cannot see inside the container; if one
> is configured there, `PageView` will fire twice on these pages. Either remove
> it from the container or remove the inline Pixel block from
> [`src/template.js`](src/template.js) — not both.

### dataLayer events

| Event | Payload |
| --- | --- |
| `presell_view` | `presell_slug` — pushed inline, before GTM initialises |
| `presell_cta_click` | `presell_slug`, `destination` — on a primary click |

Slug and destination only. No article content, no health information, no
personal data. Middle-click and right-click decorate the href but do not count
as a CTA click.

## Deploying

Vercel ([`vercel.json`](vercel.json)) and Netlify / Cloudflare Pages
([`netlify.toml`](netlify.toml), `public/_headers`, `public/_redirects`) are
both configured: build `npm run build`, publish `.`.

Anything else — GitHub Pages, S3, a plain web server — can serve the checked
-out repo as-is, because the pages are committed.

Point `learn.hormonefocus.jjsmithonline.com` at the deployment.

`/` serves the first presell — `ROOT_ROUTE` in [`src/config.js`](src/config.js).
It is the same shell as the slug route, so it tracks and attributes
identically, and its canonical points at the slug URL so the two paths are not
indexed as duplicates. Set `ROOT_ROUTE` to `null` to redirect `/` to the sales
page instead, and restore the `/` rule in `vercel.json` and
`public/_redirects` if you do — **a host redirect fires before any static
file**, so leaving one in place would hide whatever the root serves.

Shells revalidate on every load (they are tiny and carry the tracking IDs);
`/assets/*` is content-hashed and served immutable. **The Landra article is
never cached by us** — the browser fetches `current.html` from Landra directly,
under Landra's own 5-minute `max-age`.

### Why there is no CSP

A Content-Security-Policy strict enough to be worth having would have to
enumerate every origin Landra might use. The moment Jane adds a video embed or
a new font, the page breaks and nobody would connect it to a header in this
repo — which defeats the point of live embeds. `X-Content-Type-Options` and
`Referrer-Policy` are set; a CSP should only be added alongside a plan for
keeping it in step with Landra.

## Known issues in the Landra pages

Both are Jane's to fix in Landra; both are handled correctly here meanwhile.

- **`/belly-weight-loss-40s-hormones`** — the mobile sticky CTA points at
  `www.jjsmithonline.com/supplements/hormonal-imbalance/`, not the sales page.
  It is the only CTA across all six that diverges. Our class rule catches it
  and sends it to the sales page like every other CTA.
- **Hard-coded UTMs on every CTA** (`utm_source=meta`, `utm_campaign=hf_meta_adv_*`)
  do not match the official spec — `meta` is not an allowed source, and the
  campaign is not `hf-YYMMDD-<angle>`. A real ad click overrides them, but a
  direct or organic visit will carry them through to the sales page. Clearing
  them in Landra would make unattributed traffic read as unattributed.

## Tests

```
test/attribution.test.js    the merge rules, pure
test/presell.dom.test.js    the module in jsdom: dynamic content, races,
                            clones, storage, Landra's forwarder, click semantics
test/build.test.js          the generated HTML: embed ids, one runtime, one GTM,
                            one Pixel, no Purchase, metadata, root output and
                            the cleanup's refusal to delete source
test/tracking.test.js       executes each built page and records what fbq and
                            dataLayer actually received
test/live-embed.test.js     the module against the six real live embeds
test/e2e.test.js            the built page, hydrated by Landra's real loader
                            pulling the real article, then clicked
```

The suite runs with `--test-concurrency=1`. Several files shell out to
`node build.mjs`, which rewrites the routes in place at the repository root;
run the files in parallel and they delete each other's output mid-read.

`test/fixtures/landra-dom.js` records the *link structure* of the six embeds —
classes and hrefs, no article copy — so the suite still runs offline. The live
and e2e suites skip themselves without a network.

The coverage guard in `test/live-embed.test.js` is the one to watch: it fails
if a live page grows a link that looks like a CTA but matches none of our
rules. That is the early warning for Jane adding a CTA with a new class.
