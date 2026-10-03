# Hosts and frameworks

Two things go on the site: the **loader** in the page head, and the **small
function** the overlay talks to.

## The loader

Copy `assets/overlay/loader.html` into the `<head>` of every page, before
other scripts. Set `ENDPOINT` (where the function answers) and `SCRIPT` (the
overlay: the pinned CDN copy, or the site's own copy of
`assets/overlay/pointtoship.js`). Visitors only ever run its few lines.

| Project | Where the head is |
| --- | --- |
| Next.js, App Router | `app/layout` (or `src/app/layout`): `<head><script dangerouslySetInnerHTML={{ __html: LOADER }} /></head>` |
| Next.js, Pages Router | `pages/_document`: same, inside `<Head>` |
| Astro | the base layout: `<script is:inline>...</script>` in `<head>` |
| SvelteKit | `src/app.html` |
| Nuxt | `nuxt.config`: `app.head.script: [{ innerHTML: LOADER, tagPosition: "head" }]` |
| Remix, React Router | `app/root`: inside `<head>` |
| Vite, plain SPA, static HTML | `index.html`, or every HTML file |
| Hugo, Jekyll, Eleventy, other generators | the base layout or head partial |
| WordPress | the theme's `header.php` before `wp_head()`, or a small plugin on `wp_head` |
| Shopify | `layout/theme.liquid` |
| Webflow, Squarespace, Wix and similar | the site-wide custom code field for the head |

If the site sends a Content-Security-Policy, add the loader's hash (or a
nonce) to `script-src`, the overlay's origin to `script-src`, and the
function's origin to `connect-src`.

## The function

`assets/hosts/README.md` lists one template per framework and host, and the
environment variables. Choose by where the site runs:

| The site | The function |
| --- | --- |
| Next.js, Astro, SvelteKit, Nuxt, Remix with a server | the framework's route template, deployed with the site |
| Any site on Vercel | `vercel-function.js` in `api/` |
| Any site on Netlify | `netlify-function.mjs` |
| Any site on Cloudflare Pages | `cloudflare-pages-function.js` |
| A Node server (Express, Fastify, Koa) | `lib/pointtoship-node.mjs` as middleware |
| Deno, Bun | `deno-bun.md` |
| Static hosting with no functions (GitHub Pages, GitLab Pages, S3, plain servers), or a site on PHP, Python, Ruby, Java, .NET | a separate `cloudflare-worker.js` (free plan is plenty), with `PTS_ORIGINS` set to the site's origin |

The function's files go in the repository; its secrets go in the host's
environment settings, never in the repository.

## Previews

Set `previews.url` in the config when the host builds a preview per branch.
The runner pushes risky changes to `pts/<issue>` and fills in `{branch}`
(lower case, characters other than letters, digits and `-` become `-`).

| Host | `previews.url` |
| --- | --- |
| Vercel | `https://PROJECT-git-{branch}-TEAM.vercel.app` |
| Netlify | `https://{branch}--SITE.netlify.app` (branch deploys on) |
| Cloudflare Pages | `https://{branch}.PROJECT.pages.dev` |
| Render | preview environments use generated names; leave previews off |
| Others | leave previews off |

## Source codes (optional)

When a framework can stamp elements with their source file and line at
build time, the pointer gets its strongest layer. Write the stamps as short
codes in `data-ps` and the table from code to file in
`.pointtoship/sources.json` (`{ "a3f9": "src/components/Card.tsx:14" }`).
Leave it out when it is not cheap; text search finds most things.
