# Neal Pottery website

A static site for Neal Pottery (Greg & Amy Neal). The Shop page shows live listings from the [nealpottery Etsy shop](https://www.etsy.com/shop/nealpottery), and buyers check out on Etsy.

## How it works

- `scripts/fetch-etsy.mjs` pulls active listings, sections and shop stats from the Etsy Open API v3 into `data/listings.json`. Without `ETSY_API_KEY` it uses `data/listings.seed.json`.
- `scripts/build.mjs` stitches `src/partials` into `src/pages` and renders products and shows into `dist/`.
- `.github/workflows/refresh-etsy.yml` triggers a Netlify rebuild every morning, so new and sold-out listings update on their own.

## Editing

- **Art shows:** edit `data/shows.json`. Past shows drop off automatically.
- **Copy:** edit the pages in `src/pages/`.
- **Photos:** placeholder vessel drawings show until Etsy photos load. Swap in studio photos for the hero and the about page under `public/img/`.

## Setup

1. Create an Etsy app at https://www.etsy.com/developers/register and copy the key (keystring, or `keystring:shared_secret`).
2. Connect this repo to Netlify. Build command `npm run build`, publish directory `dist` (already set in `netlify.toml`).
3. In Netlify, add the env var `ETSY_API_KEY`. Create a build hook and save it as the `NETLIFY_BUILD_HOOK` repo secret on GitHub.
4. Point nealpottery.com at Netlify from GoDaddy DNS.

Local preview: `npm run dev`.
