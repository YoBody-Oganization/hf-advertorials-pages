import {
  GTM_ID,
  LANDRA_ASSET_ORIGIN,
  LANDRA_ORIGIN,
  LANDRA_RUNTIME,
  META_PIXEL_ID,
  SITE_ORIGIN,
  assetUrl,
} from './config.js'

const escapeText = (value) =>
  String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

const escapeAttribute = (value) => escapeText(value).replace(/"/g, '&quot;')

/**
 * The page shell.
 *
 * Deliberately almost nothing: no header, no footer, no frame, no fonts of
 * our own. Landra's stylesheet is scoped to `.landra-page-outer` and opens
 * with `all: revert` on everything inside it, so any chrome we added would be
 * both visible and unstyled. The advertorial should read as the whole page,
 * because it is.
 */
export function renderPage(page, { scriptPath, attributionPath }) {
  const canonical = `${SITE_ORIGIN}/${page.slug}`
  const title = escapeText(page.title)
  const titleAttribute = escapeAttribute(page.title)
  const description = (page.description || '').trim()

  const descriptionTags = description
    ? `
    <meta name="description" content="${escapeAttribute(description)}" />
    <meta property="og:description" content="${escapeAttribute(description)}" />`
    : ''

  return `<!doctype html>
<html lang="en" data-hf-presell="${escapeAttribute(page.slug)}">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />

    <title>${title}</title>${descriptionTags}
    <link rel="canonical" href="${escapeAttribute(canonical)}" />
    <meta property="og:type" content="article" />
    <meta property="og:title" content="${titleAttribute}" />
    <meta property="og:url" content="${escapeAttribute(canonical)}" />
    <meta property="og:site_name" content="Hormone Focus" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${titleAttribute}" />

    <!-- The article, its stylesheet, its fonts and its images all come from
         these two origins. Warming them is the whole of our head budget. -->
    <link rel="preconnect" href="${LANDRA_ORIGIN}" />
    <link rel="preconnect" href="${LANDRA_ASSET_ORIGIN}" />
    <link rel="preconnect" href="${LANDRA_ASSET_ORIGIN}" crossorigin />

    <!-- Landra live embed: the published stylesheet for this page. Served
         with a short max-age by Landra, so Jane's design changes land without
         a deploy here. -->
    <link rel="stylesheet" href="${escapeAttribute(assetUrl(page.embedId, 'css'))}" />

    <style>
      /* Landra live embed — reserve space until the page lands (released on error too) */
      [data-landra-embed]:not([data-landra-state]),
      [data-landra-embed][data-landra-state='loading'] {
        min-height: 60vh;
      }
      /* Match the Landra page background (--color-bg) so there is no flash
         before the article paints, and no band under a short one. */
      html {
        background: #fff;
        -webkit-text-size-adjust: 100%;
      }
      body {
        margin: 0;
      }
    </style>

    <script>
      /* presell_view — pushed before GTM boots so the container sees it on
         initialisation. One inline script in a static document: it cannot run
         twice, and the flag says so out loud. */
      window.dataLayer = window.dataLayer || [];
      if (!window.__hfPresellView) {
        window.__hfPresellView = true;
        window.dataLayer.push({
          event: 'presell_view',
          presell_slug: ${JSON.stringify(page.slug)}
        });
      }
    </script>

    <!-- Google Tag Manager -->
    <script>
      if (!window.__hfGtmInit) {
        window.__hfGtmInit = true;
        (function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
        new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
        j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
        'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
        })(window,document,'script','dataLayer',${JSON.stringify(GTM_ID)});
      }
    </script>
    <!-- End Google Tag Manager -->

    <!-- Meta Pixel -->
    <script>
      if (!window.__hfPixelInit) {
        window.__hfPixelInit = true;
        !function(f,b,e,v,n,t,s)
        {if(f.fbq)return;n=f.fbq=function(){n.callMethod?
        n.callMethod.apply(n,arguments):n.queue.push(arguments)};
        if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
        n.queue=[];t=b.createElement(e);t.async=!0;
        t.src=v;s=b.getElementsByTagName(e)[0];
        s.parentNode.insertBefore(t,s)}(window,document,'script',
        'https://connect.facebook.net/en_US/fbevents.js');
        fbq('init', ${JSON.stringify(META_PIXEL_ID)});
        /* Exactly one of each, per presell page view. Purchase belongs to
           Shopify, which reports into this same dataset. */
        fbq('track', 'PageView');
        fbq('track', 'ViewContent');
      }
    </script>
    <!-- End Meta Pixel -->

    <!-- Our CTA attribution. A module script is deferred, so it runs after the
         embed host is parsed; the modulepreload removes the import waterfall. -->
    <link rel="modulepreload" href="${escapeAttribute(attributionPath)}" />
    <script type="module" src="${escapeAttribute(scriptPath)}"></script>

    <!-- Landra live runtime. Exactly one per page, and the same content-hashed
         file for all six routes, so it is fetched once per visitor.
         MUST stay deferred: it reads document.currentScript on the synchronous
         pass and queries [data-landra-embed] once, so it has to execute after
         the host element below has been parsed. -->
    <script src="${escapeAttribute(LANDRA_RUNTIME)}" defer></script>
  </head>
  <body>
    <!-- Google Tag Manager (noscript) -->
    <noscript
      ><iframe
        src="https://www.googletagmanager.com/ns.html?id=${escapeAttribute(GTM_ID)}"
        height="0"
        width="0"
        style="display: none; visibility: hidden"
      ></iframe
    ></noscript>
    <!-- End Google Tag Manager (noscript) -->

    <!-- Meta Pixel (noscript) -->
    <noscript
      ><img
        height="1"
        width="1"
        style="display: none"
        alt=""
        src="https://www.facebook.com/tr?id=${escapeAttribute(META_PIXEL_ID)}&amp;ev=PageView&amp;noscript=1"
    /></noscript>
    <!-- End Meta Pixel (noscript) -->

    <div
      data-landra-embed="${escapeAttribute(page.embedId)}"
      data-landra-src="${escapeAttribute(assetUrl(page.embedId, 'html'))}"
    ></div>
  </body>
</html>
`
}

export default renderPage
