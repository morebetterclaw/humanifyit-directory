# Moderation: "List your tool" submissions

Nothing submitted through the form goes live automatically. Every tool is checked by a person before it's listed.

## 1. A submission arrives

- The "List your tool" form on https://humanifyit.ai/ posts to FormSubmit (`https://formsubmit.co/68da7f36a955074d31e03a22f4140081`).
- FormSubmit emails it to Daksh's inbox, **morebetterstudios@agentmail.to**, with the subject **`[Humanify It] Tool submission for review`**. It contains the sender's name and email, the tool name and the tool's website.
- The sender gets an automatic reply from FormSubmit (`_autoresponse`) saying a person reviews every submission before anything is listed and there's no fee. FormSubmit only sends this when its reCAPTCHA is left on, so don't add `_captcha=false` to the form.

## 2. Daksh checks it

Approve only if all of these are true:

- [ ] It's a real, working tool (the site loads and the product exists).
- [ ] It's relevant to UK small businesses, and fits at least one trade or role, or "Any business".
- [ ] It has a clear UK price, or a free tier, stated on its own site.
- [ ] The link is the tool's plain homepage: no affiliate, referral or tracking link. We don't take payment for listings.

If any are missing, reply to the sender or ignore it. Nothing happens until Daksh approves.

## 3. If approved, Daksh asks Tvashtha to add it

Send Tvashtha: tool name, homepage URL, trade(s), a one-line description in plain English, the UK price as the tool states it, and whether there's a free tier.

## 4. Tvashtha adds it

```sh
git pull
python3 scripts/add_tool.py --name "Tool" --url "https://example.com" \
  --trade "Salons; Physios" --one-liner "What it does, in one line." \
  --uk-price "Free; paid plans from £10 a month" --free-tier yes \
  --pricing-url "https://example.com/pricing" [--price-kind gbp|approx|vendor] \
  --notes "Approved by Daksh, <date>"
python3 scripts/check_links.py --only "Tool"   # sets status and last_checked
python3 scripts/build.py                       # rewrites index.html, newsletter snippet, sitemap
git add -A && git commit -m "Add Tool to the directory" && git push
```

`add_tool.py` strips tracking parameters and refuses affiliate-looking URLs. A new row has no status until `check_links.py` runs, so it can't be listed before its link is checked. GitHub Pages rebuilds from `main` and the change is usually live in about a minute.

## Removing or hiding a tool

Set its `status` in `data/tools.csv` to `hidden` (or `rejected`), run `python3 scripts/build.py`, commit and push.

## Link statuses (`data/tools.csv`)

| status    | meaning                                              | listed? |
|-----------|------------------------------------------------------|---------|
| ok        | site answered; `last_checked` set to that day        | yes     |
| blocked   | 403 or 429, the site refuses automated checks        | yes     |
| timeout   | no answer in time                                    | yes     |
| error     | other problem (5xx, TLS)                             | yes     |
| dead      | 404, 410 or the domain doesn't exist                 | no      |
| affiliate | URL looks like an affiliate or referral link         | no      |
| hidden / rejected | taken down by hand                           | no      |
| (blank)   | not checked yet                                      | no      |

The "Last checked" date on the page is the date of the last successful check. Re-run `check_links.py` and `build.py` now and then to refresh it.

## Tool of the week

Edit `data/tool-of-the-week.json` (the `name` must match a listed tool; keep the write-up to what the CSV says), run `python3 scripts/build.py`, and commit. Paste `newsletter/tool-of-the-week.html` into beehiiv as an HTML block, or use `newsletter/tool-of-the-week.md`.
