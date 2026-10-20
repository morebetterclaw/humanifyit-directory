# Humanify It: AI tools for UK small businesses

Static site for https://humanifyit.ai/, served by GitHub Pages from `main` (repo root). `CNAME` sets the custom domain: don't remove it.

- `index.html`: the homepage (hero copy from `data/site.json`, quiz button, free-guide tiles, honesty strip). Old `/#trade-*` links are sent on to `/tools/`.
- `tools/index.html`: the directory. Parts between `<!-- build:... -->` markers are generated; edit the data, not the HTML.
- `data/tools.csv`: the listings (name, url, trade, one_liner, uk_price, free_tier, last_checked, status, notes, listing). `listing=on-request` folds a demo-only tool under "Bigger firms, price on request".
- `data/fit.json`: the "Get fitted" quiz data and rules (tools, prices, kits, guides). `data/guides.json`: the free guides' content and sources.
- `js/fit.js`: quiz and kit logic (runs in the browser and in Node). `js/stale-banner.js`: "may be out of date" banner after 90 days. `js/copy-card.js`: copy button on `/measurements/`.
- `data/trades.json`: trades, their tiles and the words used to match the CSV's trade column.
- `data/tool-of-the-week.json`: this week's pick and write-up.
- `scripts/` (Python 3, standard library only):
  - `import_seed.py seed.csv`: clean a research seed file into `data/tools.csv` (maps headers, strips tracking parameters, flags affiliate links).
  - `check_links.py`: check every tool URL and record `status` and `last_checked`.
  - `build.py`: write listings, filter, tiles and tool of the week into `tools/index.html`; apply `site.json` to `index.html`; write `newsletter/tool-of-the-week.html` and `.md`; update `sitemap.xml`.
  - `add_tool.py`: append one approved tool. See `MODERATION.md`.
- `scripts/build_pages.mjs` (Node, no packages): build `/fit/`, the 9 `/kit/` pages, the `/guides/` pages, `/measurements/`, the 6 `/preorder/` pages and `sitemap.xml` from `data/fit.json` and `data/guides.json`. `--check` exits 1 if anything would change.
- `scripts/test_fit.mjs`: unit tests for the quiz rules. Run `node --test scripts/test_fit.mjs`.
- Quiz privacy: answers stay in page memory and the URL hash (never sent anywhere). No cookies, no storage, no fetches; `fit.json` is inlined into each page.
- Pre-order pages: no payment code. Each is the beehiiv GET form with `utm_medium=preorder&utm_campaign=preorder-<trade>-<price>`.
- `directory.js`: the per-trade filter. Without JavaScript every listing shows, with anchor links per trade.
- Sign-up: GET form to the Sutra and Signal beehiiv subscribe page, tagged `utm_source=humanifyit`, `utm_medium=directory-test`.
- Vendor form: FormSubmit, emails the team inbox. Analytics: Cloudflare Web Analytics (cookie-free).

Rules: no paid services, no affiliate links, no invented stats, no testimonials. No secrets in this repo.
