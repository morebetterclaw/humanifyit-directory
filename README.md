# Humanify It: demand-test page

A single static page testing interest in a plain-English directory of AI tools for UK small businesses, sorted by trade and role. Destined for https://humanifyit.ai/.

- `index.html`: landing page. The email sign-up is a plain GET form to the Sutra and Signal beehiiv subscribe page, with `utm_source=humanifyit` and `utm_medium=directory-test`.
- Vendor "List your tool" form posts to FormSubmit, which emails the team inbox.
- `privacy.html`: privacy note. `thanks.html`: vendor form thank-you page.
- Analytics: Cloudflare Web Analytics placeholder (commented out) at the bottom of `index.html`. Needs a site token.

No build step. No secrets. Do not add a `CNAME` file until the domain switch is approved.
