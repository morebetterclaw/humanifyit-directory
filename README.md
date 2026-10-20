# Humanify It: AI tools for UK small businesses

Static site for https://humanifyit.ai/, served by GitHub Pages from `main` (repo root). `CNAME` sets the custom domain: don't remove it.

- `index.html`: the page. Parts between `<!-- build:... -->` markers are generated; edit the data, not the HTML.
- `data/tools.csv`: the listings (name, url, trade, one_liner, uk_price, free_tier, last_checked, status, notes).
- `data/trades.json`: trades, their tiles and the words used to match the CSV's trade column.
- `data/tool-of-the-week.json`: this week's pick and write-up.
- `scripts/` (Python 3, standard library only):
  - `import_seed.py seed.csv`: clean a research seed file into `data/tools.csv` (maps headers, strips tracking parameters, flags affiliate links).
  - `check_links.py`: check every tool URL and record `status` and `last_checked`.
  - `build.py`: write listings, filter, tiles and tool of the week into `index.html`; write `newsletter/tool-of-the-week.html` and `.md`; update `sitemap.xml`.
  - `add_tool.py`: append one approved tool. See `MODERATION.md`.
- `directory.js`: the per-trade filter. Without JavaScript every listing shows, with anchor links per trade.
- Sign-up: GET form to the Sutra and Signal beehiiv subscribe page, tagged `utm_source=humanifyit`, `utm_medium=directory-test`.
- Vendor form: FormSubmit, emails the team inbox. Analytics: Cloudflare Web Analytics (cookie-free).

Rules: no paid services, no affiliate links, no invented stats, no testimonials. No secrets in this repo.
