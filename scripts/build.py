#!/usr/bin/env python3
"""Build the Humanify It directory into tools/index.html (standard library only).

Usage: python3 scripts/build.py [--check]

Reads data/tools.csv, data/trades.json and data/tool-of-the-week.json and
rewrites the parts of tools/index.html between the build marker comments:

  <!-- build:totw:start --> ... <!-- build:totw:end -->
  <!-- build:directory:start --> ... <!-- build:directory:end -->
  <!-- build:trades:start --> ... <!-- build:trades:end -->

It applies the hero copy in data/site.json to the homepage (index.html),
writes newsletter/tool-of-the-week.html (inline styles, for pasting into
beehiiv) and newsletter/tool-of-the-week.md, and sets <lastmod> in
sitemap.xml to today for / or /tools/ when that page changes.

Tools with listing "on-request" (demo-only, no public price) are folded under
a collapsed "Bigger firms, price on request" heading in their trade group.
The phase 1 pages (/fit/, /kit/, /guides/ and so on) are built separately by
scripts/build_pages.mjs.

Only tools whose status is ok, blocked, timeout or error are listed. Tools
marked dead, affiliate, rejected or hidden, or never checked, are left off.
--check exits non-zero if the build would change any file (for CI or review).
"""
import argparse
import datetime
import json
import os
import re
import sys
from html import escape

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import toolslib as T  # noqa: E402

LISTABLE = {"ok", "blocked", "timeout", "error"}
SITE = "https://humanifyit.ai/"
INDEX = os.path.join(T.ROOT, "index.html")          # homepage: site.json copy only
TOOLS = os.path.join(T.ROOT, "tools", "index.html")  # the directory
SITEMAP = os.path.join(T.ROOT, "sitemap.xml")
NEWS_DIR = os.path.join(T.ROOT, "newsletter")
SITE_JSON = os.path.join(T.DATA, "site.json")


def apply_site_copy(page):
    """Set <title> and og/twitter titles (all the same), the meta/og/twitter descriptions (all the same), the H1 and the hero subhead
    from data/site.json, so hero copy lives in data and survives rebuilds."""
    if not os.path.exists(SITE_JSON):
        return page
    with open(SITE_JSON, encoding="utf-8") as f:
        c = json.load(f)
    if len(c["title"]) >= 65:
        sys.exit("site.json title must be under 65 characters (%d)" % len(c["title"]))
    if len(c["description"]) >= 160:
        sys.exit("site.json description must be under 160 characters (%d)" % len(c["description"]))
    subs = [
        (r"<title>[^<]*</title>", "<title>%s</title>" % e(c["title"])),
        (r'<meta name="description" content="[^"]*">', '<meta name="description" content="%s">' % e(c["description"])),
        (r'<meta property="og:description" content="[^"]*">', '<meta property="og:description" content="%s">' % e(c["description"])),
        (r'<meta name="twitter:description" content="[^"]*">', '<meta name="twitter:description" content="%s">' % e(c["description"])),
        (r'<meta property="og:title" content="[^"]*">', '<meta property="og:title" content="%s">' % e(c["title"])),
        (r'<meta name="twitter:title" content="[^"]*">', '<meta name="twitter:title" content="%s">' % e(c["title"])),
        (r'<h1 id="headline">[^<]*</h1>', '<h1 id="headline">%s</h1>' % e(c["h1"])),
        (r'<p class="lede">[^<]*</p>', '<p class="lede">%s</p>' % e(c["subhead"])),
    ]
    for pat, rep in subs:
        page, n = re.subn(pat, lambda m: rep, page, count=1)
        if n != 1:
            sys.exit("couldn't find %s in index.html" % pat)
    return page


def e(s):
    return escape(s or "", quote=True)


def nice_date(iso):
    try:
        d = datetime.date.fromisoformat(iso)
    except ValueError:
        return None
    return "%d %s %d" % (d.day, d.strftime("%b"), d.year)


def load():
    trades = T.load_trades()
    rows = T.read_tools()
    tools, skipped = [], []
    for r in rows:
        if r["status"] not in LISTABLE:
            skipped.append("%s (status: %s)" % (r["name"], r["status"] or "not checked"))
            continue
        clean, stripped, reasons = T.clean_url(r["url"])
        if not clean or reasons:
            skipped.append("%s (URL problem: %s)" % (r["name"], "; ".join(reasons) or "invalid"))
            continue
        if r["price_kind"] not in T.PRICE_KINDS:
            skipped.append("%s (price_kind %r not one of %s)" % (r["name"], r["price_kind"], ", ".join(T.PRICE_KINDS)))
            continue
        if r["price_kind"] == "approx" and not re.search(r"\bapprox\. £[\d.,]+.*\(checked [^)]+\)", r["uk_price"]):
            skipped.append("%s (approx price must read like 'approx. £12/month (checked 20 Oct)')" % r["name"])
            continue
        if r["price_kind"] != "vendor" and not r["uk_price"]:
            skipped.append("%s (no price; set price_kind to vendor)" % r["name"])
            continue
        if r["pricing_url"]:
            pclean, _, preasons = T.clean_url(r["pricing_url"])
            r["pricing_url"] = "" if (preasons or not pclean) else pclean
        r = dict(r, url=clean)
        r["slugs"] = T.match_trades(r["trade"], trades)
        r["free"] = T.free_tier_label(r["free_tier"])
        tools.append(r)
    return trades, tools, skipped


def group_tools(trades, tools):
    """Ordered list of (slug, name, [tools]) for trades with at least one tool."""
    known = {t["slug"]: t for t in trades}
    tail = ["any-business", "for-the-owner"]  # always last, in this order
    order = [t["slug"] for t in trades if t["slug"] not in tail]
    extras = {}
    for slug in tool_slugs_extra(tools):
        extras.setdefault(slug, slug[2:].replace("-", " ").capitalize())
    order += sorted(extras, key=lambda s: extras[s].lower()) + tail
    groups = []
    for slug in order:
        members = sorted([t for t in tools if slug in t["slugs"]], key=lambda t: t["name"].lower())
        if members:
            name = known[slug]["name"] if slug in known else extras[slug]
            groups.append((slug, name, members))
    return groups


def tool_slugs_extra(tools):
    return [s for t in tools for s in t["slugs"] if s.startswith("x-")]


def anchor(slug):
    return "trade-" + (slug[2:] if slug.startswith("x-") else slug)


def price_html(t, style=""):
    """Price as shown on the page, following data/tools.csv price_kind."""
    link = t.get("pricing_url") or ""
    sty = (' style="%s"' % style) if style else ""
    if t["price_kind"] == "vendor":
        return '<a href="%s" rel="noopener" target="_blank"%s>See price on vendor site<span class="vh"> (opens in a new tab)</span></a>' % (
            e(link or t["url"]), sty) if not style else '<a href="%s"%s>See price on vendor site</a>' % (e(link or t["url"]), sty)
    text = t["uk_price"]
    dated = price_date_suffix(t)
    if not link:
        return e(text) + dated
    if style:
        return '<a href="%s"%s>%s</a>%s' % (e(link), sty, e(text), dated)
    return '<a href="%s" rel="noopener" target="_blank">%s<span class="vh"> (pricing, opens in a new tab)</span></a>%s' % (e(link), e(text), dated)


def price_date_suffix(t):
    """' (checked 20 Oct)' for GBP prices, from price_checked, else the last
    successful link check. Converted ('approx') prices carry their own date in
    the text, and vendor-site cards have no number, so neither gets one."""
    if t["price_kind"] != "gbp" or "(checked " in t["uk_price"]:
        return ""
    for iso in (t.get("price_checked"), t.get("last_checked")):
        try:
            d = datetime.date.fromisoformat(iso or "")
        except ValueError:
            continue
        return " (checked %d %s)" % (d.day, d.strftime("%b"))
    return ""


def price_text(t):
    return "See price on vendor site" if t["price_kind"] == "vendor" else t["uk_price"] + price_date_suffix(t)


def render_listing(t):
    checked = nice_date(t["last_checked"])
    checked_html = ('<time datetime="%s">%s</time>' % (e(t["last_checked"]), e(checked))
                    if checked else "not yet confirmed")
    own = t["own_product"].lower() == "yes"
    facts = ['    <li><span class="k">UK price:</span> %s</li>' % price_html(t)]
    if t["free"]:
        facts.append('    <li><span class="k">Free tier:</span> %s</li>' % e(t["free"]))
    facts.append('    <li><span class="k">Last checked:</span> %s</li>' % checked_html)
    return (
        '<li class="listing%s">\n'
        '%s'
        '  <h4><a href="%s" rel="noopener" target="_blank">%s<span class="vh"> (opens in a new tab)</span></a></h4>\n'
        '  <p>%s</p>\n'
        '%s'
        '  <ul class="facts">\n%s\n  </ul>\n'
        '</li>' % (" own" if own else "",
                   '  <p class="own-badge">Our own product</p>\n' if own else "",
                   e(t["url"]), e(t["name"]), e(t["one_liner"]),
                   ('  <p class="note">%s</p>\n' % e(t["public_note"])) if t["public_note"] else "",
                   "\n".join(facts)))


def render_directory(groups, total, known_intro=None):
    known_intro = known_intro or {}
    chips = ['<button type="button" class="chip" data-filter="all" aria-pressed="true">All <span class="n">(%d)</span></button>' % total]
    jumps = []
    for slug, name, members in groups:
        chips.append('<button type="button" class="chip" data-filter="%s" aria-pressed="false">%s <span class="n">(%d)</span></button>'
                     % (e(anchor(slug)), e(name), len(members)))
        jumps.append('<li><a href="#%s">%s (%d)</a></li>' % (e(anchor(slug)), e(name), len(members)))
    out = [
        '<div class="filter" role="group" aria-label="Show tools for" hidden>',
        "  " + "\n  ".join(chips),
        "</div>",
        '<p class="vh" id="filter-status" aria-live="polite"></p>',
        '<nav class="jump" aria-label="Jump to a trade"><p class="small">Jump to a trade:</p><ul>',
        "  " + "\n  ".join(jumps),
        "</ul></nav>",
    ]
    for slug, name, members in groups:
        a = anchor(slug)
        out.append('<section class="group" id="%s" data-trade="%s" aria-labelledby="%s-h">' % (e(a), e(a), e(a)))
        out.append('<h3 id="%s-h">%s <span class="n">(%d %s)</span></h3>'
                   % (e(a), e(name), len(members), "tool" if len(members) == 1 else "tools"))
        intro = known_intro.get(slug)
        if intro:
            out.append('<p class="group-intro">%s</p>' % e(intro))
        main = [t for t in members if t.get("listing") != "on-request"]
        folded = [t for t in members if t.get("listing") == "on-request"]
        if main:
            out.append('<ul class="listings">')
            out.extend(render_listing(t) for t in main)
            out.append("</ul>")
        if folded:
            out.append('<details class="fold">')
            out.append('<summary>Bigger firms, price on request <span class="n">(%d)</span></summary>' % len(folded))
            out.append('<p class="small">These don\'t publish a price. You book a demo or contact their sales team to get one.</p>')
            out.append('<ul class="listings">')
            out.extend(render_listing(t) for t in folded)
            out.append("</ul>")
            out.append("</details>")
        out.append("</section>")
    return "\n".join(out)


def render_tiles(trades, groups):
    counts = {slug: len(m) for slug, _, m in groups}
    out = ['<ul class="grid">']
    for t in trades:
        if t.get("listing_only"):
            continue
        n = counts.get(t["slug"], 0)
        badge = ('<span class="soon">Coming soon</span>' if not n else
                 '<span class="live">%d listed</span>' % n)
        out.append('<li class="tile">')
        out.append("  <h3>%s %s</h3>" % (e(t["name"]), badge))
        out.append('  <p class="who">%s</p>' % e(t["who"]))
        if t["examples"]:
            out.append("  <ul>")
            out.extend("    <li>%s</li>" % e(x) for x in t["examples"])
            out.append("  </ul>")
        if n:
            out.append('  <p class="more"><a href="#%s">See %d %s for %s</a></p>'
                       % (e(anchor(t["slug"])), n, "tool" if n == 1 else "tools",
                          e(t["name"].lower()[4:] if t["name"].lower().startswith("for ") else t["name"].lower())))
        out.append("</li>")
    out.append("</ul>")
    return "\n".join(out)


def pick_totw(tools, groups):
    with open(T.TOTW_JSON, encoding="utf-8") as f:
        cfg = json.load(f)
    match = [t for t in tools if t["name"].lower() == cfg["name"].strip().lower()]
    if not match:
        sys.exit("tool-of-the-week.json names %r, which isn't a listed tool" % cfg["name"])
    tool = match[0]
    names = {slug: name for slug, name, _ in groups}
    tool["group_slugs"] = [s for s in tool["slugs"] if s in names]
    tool["group_names"] = [names[s] for s in tool["group_slugs"]]
    return cfg, tool


def render_totw(cfg, tool):
    under = ", ".join('<a href="#%s">%s</a>' % (e(anchor(slug)), e(name))
                      for slug, name in zip(tool["group_slugs"], tool["group_names"]))
    return (
        '<aside class="totw" aria-labelledby="totw-h">\n'
        '  <p class="eyebrow">Tool of the week</p>\n'
        '  <h2 id="totw-h"><a href="%s" rel="noopener" target="_blank">%s<span class="vh"> (opens in a new tab)</span></a></h2>\n'
        '  <p>%s</p>\n'
        '  <p class="small">UK price: %s · Free tier: %s · Listed under: %s</p>\n'
        '</aside>' % (e(tool["url"]), e(tool["name"]), e(cfg["write_up"]),
                      price_html(tool), e(tool["free"]), under))


def render_newsletter(cfg, tool):
    link = SITE + "tools/#" + anchor(tool["slugs"][0])
    html = (
        '<!-- Humanify It: tool of the week. Paste into beehiiv as an HTML block. -->\n'
        '<div style="border:1px solid #e3e0d8;border-radius:12px;padding:20px;background:#ffffff;'
        'font-family:Arial,Helvetica,sans-serif;color:#1d2433;line-height:1.5;max-width:560px;">\n'
        '  <p style="margin:0 0 8px;font-size:13px;font-weight:bold;letter-spacing:0.04em;'
        'text-transform:uppercase;color:#0b5d4b;">Tool of the week</p>\n'
        '  <p style="margin:0 0 8px;font-size:20px;font-weight:bold;">'
        '<a href="%s" style="color:#0b5d4b;text-decoration:underline;">%s</a></p>\n'
        '  <p style="margin:0 0 12px;font-size:16px;">%s</p>\n'
        '  <p style="margin:0 0 12px;font-size:14px;color:#4a5466;">UK price: %s &middot; Free tier: %s'
        ' &middot; Listed under: %s</p>\n'
        '  <p style="margin:0;font-size:14px;">'
        '<a href="%s" style="color:#0b5d4b;">See more tools for your trade on Humanify It</a></p>\n'
        '  <p style="margin:12px 0 0;font-size:12px;color:#4a5466;">Every tool is reviewed before '
        "it's listed. We don't take payment for listings or use affiliate links.</p>\n"
        '</div>\n' % (e(tool["url"]), e(tool["name"]), e(cfg["write_up"]),
                      price_html(tool, "color:#0b5d4b;"), e(tool["free"]),
                      e(", ".join(tool["group_names"])), e(link)))

    def md(s):
        return re.sub(r"([\\`*_\[\]<>#|])", r"\\\1", s or "")
    mdtext = (
        "**Tool of the week: [%s](%s)**\n\n%s\n\n"
        "UK price: %s · Free tier: %s · Listed under: %s\n\n"
        "[See more tools for your trade on Humanify It](%s)\n\n"
        "_Every tool is reviewed before it's listed. We don't take payment for listings or use affiliate links._\n"
        % (md(tool["name"]), tool["url"], md(cfg["write_up"]), "[%s](%s)" % (md(price_text(tool)), tool["pricing_url"] or tool["url"]) if (tool["price_kind"] == "vendor" or tool["pricing_url"]) else md(price_text(tool)),
           tool["free"], md(", ".join(tool["group_names"])), link))
    return html, mdtext


def replace_block(text, name, content):
    pat = re.compile(r"(<!-- build:%s:start -->)(.*?)(<!-- build:%s:end -->)" % (name, name), re.S)
    if not pat.search(text):
        sys.exit("marker build:%s not found in tools/index.html" % name)
    return pat.sub(lambda m: m.group(1) + "\n" + content + "\n" + m.group(3), text, count=1)


def write_if_changed(path, content, check, changed):
    old = open(path, encoding="utf-8").read() if os.path.exists(path) else None
    if old != content:
        changed.append(os.path.relpath(path, T.ROOT))
        if not check:
            with open(path, "w", encoding="utf-8") as f:
                f.write(content)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true")
    a = ap.parse_args()

    trades, tools, skipped = load()
    if not tools:
        sys.exit("no listable tools in data/tools.csv; run scripts/check_links.py first")
    groups = group_tools(trades, tools)
    cfg, totw = pick_totw(tools, groups)

    home = open(INDEX, encoding="utf-8").read()
    page = open(TOOLS, encoding="utf-8").read()
    new = replace_block(page, "totw", render_totw(cfg, totw))
    new = replace_block(new, "directory", render_directory(groups, len(tools), {t["slug"]: t["intro"] for t in trades if t.get("intro")}))
    new = replace_block(new, "trades", render_tiles(trades, groups))
    new = re.sub(r"(<!-- build:count -->)\d*(<!-- /build:count -->)", r"\g<1>%d\g<2>" % len(tools), new)

    changed = []
    home = re.sub(r"(<!-- build:count -->)\d*(<!-- /build:count -->)", r"\g<1>%d\g<2>" % len(tools), apply_site_copy(home))
    write_if_changed(INDEX, home, a.check, changed)
    write_if_changed(TOOLS, new, a.check, changed)
    nh, nm = render_newsletter(cfg, totw)
    os.makedirs(NEWS_DIR, exist_ok=True)
    write_if_changed(os.path.join(NEWS_DIR, "tool-of-the-week.html"), nh, a.check, changed)
    write_if_changed(os.path.join(NEWS_DIR, "tool-of-the-week.md"), nm, a.check, changed)
    pages = [(f, loc) for f, loc in (("index.html", ""), (os.path.join("tools", "index.html"), "tools/")) if f in changed]
    if pages and os.path.exists(SITEMAP):
        sm = open(SITEMAP, encoding="utf-8").read()
        today = datetime.date.today().isoformat()
        sm2 = sm
        for _, loc in pages:
            sm2 = re.sub(r"(<loc>https://humanifyit\.ai/%s</loc><lastmod>)[^<]*(</lastmod>)" % re.escape(loc),
                         r"\g<1>%s\g<2>" % today, sm2)
        write_if_changed(SITEMAP, sm2, a.check, changed)

    print("Listed %d tools in %d groups:" % (len(tools), len(groups)))
    for slug, name, members in groups:
        print("  %-16s %d" % (name, len(members)))
    if skipped:
        print("Left off (%d):" % len(skipped))
        for s in skipped:
            print("  -", s)
    print("Tool of the week:", totw["name"])
    print(("Would change: " if a.check else "Changed: ") + (", ".join(changed) or "nothing"))
    if a.check and changed:
        sys.exit(1)


if __name__ == "__main__":
    main()
